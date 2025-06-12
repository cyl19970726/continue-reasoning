/**
 * Claude 风格的错误处理系统
 * 提供优雅的错误处理、恢复策略和用户友好的错误信息
 */

import { logger } from './logger';
import { IEventBus } from '../events/eventBus';

// 错误类型枚举
export enum ErrorType {
  // LLM 相关错误
  LLM_API_ERROR = 'llm_api_error',
  LLM_RATE_LIMIT = 'llm_rate_limit',
  LLM_TIMEOUT = 'llm_timeout',
  LLM_INVALID_RESPONSE = 'llm_invalid_response',
  
  // 工具调用错误
  TOOL_NOT_FOUND = 'tool_not_found',
  TOOL_EXECUTION_FAILED = 'tool_execution_failed',
  TOOL_INVALID_PARAMS = 'tool_invalid_params',
  TOOL_TIMEOUT = 'tool_timeout',
  
  // 文件系统错误
  FILE_NOT_FOUND = 'file_not_found',
  FILE_PERMISSION_DENIED = 'file_permission_denied',
  FILE_READ_ERROR = 'file_read_error',
  FILE_WRITE_ERROR = 'file_write_error',
  DIRECTORY_NOT_FOUND = 'directory_not_found',
  
  // 网络错误
  NETWORK_ERROR = 'network_error',
  CONNECTION_TIMEOUT = 'connection_timeout',
  CONNECTION_REFUSED = 'connection_refused',
  
  // 配置错误
  CONFIG_INVALID = 'config_invalid',
  CONFIG_MISSING = 'config_missing',
  ENVIRONMENT_ERROR = 'environment_error',
  
  // 系统资源错误
  MEMORY_ERROR = 'memory_error',
  DISK_SPACE_ERROR = 'disk_space_error',
  CPU_LIMIT_ERROR = 'cpu_limit_error',
  
  // 业务逻辑错误
  VALIDATION_ERROR = 'validation_error',
  BUSINESS_LOGIC_ERROR = 'business_logic_error',
  STATE_ERROR = 'state_error',
  
  // 并发和同步错误
  CONCURRENCY_ERROR = 'concurrency_error',
  DEADLOCK_ERROR = 'deadlock_error',
  RACE_CONDITION = 'race_condition',
  
  // 通用错误
  UNKNOWN_ERROR = 'unknown_error',
  SYSTEM_ERROR = 'system_error'
}

// 错误严重性级别
export enum ErrorSeverity {
  LOW = 'low',           // 可忽略的错误
  MEDIUM = 'medium',     // 需要注意但不影响核心功能
  HIGH = 'high',         // 影响核心功能但可恢复
  CRITICAL = 'critical'  // 系统性错误，需要立即处理
}

// 错误恢复策略
export enum RecoveryStrategy {
  NONE = 'none',           // 无恢复策略
  RETRY = 'retry',         // 重试
  FALLBACK = 'fallback',   // 降级处理
  SKIP = 'skip',           // 跳过继续
  ABORT = 'abort',         // 中止执行
  MANUAL = 'manual'        // 需要人工干预
}

// 结构化错误接口
export interface StructuredError {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  context: {
    component: string;     // 出错的组件
    operation: string;     // 出错的操作
    stepIndex?: number;    // 步骤索引
    timestamp: string;     // 时间戳
    sessionId?: string;    // 会话ID
  };
  details: {
    originalError?: Error; // 原始错误对象
    stackTrace?: string;   // 堆栈跟踪
    parameters?: any;      // 相关参数
    environment?: any;     // 环境信息
  };
  recovery: {
    strategy: RecoveryStrategy;
    suggestions: string[]; // 恢复建议
    retryCount?: number;   // 重试次数
    maxRetries?: number;   // 最大重试次数
  };
  userFriendly: {
    title: string;         // 用户友好的标题
    description: string;   // 用户友好的描述
    actionable: boolean;   // 用户是否可以采取行动
    actions?: string[];    // 建议的用户行动
  };
}

