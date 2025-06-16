import { ChatContext, ChatMessage, CompressionStrategy, ContextSummary } from '../interfaces';
import { logger } from '../utils/logger';

/**
 * 简化的 ChatContext 管理器
 * 专注于基本的消息管理和简单压缩
 */
export class ChatContextManager {
  private compressionStrategy: CompressionStrategy;

  constructor(compressionStrategy?: CompressionStrategy) {
    this.compressionStrategy = compressionStrategy || new DefaultCompressionStrategy();
  }

  /**
   * 创建空的 ChatContext
   */
  createChatContext(): ChatContext {
    return {
      fullHistory: [],
      optimizedContext: [],
      historySummaries: [],
      totalMessages: 0,
      compressionRatio: 1.0,
      lastOptimizedAt: Date.now()
    };
  }

  /**
   * 添加消息到 ChatContext
   */
  addMessage(chatContext: ChatContext, message: ChatMessage): ChatContext {
    const updatedContext = {
      ...chatContext,
      fullHistory: [...chatContext.fullHistory, message],
      optimizedContext: [...chatContext.optimizedContext, message],
      totalMessages: chatContext.totalMessages + 1,
      lastOptimizedAt: Date.now()
    };

    // 检查是否需要压缩
    if (this.compressionStrategy.shouldCompress(updatedContext)) {
      logger.info('ChatContext: 触发智能压缩');
      // 同步压缩（简化版本）
      return this.compressSync(updatedContext);
    }

    return updatedContext;
  }

  /**
   * 异步添加消息
   */
  async addMessageAsync(chatContext: ChatContext, message: ChatMessage): Promise<ChatContext> {
    const updatedContext = this.addMessage(chatContext, message);
    
    // 如果需要压缩，执行异步压缩
    if (this.compressionStrategy.shouldCompress(updatedContext)) {
      return await this.compressionStrategy.compress(updatedContext);
    }
    
    return updatedContext;
  }

  /**
   * 同步压缩（简化版本）
   */
  private compressSync(chatContext: ChatContext): ChatContext {
    const config = this.compressionStrategy.config;
    const recentMessages = chatContext.fullHistory.slice(-config.recentStepsWindow);
    
    // 简单压缩：保留最近消息，其他的创建摘要
    const oldMessages = chatContext.fullHistory.slice(0, -config.recentStepsWindow);
    
    if (oldMessages.length > 0) {
      const summary: ContextSummary = {
        stepRange: { start: 0, end: oldMessages.length - 1 },
        messageCount: oldMessages.length,
        summary: `Compressed ${oldMessages.length} messages`,
        keyTopics: [],
        importantDecisions: [],
        toolUsageSummary: {},
        timestamp: Date.now()
      };

      return {
        ...chatContext,
        optimizedContext: recentMessages,
        historySummaries: [...chatContext.historySummaries, summary],
        compressionRatio: recentMessages.length / chatContext.fullHistory.length,
        lastOptimizedAt: Date.now()
      };
    }

    return chatContext;
  }

  /**
   * 获取用于 prompt 的消息
   */
  getMessagesForPrompt(chatContext: ChatContext): ChatMessage[] {
    return chatContext.optimizedContext;
  }

  /**
   * 获取压缩统计信息
   */
  getCompressionStats(chatContext: ChatContext): {
    totalMessages: number;
    optimizedMessages: number;
    compressionRatio: number;
    summariesCount: number;
  } {
    return {
      totalMessages: chatContext.totalMessages,
      optimizedMessages: chatContext.optimizedContext.length,
      compressionRatio: chatContext.compressionRatio,
      summariesCount: chatContext.historySummaries.length
    };
  }
}

/**
 * 默认的压缩策略实现
 */
export class DefaultCompressionStrategy implements CompressionStrategy {
  config = {
    maxFullHistorySize: 100,       // 最大完整历史记录数
    maxOptimizedContextSize: 50,   // 最大优化上下文数
    recentStepsWindow: 20,         // 保留的最近步骤窗口
    summaryBatchSize: 30,          // 每批压缩的消息数
    preserveImportantSteps: true   // 是否保留重要步骤
  };

  constructor(config?: Partial<DefaultCompressionStrategy['config']>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  shouldCompress(chatContext: ChatContext): boolean {
    return chatContext.fullHistory.length > this.config.maxFullHistorySize ||
           chatContext.optimizedContext.length > this.config.maxOptimizedContextSize;
  }

  async compress(chatContext: ChatContext): Promise<ChatContext> {
    // 简化的异步压缩实现
    const recentMessages = chatContext.fullHistory.slice(-this.config.recentStepsWindow);
    const oldMessages = chatContext.fullHistory.slice(0, -this.config.recentStepsWindow);
    
    if (oldMessages.length > 0) {
      const summary: ContextSummary = {
        stepRange: { start: 0, end: oldMessages.length - 1 },
        messageCount: oldMessages.length,
        summary: `Compressed ${oldMessages.length} messages from steps 0-${oldMessages.length - 1}`,
        keyTopics: this.extractKeyTopics(oldMessages),
        importantDecisions: this.extractImportantDecisions(oldMessages),
        toolUsageSummary: this.extractToolUsage(oldMessages),
        timestamp: Date.now()
      };

      return {
        ...chatContext,
        optimizedContext: recentMessages,
        historySummaries: [...chatContext.historySummaries, summary],
        compressionRatio: recentMessages.length / chatContext.fullHistory.length,
        lastOptimizedAt: Date.now()
      };
    }

    return chatContext;
  }

  private extractKeyTopics(messages: ChatMessage[]): string[] {
    // 简化的主题提取
    const topics = new Set<string>();
    messages.forEach(msg => {
      if (msg.content.includes('file') || msg.content.includes('文件')) {
        topics.add('file_operations');
      }
      if (msg.content.includes('code') || msg.content.includes('代码')) {
        topics.add('code_development');
      }
      if (msg.content.includes('error') || msg.content.includes('错误')) {
        topics.add('error_handling');
      }
    });
    return Array.from(topics);
  }

  private extractImportantDecisions(messages: ChatMessage[]): string[] {
    // 简化的决策提取
    return messages
      .filter(msg => msg.role === 'agent' && msg.content.includes('决定') || msg.content.includes('选择'))
      .map(msg => msg.content.substring(0, 100))
      .slice(0, 5);
  }

  private extractToolUsage(messages: ChatMessage[]): Record<string, number> {
    // 简化的工具使用统计
    const toolUsage: Record<string, number> = {};
    messages.forEach(msg => {
      if (msg.content.includes('tool_call') || msg.content.includes('工具调用')) {
        toolUsage['general_tools'] = (toolUsage['general_tools'] || 0) + 1;
      }
    });
    return toolUsage;
  }
} 