import { XmlExtractor, ExtractionResult, createXmlExtractor } from './xml-extractor';
import { logger } from "../utils/logger";

export interface ParsedThinking {
  analysis: string;
  plan: string;
  reasoning: string;
  nextAction: string;
}

export interface DetailedPlan {
  steps: PlanStep[];
  dependencies: string[];
  timeline: Timeline;
}

export interface PlanStep {
  id: string;
  description: string;
  dependencies: string[];
  estimatedDuration?: number;
}

export interface Timeline {
  estimatedDuration: number;
  milestones: string[];
}

export interface ThinkingExtractionOptions {
  enableFallback?: boolean;
  allowPartialThinking?: boolean;
  minContentLength?: number;
  extractFromPlainText?: boolean;
}

export class ThinkingExtractor {
  private xmlExtractor: XmlExtractor;
  private options: ThinkingExtractionOptions;

  constructor(options: ThinkingExtractionOptions = {}) {
    this.xmlExtractor = createXmlExtractor({
      caseSensitive: false,
      preserveWhitespace: true, // 思考内容保留格式
      allowEmptyContent: true,
      fallbackToRegex: true
    });

    this.options = {
      enableFallback: true,
      allowPartialThinking: true,
      minContentLength: 3,
      extractFromPlainText: false, // 思考内容通常不从纯文本提取
      ...options
    };
  }

  /**
   * 🎯 解析 thinking 标签内容
   * 增强的解析逻辑，支持多种备选方案和容错处理
   */
  parseThinking(text: string): ParsedThinking | null {
    if (!text || text.trim().length === 0) {
      logger.warn('ThinkingExtractor: Empty text provided');
      return null;
    }

    try {
      // 1. 尝试完整的 thinking 标签解析
      const thinkingResult = this.xmlExtractor.extract(text, 'thinking');
      if (thinkingResult.success && thinkingResult.content) {
        const parsed = this.parseThinkingContent(thinkingResult.content);
        if (this.isValidThinking(parsed)) {
          return parsed;
        }
      }

      // 2. 如果启用备选方案，尝试其他提取方式
      if (this.options.enableFallback) {
        return this.tryFallbackExtraction(text);
      }

      // 3. 记录调试信息
      logger.warn('ThinkingExtractor: No valid thinking content found', {
        hasThinkingTag: text.includes('<thinking>'),
        textLength: text.length,
        textPreview: text.substring(0, 200)
      });

      return null;

    } catch (error) {
      logger.error('ThinkingExtractor: Error parsing thinking:', error);
      return null;
    }
  }

  /**
   * 🔄 备选提取方案
   */
  private tryFallbackExtraction(text: string): ParsedThinking | null {
    // 方案1: 尝试直接提取各个思考部分（无嵌套）
    const directResults = this.xmlExtractor.extractMultiple(text, [
      'analysis', 'plan', 'reasoning', 'next_action'
    ]);

    const directThinking = this.buildThinkingFromResults(directResults);
    if (this.isValidThinking(directThinking)) {
      logger.info('ThinkingExtractor: Extracted thinking from direct tags');
      return directThinking;
    }

    // 方案2: 尝试替代标签名
    const alternativeResults = this.xmlExtractor.extractMultiple(text, [
      'analyze', 'planning', 'thought', 'next'
    ]);

    if (Object.values(alternativeResults).some(r => r.success)) {
      const altThinking: ParsedThinking = {
        analysis: alternativeResults.analyze?.success ? alternativeResults.analyze.content : '',
        plan: alternativeResults.planning?.success ? alternativeResults.planning.content : '',
        reasoning: alternativeResults.thought?.success ? alternativeResults.thought.content : '',
        nextAction: alternativeResults.next?.success ? alternativeResults.next.content : ''
      };

      if (this.isValidThinking(altThinking)) {
        logger.info('ThinkingExtractor: Extracted thinking from alternative tags');
        return altThinking;
      }
    }

    // 方案3: 从纯文本中提取（如果启用）
    if (this.options.extractFromPlainText) {
      return this.extractFromPlainText(text);
    }

    return null;
  }

  /**
   * 📝 从纯文本中提取思考内容
   */
  private extractFromPlainText(text: string): ParsedThinking | null {
    // 移除其他 XML 标签，保留思考相关内容
    const cleanText = text
      .replace(/<response>[\s\S]*?<\/response>/gi, '') // 移除响应内容
      .replace(/<(?!\/?(thinking|analysis|plan|reasoning|next_action))[^>]+>/g, '') // 保留思考标签
      .trim();

    if (cleanText.length > this.options.minContentLength!) {
      logger.info('ThinkingExtractor: Attempting plain text extraction');
      
      // 简单的文本分析，尝试识别思考模式
      return {
        analysis: this.extractTextPattern(cleanText, ['分析', '分析：', 'analysis', 'analyze']),
        plan: this.extractTextPattern(cleanText, ['计划', '计划：', 'plan', 'planning']),
        reasoning: this.extractTextPattern(cleanText, ['推理', '思考', 'reasoning', 'thought']),
        nextAction: this.extractTextPattern(cleanText, ['下一步', '行动', 'next', 'action'])
      };
    }

    return null;
  }