// 错误模式识别和分类
export class ErrorPatternMatcher {
  private static patterns: Map<RegExp, { type: ErrorType; severity: ErrorSeverity }> = new Map([
    // LLM API 错误模式
    [/rate.limit/i, { type: ErrorType.LLM_RATE_LIMIT, severity: ErrorSeverity.MEDIUM }],
    [/timeout/i, { type: ErrorType.LLM_TIMEOUT, severity: ErrorSeverity.MEDIUM }],
    [/network.error|connection.failed/i, { type: ErrorType.NETWORK_ERROR, severity: ErrorSeverity.HIGH }],
    [/invalid.api.key|unauthorized/i, { type: ErrorType.CONFIG_INVALID, severity: ErrorSeverity.CRITICAL }],
    
    // 文件系统错误模式
    [/ENOENT|no such file/i, { type: ErrorType.FILE_NOT_FOUND, severity: ErrorSeverity.MEDIUM }],
    [/EACCES|permission denied/i, { type: ErrorType.FILE_PERMISSION_DENIED, severity: ErrorSeverity.HIGH }],
    [/ENOSPC|no space left/i, { type: ErrorType.DISK_SPACE_ERROR, severity: ErrorSeverity.CRITICAL }],
    
    // 工具执行错误模式
    [/tool.*not found/i, { type: ErrorType.TOOL_NOT_FOUND, severity: ErrorSeverity.MEDIUM }],
    [/command not found/i, { type: ErrorType.TOOL_EXECUTION_FAILED, severity: ErrorSeverity.MEDIUM }],
    
    // 内存错误模式
    [/out of memory|ENOMEM/i, { type: ErrorType.MEMORY_ERROR, severity: ErrorSeverity.CRITICAL }],
    
    // 并发错误模式
    [/deadlock|resource busy/i, { type: ErrorType.CONCURRENCY_ERROR, severity: ErrorSeverity.HIGH }]
  ]);

  static classify(error: Error | string): { type: ErrorType; severity: ErrorSeverity } {
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    for (const [pattern, classification] of this.patterns) {
      if (pattern.test(errorMessage)) {
        return classification;
      }
    }
    
    return { type: ErrorType.UNKNOWN_ERROR, severity: ErrorSeverity.MEDIUM };
  }
}

// 错误恢复策略决策器
export class RecoveryStrategyDecider {
  static decide(error: StructuredError): RecoveryStrategy {
    const { type, severity } = error;
    
    switch (type) {
      case ErrorType.LLM_RATE_LIMIT:
        return RecoveryStrategy.RETRY;
      
      case ErrorType.LLM_TIMEOUT:
      case ErrorType.NETWORK_ERROR:
        return RecoveryStrategy.RETRY;
      
      case ErrorType.TOOL_NOT_FOUND:
        return RecoveryStrategy.SKIP;
      
      case ErrorType.FILE_NOT_FOUND:
        return RecoveryStrategy.MANUAL;
      
      case ErrorType.FILE_PERMISSION_DENIED:
        return RecoveryStrategy.MANUAL;
      
      case ErrorType.MEMORY_ERROR:
      case ErrorType.DISK_SPACE_ERROR:
        return RecoveryStrategy.ABORT;
      
      case ErrorType.CONFIG_INVALID:
        return RecoveryStrategy.MANUAL;
      
      default:
        return severity === ErrorSeverity.CRITICAL 
          ? RecoveryStrategy.ABORT 
          : RecoveryStrategy.FALLBACK;
    }
  }

  static getSuggestions(error: StructuredError): string[] {
    const { type } = error;
    
    switch (type) {
      case ErrorType.LLM_RATE_LIMIT:
        return [
          'Waiting and retrying with exponential backoff',
          'Consider using a different model with higher rate limits',
          'Reduce request frequency'
        ];
      
      case ErrorType.LLM_TIMEOUT:
        return [
          'Retrying with shorter timeout',
          'Breaking down complex requests into smaller parts',
          'Check network connectivity'
        ];
      
      case ErrorType.TOOL_NOT_FOUND:
        return [
          'Verify tool installation',
          'Check tool configuration',
          'Use alternative tool if available'
        ];
      
      case ErrorType.FILE_NOT_FOUND:
        return [
          'Verify file path is correct',
          'Create the missing file',
          'Check if file was moved or deleted'
        ];
      
      case ErrorType.FILE_PERMISSION_DENIED:
        return [
          'Check file permissions',
          'Run with appropriate privileges',
          'Change file ownership if necessary'
        ];
      
      case ErrorType.MEMORY_ERROR:
        return [
          'Reduce memory usage',
          'Process data in smaller chunks',
          'Free up system memory',
          'Consider scaling resources'
        ];
      
      case ErrorType.DISK_SPACE_ERROR:
        return [
          'Free up disk space',
          'Clean temporary files',
          'Move files to different location',
          'Add more storage'
        ];
      
      default:
        return [
          'Review error details',
          'Check system logs',
          'Contact support if issue persists'
        ];
    }
  }
}

