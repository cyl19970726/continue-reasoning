/**
 * 错误恢复管理器 - 处理流式错误和自动恢复
 */

import { IErrorRecoveryManager } from './interfaces';
import { StreamEvent, StreamEventType, StreamingCheckpoint } from './types';
import { logger } from '../utils/logger';

/**
 * 错误类型分类
 */
enum ErrorCategory {
  NETWORK = 'network',
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  AGENT = 'agent',
  TOOL = 'tool',
  SYSTEM = 'system',
  CLIENT = 'client'
}

/**
 * 恢复策略
 */
interface RecoveryStrategy {
  name: string;
  canHandle: (error: Error, context: any) => boolean;
  recover: (sessionId: string, error: Error, context: any) => Promise<boolean>;
  maxRetries: number;
  backoffMs: number;
}

/**
 * 错误记录
 */
interface ErrorRecord {
  timestamp: number;
  error: Error;
  context: any;
  category: ErrorCategory;
  recovered: boolean;
  recoveryMethod?: string;
  attempts: number;
}

/**
 * 会话错误状态
 */
interface SessionErrorState {
  sessionId: string;
  errorHistory: ErrorRecord[];
  activeRecovery: boolean;
  lastCheckpoint?: StreamingCheckpoint;
  consecutiveErrors: number;
  lastRecoveryTime: number;
}

/**
 * 网络错误恢复策略
 */
class NetworkRecoveryStrategy implements RecoveryStrategy {
  name = 'network';
  maxRetries = 3;
  backoffMs = 1000;

  canHandle(error: Error): boolean {
    return error.message.includes('network') || 
           error.message.includes('connection') ||
           error.message.includes('timeout');
  }

  async recover(sessionId: string, error: Error, context: any): Promise<boolean> {
    logger.info(`Attempting network recovery for session ${sessionId}`);
    
    // 模拟网络重连
    await new Promise(resolve => setTimeout(resolve, this.backoffMs));
    
    // 在实际实现中，这里会重新建立连接
    return true;
  }
}

/**
 * 限流错误恢复策略
 */
class RateLimitRecoveryStrategy implements RecoveryStrategy {
  name = 'rate_limit';
  maxRetries = 5;
  backoffMs = 2000;

  canHandle(error: Error): boolean {
    return error.message.includes('rate limit') || 
           error.message.includes('429') ||
           error.message.includes('quota');
  }

  async recover(sessionId: string, error: Error, context: any): Promise<boolean> {
    logger.info(`Attempting rate limit recovery for session ${sessionId}`);
    
    // 指数退避
    const waitTime = this.backoffMs * Math.pow(2, context.attempt || 0);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    return true;
  }
}

/**
 * Agent错误恢复策略
 */
class AgentRecoveryStrategy implements RecoveryStrategy {
  name = 'agent';
  maxRetries = 2;
  backoffMs = 500;

  canHandle(error: Error, context: any): boolean {
    return context.source === 'agent' || error.message.includes('agent');
  }

  async recover(sessionId: string, error: Error, context: any): Promise<boolean> {
    logger.info(`Attempting agent recovery for session ${sessionId}`);
    
    // 重置Agent状态
    // 在实际实现中，这里会调用Agent的重置方法
    
    return true;
  }
}

/**
 * 工具错误恢复策略
 */
class ToolRecoveryStrategy implements RecoveryStrategy {
  name = 'tool';
  maxRetries = 3;
  backoffMs = 1000;

  canHandle(error: Error, context: any): boolean {
    return context.source === 'tool' || context.toolId;
  }

  async recover(sessionId: string, error: Error, context: any): Promise<boolean> {
    logger.info(`Attempting tool recovery for session ${sessionId}, tool: ${context.toolId}`);
    
    // 重试工具调用或使用备用工具
    // 在实际实现中，这里会重新执行工具调用
    
    return true;
  }
}

/**
 * 错误恢复管理器实现
 */
export class ErrorRecoveryManager implements IErrorRecoveryManager {
  private sessionStates = new Map<string, SessionErrorState>();
  private recoveryStrategies: RecoveryStrategy[] = [];
  private checkpoints = new Map<string, Map<string, StreamingCheckpoint>>();
  private maxConsecutiveErrors = 10;
  private recoveryTimeoutMs = 30000; // 30秒恢复超时

  constructor() {
    // 注册默认恢复策略
    this.registerStrategy(new NetworkRecoveryStrategy());
    this.registerStrategy(new RateLimitRecoveryStrategy());
    this.registerStrategy(new AgentRecoveryStrategy());
    this.registerStrategy(new ToolRecoveryStrategy());
  }

