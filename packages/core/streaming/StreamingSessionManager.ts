/**
 * 流式会话管理器 - 核心实现
 */

import { SessionManager } from '../session/sessionManager';
import { IAgent } from '../interfaces';
import { 
  IStreamingSessionManager, 
  IStreamingSession,
  IAgentCallbackBridge,
  IBufferManager,
  IErrorRecoveryManager,
  IStreamingMonitor
} from './interfaces';
import {
  StreamEvent,
  StreamEventType,
  StreamingOptions,
  StreamSubscriber
} from './types';
import { StreamingSession } from './StreamingSession';
import { AgentCallbackBridge } from './AgentCallbackBridge';
import { BufferManager } from './BufferManager';
import { ErrorRecoveryManager } from './ErrorRecoveryManager';
import { StreamingMonitor } from './StreamingMonitor';
import { logger } from '../utils/logger';

/**
 * 流式会话管理器实现
 * 继承自SessionManager，增加流式功能
 */
export class StreamingSessionManager extends SessionManager implements IStreamingSessionManager {
  // 流式会话映射
  private streamingSessions = new Map<string, IStreamingSession>();
  
  // 订阅者管理
  private subscribers = new Map<string, Set<StreamSubscriber>>();
  
  // 依赖的管理器
  private bufferManager: IBufferManager;
  private errorRecoveryManager: IErrorRecoveryManager;
  private monitor: IStreamingMonitor;
  
  // 回调桥接器缓存
  private callbackBridges = new Map<string, IAgentCallbackBridge>();

  constructor(agent: IAgent) {
    super(agent);
    
    // 初始化依赖
    this.bufferManager = new BufferManager();
    this.errorRecoveryManager = new ErrorRecoveryManager();
    this.monitor = new StreamingMonitor();
    
    // 设置增强的Agent回调
    this.setupEnhancedAgentCallbacks();
  }

  /**
   * 创建流式会话
   */
  async createStreamingSession(userId: string, options?: StreamingOptions): Promise<IStreamingSession> {
    // 创建基础会话
    const sessionId = this.createSession(userId, this.agent.id);
    
    // 创建流式会话
    const streamingSession = new StreamingSession({
      sessionId,
      options
    });
    
    // 创建回调桥接器
    const callbackBridge = new AgentCallbackBridge();
    callbackBridge.setStreamingSession(streamingSession);
    
    // 保存映射
    this.streamingSessions.set(sessionId, streamingSession);
    this.callbackBridges.set(sessionId, callbackBridge);
    this.subscribers.set(sessionId, new Set());
    
    // 设置事件监听
    this.setupSessionEventListeners(sessionId, streamingSession);
    
    // 启动流式传输
    await streamingSession.start();
    
    logger.info(`Created streaming session ${sessionId} for user ${userId}`);
    
    return streamingSession;
  }

  /**
   * 获取流式会话
   */
  getSession(sessionId: string): IStreamingSession | null {
    return this.streamingSessions.get(sessionId) || null;
  }

  /**
   * 结束流式会话
   */
  async endSession(sessionId: string, reason?: string): Promise<void> {
    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      logger.warn(`Streaming session ${sessionId} not found`);
      return;
    }
    
    // 停止流式传输
    await session.stop(reason);
    
    // 清理资源
    this.streamingSessions.delete(sessionId);
    this.callbackBridges.delete(sessionId);
    this.subscribers.delete(sessionId);
    
    // 归档基础会话
    await this.archiveSession(sessionId);
    
