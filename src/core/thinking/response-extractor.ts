import { XmlExtractor, ExtractionResult, createXmlExtractor } from './xml-extractor';
import { logger } from "../utils/logger";

export interface ParsedResponse {
  message?: string;
  // 未来可扩展更多响应类型
  action?: string;
  status?: string;
}

export interface UserInputContext {
  taskType: TaskType;
  complexity: 'low' | 'medium' | 'high';
  requirements: string[];
}

export type TaskType = 'coding' | 'planning' | 'analysis' | 'general';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface ResponseExtractionOptions {
  enableFallback?: boolean;
  minResponseLength?: number;
  allowPartialResponse?: boolean;
  extractFromPlainText?: boolean;
}

export class ResponseExtractor {
  private xmlExtractor: XmlExtractor;
  private options: ResponseExtractionOptions;

  constructor(options: ResponseExtractionOptions = {}) {
    this.xmlExtractor = createXmlExtractor({
      caseSensitive: false,
      preserveWhitespace: false,
      allowEmptyContent: false,
      fallbackToRegex: true
    });

    this.options = {
      enableFallback: false,
      minResponseLength: 3,
      allowPartialResponse: false,
      extractFromPlainText: false,
      ...options
    };
  }

  /**
   * 🎯 解析 response 标签内容
   * 严格的解析逻辑，只接受明确的结构化响应
   */
  parseResponse(text: string): ParsedResponse | null {
    if (!text || text.trim().length === 0) {
      logger.warn('ResponseExtractor: Empty text provided');
      return null;
    }

    try {
      // 1. 只尝试完整的 response 标签解析
      const responseResult = this.xmlExtractor.extract(text, 'response');
      if (!responseResult.success || !responseResult.content) {
        logger.info('ResponseExtractor: No response tag found');
        return null;
      }

      // 2. 解析 response 内容，必须有明确的结构
      const parsed = this.parseResponseContent(responseResult.content);
      
      // 3. 验证解析结果，必须有有效的 message
      if (this.isValidResponse(parsed)) {
        logger.info('ResponseExtractor: Successfully parsed structured response');
        return parsed;
      }

      // 4. 如果没有明确的 message 标签，检查 response 内容是否直接是消息
      if (this.isValidContent(responseResult.content)) {
        // 只有当内容看起来像是直接的消息时才接受
        if (this.looksLikeDirectMessage(responseResult.content)) {
          logger.info('ResponseExtractor: Using response content as direct message');
          return { message: responseResult.content };
        }
      }

      logger.warn('ResponseExtractor: Response tag found but no valid message content');
      return null;

    } catch (error) {
      logger.error('ResponseExtractor: Error parsing response:', error);
      return null;
    }
  }

  /**
   * 🔄 备选提取方案 - 移除，保持严格性
   */
  private tryFallbackExtraction(text: string): ParsedResponse | null {
    // 不再使用备选方案，保持严格的响应要求
    return null;
  }

  /**
   * 🔍 检查内容是否看起来像直接消息（无 XML 标签）
   */
  private looksLikeDirectMessage(content: string): boolean {
    // 不包含任何 XML 标签，且内容合理
    const hasXmlTags = /<[^>]+>/.test(content);
    if (hasXmlTags) {
      return false;
    }
    
    // 内容应该像是对用户的直接回复
    const messagePatterns = [
      /^(hi|hello|what|how|can|let|i)/i,
      /\?$/,  // 以问号结尾
      /^[A-Z].*[.!?]$/,  // 以大写字母开头，以标点结尾
    ];
    
    return messagePatterns.some(pattern => pattern.test(content.trim()));
  }

  /**
   * 📝 从纯文本中提取响应 - 移除此功能
   */
  private extractFromPlainText(text: string): ParsedResponse | null {
    // 不再从纯文本提取，保持严格要求
    return null;
  }

  /**
   * 🔍 解析 response 标签内的结构化内容
   */
  private parseResponseContent(responseContent: string): ParsedResponse {
    const results = this.xmlExtractor.extractMultiple(responseContent, [
      'message',
      'action', 
      'status'
    ]);

    return {
      message: results.message?.success ? results.message.content : undefined,
      action: results.action?.success ? results.action.content : undefined,
      status: results.status?.success ? results.status.content : undefined
    };
  }

  /**
   * ✅ 验证响应有效性
   */
  private isValidResponse(response: ParsedResponse): boolean {
    if (!response) return false;
    
    // 检查是否有 message 内容
    if (response.message && this.isValidContent(response.message)) {
      return true;
    }

    // 检查是否有其他有效字段
    if (response.action && this.isValidContent(response.action)) {
      return true;
    }

    if (response.status && this.isValidContent(response.status)) {
      return true;
    }

    return false;
  }

