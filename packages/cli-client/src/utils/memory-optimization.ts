/**
 * 长上下文记录精简工具
 * 
 * 用于优化 AgentStep 和 ChatMessage 的历史记录，
 * 在长上下文情况下进行智能精简和合并
 */

export interface ChatMessageSummary {
  role: 'user' | 'agent' | 'system';
  content: string;
  step: number;
  timestamp: string;
  messageType?: 'summary' | 'original';
  originalCount?: number; // 如果是摘要，记录原始消息数量
}

export interface AgentStepSummary {
  stepIndex: number;
  summary: string;
  toolCallsCount: number;
  successfulToolCalls: number;
  finalAnswer?: string;
  originalSteps?: number; // 如果是合并步骤，记录原始步骤数量
}

export interface MemoryOptimizationOptions {
  // 基础配置
  maxChatMessages: number;        // 最大聊天消息数量
  maxAgentSteps: number;          // 最大 Agent 步骤数量
  
  // 精简策略
  enableChatSummary: boolean;     // 启用聊天摘要
  enableStepMerging: boolean;     // 启用步骤合并
  keepRecentMessages: number;     // 保留最近消息数量（不进行精简）
  keepRecentSteps: number;        // 保留最近步骤数量（不进行精简）
  
  // 摘要配置
  summaryRatio: number;           // 摘要比例（0.1 = 10:1 压缩）
  preserveImportantSteps: boolean; // 保留重要步骤（包含 finalAnswer 的步骤）
  preserveErrorSteps: boolean;     // 保留错误步骤
}

export const DEFAULT_OPTIMIZATION_OPTIONS: MemoryOptimizationOptions = {
  maxChatMessages: 50,
  maxAgentSteps: 20,
  enableChatSummary: true,
  enableStepMerging: true,
  keepRecentMessages: 10,
  keepRecentSteps: 5,
  summaryRatio: 0.3, // 3:1 压缩比例
  preserveImportantSteps: true,
  preserveErrorSteps: true
};

/**
 * 聊天消息优化器
 */
export class ChatMessageOptimizer {
  private options: MemoryOptimizationOptions;