// Claude 风格错误处理器
export class ClaudeErrorHandler {
  private eventBus?: IEventBus;
  private errorHistory: StructuredError[] = [];
  private retryTracker: Map<string, number> = new Map();

  constructor(eventBus?: IEventBus) {
    this.eventBus = eventBus;
  }

  /**
   * 处理错误的主要入口点
   */
  async handleError(
    error: Error | string,
    context: {
      component: string;
      operation: string;
      stepIndex?: number;
      sessionId?: string;
      parameters?: any;
    }
  ): Promise<StructuredError> {
    const structuredError = this.createStructuredError(error, context);
    
    // 记录错误
    this.errorHistory.push(structuredError);
    logger.error(`[${structuredError.type}] ${structuredError.message}`, {
      errorId: structuredError.id,
      context: structuredError.context,
      severity: structuredError.severity
    });

    // 发布错误事件
    if (this.eventBus) {
      await this.publishErrorEvent(structuredError);
    }

    // 执行恢复策略
    await this.executeRecoveryStrategy(structuredError);

    return structuredError;
  }

  /**
   * 创建结构化错误对象
   */
  private createStructuredError(
    error: Error | string,
    context: {
      component: string;
      operation: string;
      stepIndex?: number;
      sessionId?: string;
      parameters?: any;
    }
  ): StructuredError {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const originalError = error instanceof Error ? error : new Error(error);
    const classification = ErrorPatternMatcher.classify(originalError);
    
    const structuredError: StructuredError = {
      id: errorId,
      type: classification.type,
      severity: classification.severity,
      message: originalError.message,
      context: {
        component: context.component,
        operation: context.operation,
        stepIndex: context.stepIndex,
        timestamp: new Date().toISOString(),
        sessionId: context.sessionId
      },
      details: {
        originalError,
        stackTrace: originalError.stack,
        parameters: context.parameters,
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          memory: process.memoryUsage()
        }
      },
      recovery: {
        strategy: RecoveryStrategy.NONE,
        suggestions: [],
        retryCount: 0,
        maxRetries: 3
      },
      userFriendly: {
        title: 'An error occurred',
        description: 'Something went wrong during processing',
        actionable: false,
        actions: []
      }
    };

    // 设置恢复策略和建议
    structuredError.recovery.strategy = RecoveryStrategyDecider.decide(structuredError);
    structuredError.recovery.suggestions = RecoveryStrategyDecider.getSuggestions(structuredError);

    // 设置用户友好的信息
    this.setUserFriendlyMessages(structuredError);