  /**
   * 🔍 解析 thinking 标签内的结构化内容
   */
  private parseThinkingContent(thinkingContent: string): ParsedThinking {
    const results = this.xmlExtractor.extractMultiple(thinkingContent, [
      'analysis',
      'plan',
      'reasoning',
      'next_action'
    ]);

    return this.buildThinkingFromResults(results);
  }

  /**
   * 🏗️ 从提取结果构建思考对象
   */
  private buildThinkingFromResults(results: Record<string, ExtractionResult>): ParsedThinking {
    return {
      analysis: results.analysis?.success ? results.analysis.content : '',
      plan: results.plan?.success ? results.plan.content : '',
      reasoning: results.reasoning?.success ? results.reasoning.content : '',
      nextAction: results.next_action?.success ? results.next_action.content : ''
    };
  }

  /**
   * 🛠️ 提取文本模式
   */
  private extractTextPattern(text: string, patterns: string[]): string {
    for (const pattern of patterns) {
      const regex = new RegExp(`${pattern}[：:]?\\s*([^\n]+)`, 'i');
      const match = text.match(regex);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return '';
  }

  /**
   * ✅ 验证思考完整性（增强版）
   */
  validateThinking(thinking: ParsedThinking): boolean {
    return this.isValidThinking(thinking);
  }

  /**
   * ✅ 验证思考内容有效性
   */
  private isValidThinking(thinking: ParsedThinking): boolean {
    if (!thinking) return false;

    // 检查至少有一个字段有有效内容
    const validFields = [
      thinking.analysis,
      thinking.plan,
      thinking.reasoning,
      thinking.nextAction
    ].filter(field => this.isValidContent(field));

    const hasValidContent = validFields.length > 0;
    
    if (!hasValidContent && this.options.allowPartialThinking) {
      // 即使内容很少，也允许部分思考
      return validFields.length >= 1;
    }

    return hasValidContent;
  }

  /**
   * ✅ 验证单个内容字段
   */
  private isValidContent(content: string): boolean {
    if (!content) return false;
    
    const trimmed = content.trim();
    return trimmed.length >= this.options.minContentLength!;
  }

  /**
   * 📄 生成思考摘要
   */
  generateThinkingSummary(thinking: ParsedThinking): string {
    const parts: string[] = [];
    
    if (thinking.analysis) {
      parts.push(`Analysis: ${this.truncate(thinking.analysis, 50)}`);
    }
    
    if (thinking.plan) {
      parts.push(`Plan: ${this.truncate(thinking.plan, 50)}`);
    }
    
    if (thinking.reasoning) {
      parts.push(`Reasoning: ${this.truncate(thinking.reasoning, 50)}`);
    }
    
    if (thinking.nextAction) {
      parts.push(`Next: ${this.truncate(thinking.nextAction, 30)}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'Empty thinking';
  }

  /**
   * 🛠️ 获取提取统计信息
   */
  getExtractionStats(text: string): Record<string, any> {
    const stats = this.xmlExtractor.getExtractionStats(text, [
      'thinking', 'analysis', 'plan', 'reasoning', 'next_action'
    ]);

    return {
      ...stats,
      textLength: text.length,
      hasXmlTags: /<[^>]+>/.test(text),
      hasThinkingTag: text.includes('<thinking>'),
      hasAnyThinkingContent: ['analysis', 'plan', 'reasoning', 'next_action'].some(
        tag => text.includes(`<${tag}>`)
      )
    };
  }

  /**
   * 🔧 设置提取选项
   */
  setOptions(options: Partial<ThinkingExtractionOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * 🔍 详细计划解析（未来扩展功能）
   */
  parseDetailedPlan(planContent: string): DetailedPlan {
    // 可以解析更复杂的计划格式
    // 例如：依赖关系、时间估计、资源需求等
    return {
      steps: this.extractSteps(planContent),
      dependencies: this.extractDependencies(planContent),
      timeline: this.extractTimeline(planContent)
    };
  }

  // === 私有辅助方法 ===

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  private extractSteps(planContent: string): PlanStep[] {
    // 未来实现：解析计划步骤
    // 可以识别 "步骤1:", "Step 1:", "- " 等格式
    const steps: PlanStep[] = [];
    const stepMatches = planContent.match(/(?:步骤|Step)\s*(\d+)[：:]\s*([^\n]+)/gi);
    
    if (stepMatches) {
      stepMatches.forEach((match, index) => {
        const stepMatch = match.match(/(?:步骤|Step)\s*(\d+)[：:]\s*(.+)/i);
        if (stepMatch) {
          steps.push({
            id: `step-${stepMatch[1]}`,
            description: stepMatch[2].trim(),
            dependencies: index > 0 ? [`step-${index}`] : []
          });
        }
      });
    }
    
    return steps;
  }

  private extractDependencies(planContent: string): string[] {
    // 未来实现：提取依赖关系
    return [];
  }

  private extractTimeline(planContent: string): Timeline {
    // 未来实现：提取时间线信息
    return { estimatedDuration: 0, milestones: [] };
  }
} 