  /**
   * ✅ 验证内容有效性
   */
  private isValidContent(content: string): boolean {
    if (!content) return false;
    
    const trimmed = content.trim();
    if (trimmed.length < this.options.minResponseLength!) {
      return false;
    }

    // 检查是否只包含无意义的内容
    const meaninglessPatterns = [
      /^\.+$/,           // 只有点号
      /^-+$/,            // 只有短划线
      /^\s*ok\s*$/i,     // 只有 "ok"
      /^\s*yes\s*$/i,    // 只有 "yes"
      /^\s*no\s*$/i,     // 只有 "no"
    ];

    for (const pattern of meaninglessPatterns) {
      if (pattern.test(trimmed)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 🔧 处理用户输入（之前 userInputContext 的职责）
   */
  processUserInput(input: string): UserInputContext {
    return {
      taskType: this.identifyTaskType(input),
      complexity: this.assessComplexity(input),
      requirements: this.extractRequirements(input)
    };
  }

  /**
   * 📚 生成对话历史
   */
  buildConversationHistory(messages: ConversationMessage[]): string {
    if (messages.length === 0) return '';
    
    let history = '\n## Recent Conversation\n\n';
    
    const recentMessages = messages;
    
    for (const msg of recentMessages) {
      const timeStr = msg.timestamp.toISOString().substring(11, 19); // HH:MM:SS
      history += `**${msg.role}** (${timeStr}): ${msg.content}\n\n`;
    }
    
    return history;
  }

  /**
   * ✅ 验证响应完整性（增强版）
   */
  validateResponse(response: ParsedResponse | null): boolean {
    // null response 现在被认为是无效的，因为我们需要确保有响应
    if (!response) {
      logger.warn('ResponseExtractor: Response is null - this should be avoided');
      return false;
    }
    
    return this.isValidResponse(response);
  }

  /**
   * 📄 生成响应摘要
   */
  generateResponseSummary(response: ParsedResponse): string {
    if (response.message) {
      return this.truncate(response.message, 150);
    }
    
    if (response.action) {
      return `Action: ${this.truncate(response.action, 100)}`;
    }
    
    if (response.status) {
      return `Status: ${this.truncate(response.status, 100)}`;
    }
    
    return 'Empty response';
  }

  /**
   * 🛠️ 获取提取统计信息
   */
  getExtractionStats(text: string): Record<string, any> {
    const stats = this.xmlExtractor.getExtractionStats(text, [
      'response', 'message', 'action', 'status', 'thinking'
    ]);

    return {
      ...stats,
      textLength: text.length,
      hasXmlTags: /<[^>]+>/.test(text),
      hasResponseTag: text.includes('<response>'),
      hasMessageTag: text.includes('<message>')
    };
  }

  /**
   * 🔧 设置提取选项
   */
  setOptions(options: Partial<ResponseExtractionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  // === 私有辅助方法 ===

  private identifyTaskType(input: string): TaskType {
    const inputLower = input.toLowerCase();
    
    // 检查编程相关关键词
    const codingKeywords = ['code', 'script', 'program', 'function', 'class', 'debug', 'implement', 'refactor'];
    if (codingKeywords.some(keyword => inputLower.includes(keyword))) {
      return 'coding';
    }
    
    // 检查规划相关关键词
    const planningKeywords = ['plan', 'strategy', 'organize', 'schedule', 'roadmap', 'timeline', 'coordinate'];
    if (planningKeywords.some(keyword => inputLower.includes(keyword))) {
      return 'planning';
    }
    
    // 检查分析相关关键词
    const analysisKeywords = ['analyze', 'review', 'examine', 'evaluate', 'assess', 'study'];
    if (analysisKeywords.some(keyword => inputLower.includes(keyword))) {
      return 'analysis';
    }
    
    return 'general';
  }

  private assessComplexity(input: string): 'low' | 'medium' | 'high' {
    const wordCount = input.split(/\s+/).filter(word => word.length > 0).length;
    const hasMultipleSteps = /(?:step|phase|stage|\d+\.|\d+\))/i.test(input);
    const hasComplexRequirements = /(?:integrate|optimize|complex|advanced|multiple)/i.test(input);
    
    if (wordCount < 10 && !hasMultipleSteps && !hasComplexRequirements) {
      return 'low';
    }
    
    if (wordCount > 50 || hasMultipleSteps || hasComplexRequirements) {
      return 'high';
    }
    
    return 'medium';
  }

  private extractRequirements(input: string): string[] {
    // 简单的需求提取逻辑
    const requirements: string[] = [];
    
    // 按句号、逗号、分号分割
    const segments = input.split(/[。，,;；]/).map(req => req.trim()).filter(req => req.length > 3);
    
    // 提取明确的需求词
    for (const segment of segments) {
      if (/(?:需要|要求|必须|应该|希望|想要)/i.test(segment)) {
        requirements.push(segment);
      }
    }
    
    // 如果没有明确需求词，返回主要片段
    if (requirements.length === 0) {
      requirements.push(...segments.slice(0, 3)); // 最多取前3个片段
    }
    
    return requirements;
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
} 