    return structuredError;
  }

  /**
   * 设置用户友好的错误信息
   */
  private setUserFriendlyMessages(error: StructuredError): void {
    switch (error.type) {
      case ErrorType.LLM_RATE_LIMIT:
        error.userFriendly = {
          title: 'Rate Limit Reached',
          description: 'The AI service is temporarily limiting requests. I\'ll retry automatically.',
          actionable: false,
          actions: []
        };
        break;

      case ErrorType.FILE_NOT_FOUND:
        error.userFriendly = {
          title: 'File Not Found',
          description: `I couldn't find the file you mentioned. Please check the path and try again.`,
          actionable: true,
          actions: ['Verify the file path', 'Create the file if it should exist']
        };
        break;

      case ErrorType.TOOL_EXECUTION_FAILED:
        error.userFriendly = {
          title: 'Tool Execution Failed',
          description: 'A tool I tried to use encountered an error. I\'ll try a different approach.',
          actionable: false,
          actions: []
        };
        break;

      case ErrorType.NETWORK_ERROR:
        error.userFriendly = {
          title: 'Network Issue',
          description: 'I\'m having trouble connecting to external services. I\'ll retry in a moment.',
          actionable: false,
          actions: []
        };
        break;

      default:
        error.userFriendly = {
          title: 'Unexpected Error',
          description: 'Something unexpected happened. Let me try a different approach.',
          actionable: false,
          actions: []
        };
    }
  }

  /**
   * 发布错误事件
   */
  private async publishErrorEvent(error: StructuredError): Promise<void> {
    if (!this.eventBus) return;

    await this.eventBus.publish({
      type: 'error_occurred',
      source: 'error_handler',
      sessionId: error.context.sessionId || 'unknown',
      payload: {
        errorId: error.id,
        errorType: error.type,
        severity: error.severity,
        message: error.userFriendly.description,
        title: error.userFriendly.title,
        component: error.context.component,
        operation: error.context.operation,
        stepIndex: error.context.stepIndex,
        recoverable: error.recovery.strategy !== RecoveryStrategy.ABORT,
        suggestions: error.recovery.suggestions,
        actions: error.userFriendly.actions
      }
    });
  }

  /**
   * 执行恢复策略
   */
  private async executeRecoveryStrategy(error: StructuredError): Promise<void> {
    const retryKey = `${error.context.component}_${error.context.operation}`;
    
    switch (error.recovery.strategy) {
      case RecoveryStrategy.RETRY:
        const currentRetries = this.retryTracker.get(retryKey) || 0;
        if (currentRetries < (error.recovery.maxRetries || 3)) {
          this.retryTracker.set(retryKey, currentRetries + 1);
          error.recovery.retryCount = currentRetries + 1;
          
          // 指数退避
          const delay = Math.pow(2, currentRetries) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          
          logger.info(`Retrying operation (attempt ${currentRetries + 1}/${error.recovery.maxRetries})`);
        }
        break;

      case RecoveryStrategy.FALLBACK:
        logger.info('Attempting fallback strategy');
        // 这里可以实现具体的降级逻辑
        break;

      case RecoveryStrategy.SKIP:
        logger.info('Skipping failed operation and continuing');
        break;

      case RecoveryStrategy.ABORT:
        logger.error('Critical error detected, aborting execution');
        break;

      case RecoveryStrategy.MANUAL:
        logger.warn('Manual intervention required');
        // 发布需要人工干预的事件
        if (this.eventBus) {
          await this.eventBus.publish({
            type: 'manual_intervention_required',
            source: 'error_handler',
            sessionId: error.context.sessionId || 'unknown',
            payload: {
              errorId: error.id,
              reason: error.message,
              suggestions: error.recovery.suggestions
            }
          });
        }
        break;
    }
  }

  /**
   * 获取错误历史
   */
  getErrorHistory(limit?: number): StructuredError[] {
    return limit ? this.errorHistory.slice(-limit) : [...this.errorHistory];
  }

  /**
   * 清理错误历史
   */
  clearErrorHistory(): void {
    this.errorHistory = [];
    this.retryTracker.clear();
  }

  /**
   * 获取错误统计
   */
  getErrorStatistics(): {
    total: number;
    byType: Record<ErrorType, number>;
    bySeverity: Record<ErrorSeverity, number>;
    recentErrors: number; // 最近1小时的错误数
  } {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    const byType: Record<ErrorType, number> = {} as any;
    const bySeverity: Record<ErrorSeverity, number> = {} as any;
    let recentErrors = 0;

    for (const error of this.errorHistory) {
      // 统计类型
      byType[error.type] = (byType[error.type] || 0) + 1;
      
      // 统计严重性
      bySeverity[error.severity] = (bySeverity[error.severity] || 0) + 1;
      
      // 统计最近错误
      const errorTime = new Date(error.context.timestamp).getTime();
      if (errorTime > oneHourAgo) {
        recentErrors++;
      }
    }

    return {
      total: this.errorHistory.length,
      byType,
      bySeverity,
      recentErrors
    };
  }

  /**
   * 检查是否应该停止重试
   */
  shouldStopRetrying(component: string, operation: string, maxRetries: number = 3): boolean {
    const retryKey = `${component}_${operation}`;
    const currentRetries = this.retryTracker.get(retryKey) || 0;
    return currentRetries >= maxRetries;
  }

  /**
   * 重置重试计数器
   */
  resetRetryCounter(component: string, operation: string): void {
    const retryKey = `${component}_${operation}`;
    this.retryTracker.delete(retryKey);
  }
}

// 导出便捷函数
export function createClaudeErrorHandler(eventBus?: IEventBus): ClaudeErrorHandler {
  return new ClaudeErrorHandler(eventBus);
}

// 全局错误处理器实例
let globalErrorHandler: ClaudeErrorHandler | null = null;

export function getGlobalErrorHandler(): ClaudeErrorHandler {
  if (!globalErrorHandler) {
    globalErrorHandler = new ClaudeErrorHandler();
  }
  return globalErrorHandler;
}

export function setGlobalErrorHandler(handler: ClaudeErrorHandler): void {
  globalErrorHandler = handler;
} 