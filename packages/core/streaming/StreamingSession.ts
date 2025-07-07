/**
 * 流式会话核心类
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { 
  StreamEvent, 
  StreamEventType, 
  StreamingOptions, 
  StreamingState,
  EventPriority,
  StreamEventHandler
} from './types';
import { logger } from '../utils/logger';

/**
 * 流式会话类
 */
export class StreamingSession extends EventEmitter {
  public readonly sessionId: string;
  public readonly options: Required<StreamingOptions>;
  
  private state: StreamingState;
  private sequenceNumber: number = 0;
  private eventBuffer: StreamEvent[] = [];
  private flushTimer?: NodeJS.Timer;
  private startTime: number;
  private eventHandlers: Map<StreamEventType, Set<StreamEventHandler<any>>> = new Map();

  constructor(config: {
    sessionId: string;
    options?: StreamingOptions;
  }) {
    super();
    
    this.sessionId = config.sessionId;
    this.startTime = Date.now();
    
    // 设置默认选项
    this.options = {
      enableCompression: config.options?.enableCompression ?? true,
      enableEncryption: config.options?.enableEncryption ?? false,
      bufferSize: config.options?.bufferSize ?? 1000,
      flushInterval: config.options?.flushInterval ?? 100,
      adaptiveBandwidth: config.options?.adaptiveBandwidth ?? true,
      maxReconnectAttempts: config.options?.maxReconnectAttempts ?? 5,
      reconnectDelay: config.options?.reconnectDelay ?? 1000
    };

    // 初始化状态
    this.state = {
      sessionId: this.sessionId,
      isStreaming: false,
      startTime: this.startTime,
      eventCount: 0,
      lastEventTime: this.startTime,
      bandwidth: 0,
      backpressure: 0,
      bufferedEvents: 0,
      connectionStatus: 'disconnected'
    };

    // 设置定时刷新
    if (this.options.flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  /**
   * 开始流式传输
   */
  async start(): Promise<void> {
    if (this.state.isStreaming) {
      logger.warn(`StreamingSession ${this.sessionId} is already streaming`);
      return;
    }

    logger.info(`Starting streaming session ${this.sessionId}`);
    
    this.state.isStreaming = true;
    this.state.connectionStatus = 'connecting';
    
    this.emitEvent({
      type: StreamEventType.SESSION_START,
      payload: {
        sessionId: this.sessionId,
        agentId: 'default',
        timestamp: Date.now()
      },
      metadata: {
        source: 'session',
        priority: 'high'
      }
    });

    this.state.connectionStatus = 'connected';
  }

  /**
   * 停止流式传输
   */
  async stop(reason: string = 'user_requested'): Promise<void> {
    if (!this.state.isStreaming) {
      return;
    }

    logger.info(`Stopping streaming session ${this.sessionId}, reason: ${reason}`);
    
    // 刷新剩余事件
    await this.flush();
    
    // 停止刷新定时器
    this.stopFlushTimer();
    
    this.state.isStreaming = false;
    this.state.connectionStatus = 'disconnected';
    
    this.emitEvent({
      type: StreamEventType.SESSION_END,
      payload: {
        sessionId: this.sessionId,
        reason
      },
      metadata: {
        source: 'session',
        priority: 'high'
      }
    });
  }

  /**
   * 发送事件
   */
  emitEvent(event: Partial<StreamEvent>): void {
    const fullEvent: StreamEvent = {
      id: event.id || uuidv4(),
      sessionId: this.sessionId,
      timestamp: event.timestamp || Date.now(),
      sequenceNumber: this.getNextSequenceNumber(),
      type: event.type!,
      payload: event.payload || {},
      metadata: {
        source: 'unknown',
        priority: 'normal',
        ...event.metadata
      }
    };

    // 更新状态
    this.state.eventCount++;
    this.state.lastEventTime = fullEvent.timestamp;
    
    // 处理背压
    if (this.shouldBuffer(fullEvent)) {
      this.bufferEvent(fullEvent);
    } else {
      this.processEvent(fullEvent);
    }
  }

  /**
   * 订阅特定类型的事件
   */
  onEvent<T extends StreamEventType>(
    eventType: T,
    handler: StreamEventHandler<T>
  ): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    
    this.eventHandlers.get(eventType)!.add(handler);
    
    // 返回取消订阅函数
    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<StreamingState> {
    return { ...this.state };
  }

  /**
   * 更新带宽估计
   */
  updateBandwidth(bytesPerSecond: number): void {
    // 使用指数移动平均
    const alpha = 0.2;
    this.state.bandwidth = alpha * bytesPerSecond + (1 - alpha) * this.state.bandwidth;
    
    logger.debug(`Updated bandwidth estimate: ${this.state.bandwidth.toFixed(2)} bytes/sec`);
  }

  /**
   * 更新背压指标
   */
  updateBackpressure(pressure: number): void {
    this.state.backpressure = Math.max(0, Math.min(1, pressure));
    
    if (this.state.backpressure > 0.8) {
      logger.warn(`High backpressure detected: ${(this.state.backpressure * 100).toFixed(1)}%`);
    }
  }

  /**
   * 私有方法：获取下一个序列号
   */
  private getNextSequenceNumber(): number {
    return ++this.sequenceNumber;
  }

  /**
   * 私有方法：判断是否需要缓冲
   */
  private shouldBuffer(event: StreamEvent): boolean {
    // 高优先级事件直接发送
    if (event.metadata.priority === 'critical') {
      return false;
    }

    // 基于背压和缓冲区大小决定
    return (
      this.state.backpressure > 0.5 ||
      this.eventBuffer.length >= this.options.bufferSize * 0.8
    );
  }

  /**
   * 私有方法：缓冲事件
   */
  private bufferEvent(event: StreamEvent): void {
    // 缓冲区满时丢弃低优先级事件
    if (this.eventBuffer.length >= this.options.bufferSize) {
      const lowPriorityIndex = this.eventBuffer.findIndex(
        e => e.metadata.priority === 'low'
      );
      
      if (lowPriorityIndex !== -1) {
        this.eventBuffer.splice(lowPriorityIndex, 1);
        logger.debug(`Dropped low priority event to make room`);
      } else {
        logger.warn(`Buffer full, dropping oldest event`);
        this.eventBuffer.shift();
      }
    }

    this.eventBuffer.push(event);
    this.state.bufferedEvents = this.eventBuffer.length;
  }

  /**
   * 私有方法：处理事件
   */
  private processEvent(event: StreamEvent): void {
    // 发送给特定类型的处理器
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          logger.error(`Error in event handler:`, error);
        }
      });
    }

    // 发送给通用监听器
    this.emit('event', event);
    this.emit(event.type, event);
  }

  /**
   * 私有方法：刷新缓冲区
   */
  private async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];
    this.state.bufferedEvents = 0;

    // 批量处理事件
    for (const event of eventsToFlush) {
      this.processEvent(event);
    }

    logger.debug(`Flushed ${eventsToFlush.length} buffered events`);
  }

  /**
   * 私有方法：启动刷新定时器
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(error => {
        logger.error(`Error flushing buffer:`, error);
      });
    }, this.options.flushInterval);
  }

  /**
   * 私有方法：停止刷新定时器
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * 获取会话统计信息
   */
  getStatistics(): {
    duration: number;
    totalEvents: number;
    eventsPerSecond: number;
    averageBackpressure: number;
    bufferUtilization: number;
  } {
    const duration = (Date.now() - this.startTime) / 1000;
    
    return {
      duration,
      totalEvents: this.state.eventCount,
      eventsPerSecond: this.state.eventCount / duration,
      averageBackpressure: this.state.backpressure,
      bufferUtilization: this.eventBuffer.length / this.options.bufferSize
    };
  }

  /**
   * 创建检查点
   */
  createCheckpoint(): string {
    const checkpointId = uuidv4();
    
    this.emitEvent({
      type: StreamEventType.CHECKPOINT_CREATED,
      payload: {
        checkpointId,
        stepIndex: this.state.eventCount,
        state: this.getState()
      },
      metadata: {
        source: 'session',
        priority: 'high'
      }
    });

    return checkpointId;
  }
}