    logger.info(`Ended streaming session ${sessionId}, reason: ${reason}`);
  }

  /**
   * 获取所有活跃的流式会话
   */
  getActiveSessions(): string[] {
    return Array.from(this.streamingSessions.keys());
  }

  /**
   * 广播事件到会话的所有订阅者
   */
  broadcastToSession(sessionId: string, event: StreamEvent): void {
    const subscribers = this.subscribers.get(sessionId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    
    // 记录到监控系统
    this.monitor.recordEvent(event);
    
    // 检查是否需要缓冲
    if (this.bufferManager.shouldBuffer(sessionId, event)) {
      this.bufferManager.bufferEvent(sessionId, event);
      return;
    }
    
    // 广播给所有订阅者
    subscribers.forEach(subscriber => {
      try {
        // 应用过滤器
        if (subscriber.filter && !subscriber.filter(event)) {
          return;
        }
        
        // 检查事件类型匹配
        if (subscriber.eventTypes.length > 0 && 
            !subscriber.eventTypes.includes(event.type)) {
          return;
        }
        
        // 发送事件
        subscriber.handler(event);
      } catch (error) {
        logger.error(`Error in subscriber ${subscriber.id}:`, error);
        this.handleSubscriberError(sessionId, subscriber, error as Error);
      }
    });
  }

  /**
   * 添加订阅者
   */
  addSubscriber(sessionId: string, subscriber: StreamSubscriber): void {
    const subscribers = this.subscribers.get(sessionId);
    if (!subscribers) {
      logger.warn(`Session ${sessionId} not found for subscriber`);
      return;
    }
    
    subscribers.add(subscriber);
    logger.debug(`Added subscriber ${subscriber.id} to session ${sessionId}`);
  }

  /**
   * 移除订阅者
   */
  removeSubscriber(sessionId: string, subscriberId: string): void {
    const subscribers = this.subscribers.get(sessionId);
    if (!subscribers) {
      return;
    }
    
    const subscriber = Array.from(subscribers).find(s => s.id === subscriberId);
    if (subscriber) {
      subscribers.delete(subscriber);
      logger.debug(`Removed subscriber ${subscriberId} from session ${sessionId}`);
    }
  }

  /**
   * 发送消息到Agent（重写父类方法，增加流式支持）
   */
  async sendMessageToAgent(
    message: string, 
    maxSteps: number = 1000, 
    sessionId: string
  ): Promise<string> {
    // 确保有流式会话
    let streamingSession = this.getSession(sessionId);
    if (!streamingSession) {
      // 自动创建流式会话
      streamingSession = await this.createStreamingSession('anonymous');
      sessionId = streamingSession.sessionId;
    }
    
    // 获取回调桥接器
    const callbackBridge = this.callbackBridges.get(sessionId);
    if (callbackBridge) {
      // 设置流式回调
      const streamingCallbacks = callbackBridge.createStreamingCallbacks();
      this.agent.setCallBacks(streamingCallbacks);
    }
    
    // 调用父类方法
    return super.sendMessageToAgent(message, maxSteps, sessionId);
  }

  /**
   * 设置增强的Agent回调
   */
  private setupEnhancedAgentCallbacks(): void {
    // 这里设置全局的Agent回调，用于所有会话
    const originalCallbacks = this.agent.callbacks;
    
    this.agent.setCallBacks({
      // 确保必需的回调存在
      loadAgentStorage: originalCallbacks?.loadAgentStorage || (async () => null),
      
      // 保留原有回调
      onSessionStart: originalCallbacks?.onSessionStart,
      onSessionEnd: originalCallbacks?.onSessionEnd,
      onToolCallStart: originalCallbacks?.onToolCallStart,
      onToolExecutionEnd: originalCallbacks?.onToolExecutionEnd,
      onLLMTextDelta: originalCallbacks?.onLLMTextDelta,
      onLLMTextDone: originalCallbacks?.onLLMTextDone,
      onStepTextDone: originalCallbacks?.onStepTextDone,
      onError: originalCallbacks?.onError,
      onStateStorage: originalCallbacks?.onStateStorage,
      
      // 拦截并增强已有回调
      onAgentStep: (step) => {
        // 调用原回调
        originalCallbacks?.onAgentStep?.(step);
        
        // 广播步骤完成事件
        const sessionId = this.agent.agentStorage.sessionId;
        const session = this.getSession(sessionId);
        if (session) {
          session.emitEvent({
            type: StreamEventType.STEP_END,
            payload: { stepIndex: step.stepIndex, agentStep: step },
            metadata: { stepIndex: step.stepIndex, source: 'agent', priority: 'high' }
          });
        }
      }
    });
  }

  /**
   * 设置会话事件监听
   */
  private setupSessionEventListeners(sessionId: string, session: IStreamingSession): void {
    // 监听所有事件并广播
    const eventTypes = Object.values(StreamEventType);
    
    eventTypes.forEach(eventType => {
      session.onEvent(eventType as StreamEventType, (event) => {
        this.broadcastToSession(sessionId, event);
      });
    });
    
    // 错误处理
    session.onEvent(StreamEventType.ERROR_OCCURRED, async (event) => {
      await this.errorRecoveryManager.handleError(
        sessionId,
        event.payload.error,
        event.payload.context
      );
    });
    
    // 性能监控
    session.onEvent(StreamEventType.PERFORMANCE_METRIC, (event) => {
      this.monitor.recordEvent(event);
    });
  }

  /**
   * 处理订阅者错误
   */
  private handleSubscriberError(
    sessionId: string, 
    subscriber: StreamSubscriber, 
    error: Error
  ): void {
    logger.error(`Subscriber ${subscriber.id} error in session ${sessionId}:`, error);
    
    // 发送错误事件
    const session = this.getSession(sessionId);
    if (session) {
      session.emitEvent({
        type: StreamEventType.ERROR_OCCURRED,
        payload: {
          error,
          context: {
            subscriberId: subscriber.id,
            sessionId
          }
        },
        metadata: {
          source: 'subscriber',
          priority: 'high'
        }
      });
    }
  }

  /**
   * 获取流式统计信息
   */
  getStreamingStats(): {
    activeSessions: number;
    totalSubscribers: number;
    metrics: any;
  } {
    let totalSubscribers = 0;
    this.subscribers.forEach(subs => {
      totalSubscribers += subs.size;
    });
    
    return {
      activeSessions: this.streamingSessions.size,
      totalSubscribers,
      metrics: this.monitor.getMetrics()
    };
  }
}