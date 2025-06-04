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

export class ResponseExtractor {
  /**
   * 解析 response 标签内容
   */
  parseResponse(text: string): ParsedResponse | null {
    const responseMatch = text.match(/<response>([\s\S]*?)<\/response>/);
    if (!responseMatch) {
      return null; // 没有 response 标签时返回 null（这是正常的）
    }

    const responseContent = responseMatch[1];
    const message = this.extractSection(responseContent, 'message');
    
    // 如果没有 message 内容，也返回 null（这也是正常的）
    if (!message || !message.trim()) {
      return null;
    }
    
    return {
      message: message,
      action: this.extractSection(responseContent, 'action'),
      status: this.extractSection(responseContent, 'status')
    };
  }

  /**
   * 处理用户输入（之前 userInputContext 的职责）
   */
  processUserInput(input: string): UserInputContext {
    return {
      taskType: this.identifyTaskType(input),
      complexity: this.assessComplexity(input),
      requirements: this.extractRequirements(input)
    };
  }

  /**
   * 生成对话历史
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
   * 验证响应完整性
   */
  validateResponse(response: ParsedResponse | null): boolean {
    // response 是可选的，null 是有效的
    if (!response) return true;
    
    // 如果有 response，确保 message 不为空
    return !!(response.message && response.message.trim());
  }

  /**
   * 生成响应摘要
   */
  generateResponseSummary(response: ParsedResponse): string {
    return this.truncate(response.message || '', 150);
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`<${sectionName}>([\s\S]*?)<\/${sectionName}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }

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