  constructor(options: Partial<MemoryOptimizationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...options };
  }

  /**
   * 优化聊天消息历史
   */
  optimizeChatMessages(messages: any[]): any[] {
    if (messages.length <= this.options.maxChatMessages) {
      return messages;
    }

    const recentMessages = messages.slice(-this.options.keepRecentMessages);
    const oldMessages = messages.slice(0, messages.length - this.options.keepRecentMessages);

    if (!this.options.enableChatSummary) {
      // 不启用摘要，直接截断
      return [
        ...oldMessages.slice(-Math.floor(this.options.maxChatMessages * 0.7)),
        ...recentMessages
      ];
    }

    // 生成摘要
    const summaries = this.generateChatSummaries(oldMessages);
    
    return [
      ...summaries,
      ...recentMessages
    ];
  }

  /**
   * 生成聊天摘要
   */
  private generateChatSummaries(messages: any[]): ChatMessageSummary[] {
    const targetCount = Math.floor(messages.length * this.options.summaryRatio);
    const groupSize = Math.ceil(messages.length / targetCount);
    
    const summaries: ChatMessageSummary[] = [];
    
    for (let i = 0; i < messages.length; i += groupSize) {
      const group = messages.slice(i, i + groupSize);
      const summary = this.summarizeMessageGroup(group);
      summaries.push(summary);
    }
    
    return summaries;
  }

  /**
   * 摘要消息组
   */
  private summarizeMessageGroup(messages: any[]): ChatMessageSummary {
    const userMessages = messages.filter(m => m.role === 'user');
    const agentMessages = messages.filter(m => m.role === 'agent');
    
    const userContent = userMessages.map(m => m.content).join(' ');
    const agentContent = agentMessages.map(m => m.content).join(' ');
    
    // 简化的摘要生成（实际项目中可以使用更复杂的算法）
    const summary = `[SUMMARY ${messages.length} messages]:\n` +
      `User: ${this.truncateText(userContent, 100)}\n` +
      `Agent: ${this.truncateText(agentContent, 100)}`;
    
    return {
      role: 'system',
      content: summary,
      step: messages[0]?.step || -1,
      timestamp: messages[messages.length - 1]?.timestamp || new Date().toISOString(),
      messageType: 'summary',
      originalCount: messages.length
    };
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

/**
 * Agent 步骤优化器
 */
export class AgentStepOptimizer {
  private options: MemoryOptimizationOptions;

  constructor(options: Partial<MemoryOptimizationOptions> = {}) {
    this.options = { ...DEFAULT_OPTIMIZATION_OPTIONS, ...options };
  }

  /**
   * 优化 Agent 步骤历史
   */
  optimizeAgentSteps(steps: any[]): any[] {
    if (steps.length <= this.options.maxAgentSteps) {
      return steps;
    }

    const recentSteps = steps.slice(-this.options.keepRecentSteps);
    const oldSteps = steps.slice(0, steps.length - this.options.keepRecentSteps);

    if (!this.options.enableStepMerging) {
      // 不启用合并，直接截断
      return [
        ...oldSteps.slice(-Math.floor(this.options.maxAgentSteps * 0.7)),
        ...recentSteps
      ];
    }

    // 生成步骤摘要
    const { preserved, toBeMerged } = this.categorizeSteps(oldSteps);
    const merged = this.mergeSteps(toBeMerged);

    return [
      ...preserved,
      ...merged,
      ...recentSteps
    ];
  }

  /**
   * 分类步骤
   */
  private categorizeSteps(steps: any[]): { preserved: any[]; toBeMerged: any[] } {
    const preserved: any[] = [];
    const toBeMerged: any[] = [];

    for (const step of steps) {
      if (this.shouldPreserveStep(step)) {
        preserved.push(step);
      } else {
        toBeMerged.push(step);
      }
    }

    return { preserved, toBeMerged };
  }

  /**
   * 判断是否应该保留步骤
   */
  private shouldPreserveStep(step: any): boolean {
    // 保留包含最终答案的步骤
    if (this.options.preserveImportantSteps && step.extractorResult?.finalAnswer) {
      return true;
    }

    // 保留错误步骤
    if (this.options.preserveErrorSteps && step.error) {
      return true;
    }

    // 保留包含重要工具调用的步骤
    if (step.toolCallResults?.some((result: any) => 
      result.status === 'succeed' && this.isImportantTool(result.name))) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否为重要工具
   */
  private isImportantTool(toolName: string): boolean {
    const importantTools = [
      'file_create', 'file_modify', 'file_delete',
      'approval_request', 'user_input',
      'plan_create', 'plan_execute'
    ];
    return importantTools.includes(toolName);
  }

  /**
   * 合并步骤
   */
  private mergeSteps(steps: any[]): AgentStepSummary[] {
    if (steps.length === 0) return [];

    const targetCount = Math.floor(steps.length * this.options.summaryRatio);
    const groupSize = Math.ceil(steps.length / Math.max(targetCount, 1));
    
    const summaries: AgentStepSummary[] = [];
    
    for (let i = 0; i < steps.length; i += groupSize) {
      const group = steps.slice(i, i + groupSize);
      const summary = this.summarizeStepGroup(group);
      summaries.push(summary);
    }
    
    return summaries;
  }

  /**
   * 摘要步骤组
   */
  private summarizeStepGroup(steps: any[]): AgentStepSummary {
    const totalToolCalls = steps.reduce((sum, step) => 
      sum + (step.toolCallResults?.length || 0), 0);
    
    const successfulToolCalls = steps.reduce((sum, step) => 
      sum + (step.toolCallResults?.filter((r: any) => r.status === 'succeed').length || 0), 0);
    
    const thinkingContents = steps
      .map(step => step.extractorResult?.thinking)
      .filter(Boolean)
      .join(' ');
    
    const summary = `[MERGED ${steps.length} steps]: ` +
      `Tools: ${successfulToolCalls}/${totalToolCalls} successful. ` +
      `Thinking: ${this.truncateText(thinkingContents, 200)}`;
    
    return {
      stepIndex: steps[0].stepIndex,
      summary,
      toolCallsCount: totalToolCalls,
      successfulToolCalls,
      originalSteps: steps.length
    };
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

/**
 * 内存优化管理器
 */
export class MemoryOptimizationManager {
  private chatOptimizer: ChatMessageOptimizer;
  private stepOptimizer: AgentStepOptimizer;

  constructor(options: Partial<MemoryOptimizationOptions> = {}) {
    this.chatOptimizer = new ChatMessageOptimizer(options);
    this.stepOptimizer = new AgentStepOptimizer(options);
  }

  /**
   * 优化完整的对话上下文
   */
  optimizeContext(context: {
    chatMessages: any[];
    agentSteps: any[];
  }): {
    chatMessages: any[];
    agentSteps: any[];
    optimizationReport: {
      originalChatMessages: number;
      optimizedChatMessages: number;
      originalAgentSteps: number;
      optimizedAgentSteps: number;
    };
  } {
    const originalChatMessages = context.chatMessages.length;
    const originalAgentSteps = context.agentSteps.length;

    const optimizedChatMessages = this.chatOptimizer.optimizeChatMessages(context.chatMessages);
    const optimizedAgentSteps = this.stepOptimizer.optimizeAgentSteps(context.agentSteps);

    return {
      chatMessages: optimizedChatMessages,
      agentSteps: optimizedAgentSteps,
      optimizationReport: {
        originalChatMessages,
        optimizedChatMessages: optimizedChatMessages.length,
        originalAgentSteps,
        optimizedAgentSteps: optimizedAgentSteps.length
      }
    };
  }

  /**
   * 计算上下文大小（估算 token 数量）
   */
  estimateContextSize(context: { chatMessages: any[]; agentSteps: any[] }): {
    chatTokens: number;
    stepTokens: number;
    totalTokens: number;
  } {
    const chatTokens = context.chatMessages.reduce((sum, msg) => 
      sum + this.estimateTokens(msg.content || ''), 0);
    
    const stepTokens = context.agentSteps.reduce((sum, step) => {
      let stepContent = '';
      if (step.extractorResult?.thinking) stepContent += step.extractorResult.thinking;
      if (step.extractorResult?.finalAnswer) stepContent += step.extractorResult.finalAnswer;
      if (step.toolCallResults) stepContent += JSON.stringify(step.toolCallResults);
      return sum + this.estimateTokens(stepContent);
    }, 0);

    return {
      chatTokens,
      stepTokens,
      totalTokens: chatTokens + stepTokens
    };
  }

  /**
   * 估算文本的 token 数量
   */
  private estimateTokens(text: string): number {
    // 简化的 token 估算：平均 4 个字符 = 1 个 token
    return Math.ceil(text.length / 4);
  }
}

/**
 * 导出工厂函数
 */
export function createMemoryOptimizer(options: Partial<MemoryOptimizationOptions> = {}): MemoryOptimizationManager {
  return new MemoryOptimizationManager(options);
}

/**
 * 使用示例：
 * 
 * ```typescript
 * import { createMemoryOptimizer } from './memory-optimization';
 * 
 * const optimizer = createMemoryOptimizer({
 *   maxChatMessages: 30,
 *   maxAgentSteps: 15,
 *   keepRecentMessages: 8,
 *   keepRecentSteps: 3
 * });
 * 
 * const optimizedContext = optimizer.optimizeContext({
 *   chatMessages: [...], 
 *   agentSteps: [...]
 * });
 * 
 * console.log('Optimization report:', optimizedContext.optimizationReport);
 * ```
 */ 