  /**
   * 注册恢复策略
   */
  registerStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    logger.debug(`Registered recovery strategy: ${strategy.name}`);
  }

  /**
   * 处理流式错误
   */
  async handleError(sessionId: string, error: Error, context: any): Promise<void> {
    const sessionState = this.getOrCreateSessionState(sessionId);
    
    // 分类错误
    const category = this.categorizeError(error, context);
    
    // 记录错误
    const errorRecord: ErrorRecord = {
      timestamp: Date.now(),
      error,
      context,
      category,
      recovered: false,
      attempts: 0
    };
    
    sessionState.errorHistory.push(errorRecord);
    sessionState.consecutiveErrors++;
    
    logger.error(`Error in session ${sessionId} [${category}]:`, error);
    
    // 检查是否超过连续错误限制
    if (sessionState.consecutiveErrors > this.maxConsecutiveErrors) {
      logger.error(`Session ${sessionId} exceeded max consecutive errors, abandoning recovery`);
      return;
    }
    
    // 防止并发恢复
    if (sessionState.activeRecovery) {
      logger.warn(`Recovery already in progress for session ${sessionId}`);
      return;
    }
    
    // 开始恢复流程
    sessionState.activeRecovery = true;
    
    try {
      const recovered = await this.attemptRecovery(sessionId, errorRecord);
      
      if (recovered) {
        sessionState.consecutiveErrors = 0;
        sessionState.lastRecoveryTime = Date.now();
        errorRecord.recovered = true;
        
        logger.info(`Successfully recovered from error in session ${sessionId}`);
      } else {
        logger.warn(`Failed to recover from error in session ${sessionId}`);
      }
    } finally {
      sessionState.activeRecovery = false;
    }
  }

  /**
   * 从检查点恢复
   */
  async recoverFromCheckpoint(sessionId: string, checkpointId: string): Promise<void> {
    const checkpointMap = this.checkpoints.get(sessionId);
    if (!checkpointMap) {
      throw new Error(`No checkpoints found for session ${sessionId}`);
    }
    
    const checkpoint = checkpointMap.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found for session ${sessionId}`);
    }
    
    logger.info(`Recovering session ${sessionId} from checkpoint ${checkpointId}`);
    
    // 在实际实现中，这里会恢复到指定的检查点状态
    // 包括恢复Agent状态、会话状态等
    
    const sessionState = this.sessionStates.get(sessionId);
    if (sessionState) {
      sessionState.lastCheckpoint = checkpoint;
      sessionState.consecutiveErrors = 0;
    }
  }

  /**
   * 重试失败的操作
   */
  async retry(sessionId: string, operation: string, attempt: number): Promise<boolean> {
    const sessionState = this.sessionStates.get(sessionId);
    if (!sessionState) {
      return false;
    }
    
    // 查找对应的错误记录
    const errorRecord = sessionState.errorHistory
      .reverse()
      .find(record => !record.recovered && record.context.operation === operation);
    
    if (!errorRecord) {
      logger.warn(`No failed operation '${operation}' found for retry in session ${sessionId}`);
      return false;
    }
    
    logger.info(`Retrying operation '${operation}' for session ${sessionId}, attempt ${attempt}`);
    
    // 查找合适的恢复策略
    const strategy = this.findRecoveryStrategy(errorRecord.error, errorRecord.context);
    if (!strategy) {
      return false;
    }
    
    if (attempt > strategy.maxRetries) {
      logger.error(`Max retries exceeded for operation '${operation}' in session ${sessionId}`);
      return false;
    }
    
    // 指数退避
    const waitTime = strategy.backoffMs * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    try {
      const success = await strategy.recover(sessionId, errorRecord.error, {
        ...errorRecord.context,
        attempt
      });
      
      if (success) {
        errorRecord.recovered = true;
        errorRecord.recoveryMethod = strategy.name;
      }
      
      return success;
    } catch (retryError) {
      logger.error(`Retry failed for operation '${operation}' in session ${sessionId}:`, retryError);
      return false;
    }
  }

  /**
   * 获取会话的错误历史
   */
  getErrorHistory(sessionId: string): Array<{
    timestamp: number;
    error: Error;
    recovered: boolean;
  }> {
    const sessionState = this.sessionStates.get(sessionId);
    if (!sessionState) {
      return [];
    }
    
    return sessionState.errorHistory.map(record => ({
      timestamp: record.timestamp,
      error: record.error,
      recovered: record.recovered
    }));
  }

  /**
   * 保存检查点
   */
  saveCheckpoint(checkpoint: StreamingCheckpoint): void {
    let sessionCheckpoints = this.checkpoints.get(checkpoint.sessionId);
    if (!sessionCheckpoints) {
      sessionCheckpoints = new Map();
      this.checkpoints.set(checkpoint.sessionId, sessionCheckpoints);
    }
    
    sessionCheckpoints.set(checkpoint.id, checkpoint);
    
    // 保留最近的10个检查点
    if (sessionCheckpoints.size > 10) {
      const oldestKey = sessionCheckpoints.keys().next().value;
      sessionCheckpoints.delete(oldestKey);
    }
    
    logger.debug(`Saved checkpoint ${checkpoint.id} for session ${checkpoint.sessionId}`);
  }

  /**
   * 尝试恢复
   */
  private async attemptRecovery(sessionId: string, errorRecord: ErrorRecord): Promise<boolean> {
    const strategy = this.findRecoveryStrategy(errorRecord.error, errorRecord.context);
    if (!strategy) {
      logger.warn(`No recovery strategy found for error in session ${sessionId}`);
      return false;
    }
    
    logger.info(`Attempting recovery using strategy '${strategy.name}' for session ${sessionId}`);
    
    const maxAttempts = strategy.maxRetries;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      errorRecord.attempts = attempt;
      
      try {
        // 设置超时
        const recoveryPromise = strategy.recover(sessionId, errorRecord.error, {
          ...errorRecord.context,
          attempt
        });
        
        const timeoutPromise = new Promise<boolean>((_, reject) => {
          setTimeout(() => reject(new Error('Recovery timeout')), this.recoveryTimeoutMs);
        });
        
        const success = await Promise.race([recoveryPromise, timeoutPromise]);
        
        if (success) {
          errorRecord.recoveryMethod = strategy.name;
          return true;
        }
        
        // 等待后重试
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, strategy.backoffMs));
        }
        
      } catch (recoveryError) {
        logger.error(`Recovery attempt ${attempt} failed for session ${sessionId}:`, recoveryError);
        
        if (attempt === maxAttempts) {
          return false;
        }
      }
    }
    
    return false;
  }

  /**
   * 查找恢复策略
   */
  private findRecoveryStrategy(error: Error, context: any): RecoveryStrategy | null {
    return this.recoveryStrategies.find(strategy => strategy.canHandle(error, context)) || null;
  }

  /**
   * 错误分类
   */
  private categorizeError(error: Error, context: any): ErrorCategory {
    if (error.message.includes('network') || error.message.includes('connection')) {
      return ErrorCategory.NETWORK;
    }
    
    if (error.message.includes('rate limit') || error.message.includes('429')) {
      return ErrorCategory.RATE_LIMIT;
    }
    
    if (error.message.includes('auth') || error.message.includes('401')) {
      return ErrorCategory.AUTHENTICATION;
    }
    
    if (context.source === 'agent') {
      return ErrorCategory.AGENT;
    }
    
    if (context.source === 'tool' || context.toolId) {
      return ErrorCategory.TOOL;
    }
    
    if (context.source === 'client') {
      return ErrorCategory.CLIENT;
    }
    
    return ErrorCategory.SYSTEM;
  }

  /**
   * 获取或创建会话状态
   */
  private getOrCreateSessionState(sessionId: string): SessionErrorState {
    let sessionState = this.sessionStates.get(sessionId);
    if (!sessionState) {
      sessionState = {
        sessionId,
        errorHistory: [],
        activeRecovery: false,
        consecutiveErrors: 0,
        lastRecoveryTime: 0
      };
      this.sessionStates.set(sessionId, sessionState);
    }
    return sessionState;
  }

  /**
   * 清理会话状态
   */
  cleanupSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    this.checkpoints.delete(sessionId);
    logger.debug(`Cleaned up error recovery state for session ${sessionId}`);
  }

  /**
   * 获取全局错误统计
   */
  getGlobalStats(): {
    totalSessions: number;
    totalErrors: number;
    recoveredErrors: number;
    averageRecoveryTime: number;
    topErrorCategories: Array<{ category: string; count: number }>;
  } {
    let totalErrors = 0;
    let recoveredErrors = 0;
    let totalRecoveryTime = 0;
    const categoryCount = new Map<string, number>();

    this.sessionStates.forEach(state => {
      state.errorHistory.forEach(record => {
        totalErrors++;
        if (record.recovered) {
          recoveredErrors++;
          // 简化的恢复时间计算
          totalRecoveryTime += 1000; // 假设平均恢复时间
        }
        
        const count = categoryCount.get(record.category) || 0;
        categoryCount.set(record.category, count + 1);
      });
    });

    const topErrorCategories = Array.from(categoryCount.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalSessions: this.sessionStates.size,
      totalErrors,
      recoveredErrors,
      averageRecoveryTime: recoveredErrors > 0 ? totalRecoveryTime / recoveredErrors : 0,
      topErrorCategories
    };
  }
}