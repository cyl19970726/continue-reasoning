/**
 * 流式系统核心接口定义
 */

import { StreamEvent, StreamEventType, StreamingOptions, StreamingState, ClientCapabilities, TransportOptions, StreamSubscriber, StreamEventHandler } from './types';
import { AgentCallbacks } from '../interfaces';

/**
 * 流式传输接口 - 定义不同传输协议的统一接口
 */
export interface IStreamTransport {
  /**
   * 传输协议名称
   */
  readonly protocol: string;
  
  /**
   * 是否已连接
   */
  readonly isConnected: boolean;
  
  /**
   * 建立连接
   * @param sessionId 会话ID
   * @param options 传输选项
   */
  connect(sessionId: string, options: TransportOptions): Promise<void>;
  
  /**
   * 断开连接
   */
  disconnect(): Promise<void>;
  
  /**
   * 发送事件
   * @param event 要发送的事件
   */
  send(event: StreamEvent): Promise<void>;
  
  /**
   * 批量发送事件
   * @param events 事件数组
   */
  sendBatch(events: StreamEvent[]): Promise<void>;
  
  /**
   * 设置接收消息处理器
   * @param handler 消息处理函数
   */
  onMessage(handler: (message: any) => void): void;
  
  /**
   * 设置错误处理器
   * @param handler 错误处理函数
   */
  onError(handler: (error: Error) => void): void;
  
  /**
   * 设置连接关闭处理器
   * @param handler 关闭处理函数
   */
  onClose(handler: (code: number, reason: string) => void): void;
}

/**
 * 流式会话管理器接口 - 管理所有流式会话
 */
export interface IStreamingSessionManager {
  /**
   * 创建新的流式会话
   * @param userId 用户ID
   * @param options 流式选项
   * @returns 流式会话实例
   */
  createStreamingSession(userId: string, options?: StreamingOptions): Promise<IStreamingSession>;
  
  /**
   * 获取现有会话
   * @param sessionId 会话ID
   * @returns 流式会话实例或null
   */
  getSession(sessionId: string): IStreamingSession | null;
  
  /**
   * 结束会话
   * @param sessionId 会话ID
   * @param reason 结束原因
   */
  endSession(sessionId: string, reason?: string): Promise<void>;
  
  /**
   * 获取所有活跃会话
   * @returns 会话ID数组
   */
  getActiveSessions(): string[];
  
  /**
   * 广播事件到会话的所有订阅者
   * @param sessionId 会话ID
   * @param event 要广播的事件
   */
  broadcastToSession(sessionId: string, event: StreamEvent): void;
  
  /**
   * 添加会话订阅者
   * @param sessionId 会话ID
   * @param subscriber 订阅者
   */
  addSubscriber(sessionId: string, subscriber: StreamSubscriber): void;
  
  /**
   * 移除会话订阅者
   * @param sessionId 会话ID
   * @param subscriberId 订阅者ID
   */
  removeSubscriber(sessionId: string, subscriberId: string): void;
}

/**
 * 流式会话接口 - 单个流式会话的操作接口
 */
export interface IStreamingSession {
  /**
   * 会话ID
   */
  readonly sessionId: string;
  
  /**
   * 会话选项
   */
  readonly options: StreamingOptions;
  
  /**
   * 开始流式传输
   */
  start(): Promise<void>;
  
  /**
   * 停止流式传输
   * @param reason 停止原因
   */
  stop(reason?: string): Promise<void>;
  
  /**
   * 发送事件
   * @param event 部分事件数据（会自动补充完整）
   */
  emitEvent(event: Partial<StreamEvent>): void;
  
  /**
   * 订阅特定类型的事件
   * @param eventType 事件类型
   * @param handler 事件处理器
   * @returns 取消订阅函数
   */
  onEvent<T extends StreamEventType>(
    eventType: T,
    handler: StreamEventHandler<T>
  ): () => void;
  
  /**
   * 获取会话状态
   */
  getState(): Readonly<StreamingState>;
  
  /**
   * 创建检查点
   * @returns 检查点ID
   */
  createCheckpoint(): string;
}

/**
 * 传输层管理器接口 - 管理多种传输协议
 */
export interface IStreamTransportManager {
  /**
   * 注册传输协议
   * @param protocol 协议名称
   * @param transport 传输实现
   */
  registerTransport(protocol: string, transport: IStreamTransport): void;
  
  /**
   * 根据客户端能力创建最佳传输
   * @param sessionId 会话ID
   * @param capabilities 客户端能力
   * @returns 传输实例
   */
  createAdaptiveTransport(
    sessionId: string,
    capabilities: ClientCapabilities
  ): Promise<IStreamTransport>;
  
  /**
   * 获取指定协议的传输
   * @param protocol 协议名称
   * @returns 传输实例
   */
  getTransport(protocol: string): IStreamTransport | null;
}

/**
 * Agent回调桥接器接口 - 将Agent回调转换为流式事件
 */
export interface IAgentCallbackBridge {
  /**
   * 设置目标流式会话
   * @param session 流式会话
   */
  setStreamingSession(session: IStreamingSession): void;
  
  /**
   * 将Agent回调转换为流式回调
   * @returns 增强的Agent回调
   */
  createStreamingCallbacks(): AgentCallbacks;
  
  /**
   * 设置事件过滤器
   * @param filter 过滤函数
   */
  setEventFilter(filter: (event: StreamEvent) => boolean): void;
  
  /**
   * 设置事件转换器
   * @param transformer 转换函数
   */
  setEventTransformer(transformer: (event: StreamEvent) => StreamEvent): void;
}

/**
 * 缓冲管理器接口 - 管理事件缓冲和背压控制
 */
export interface IBufferManager {
  /**
   * 添加事件到缓冲区
   * @param sessionId 会话ID
   * @param event 事件
   * @returns 是否成功添加
   */
  bufferEvent(sessionId: string, event: StreamEvent): boolean;
  
  /**
   * 刷新缓冲区
   * @param sessionId 会话ID
   * @returns 刷新的事件数组
   */
  flush(sessionId: string): StreamEvent[];
  
  /**
   * 判断是否应该缓冲
   * @param sessionId 会话ID
   * @param event 事件
   * @returns 是否需要缓冲
   */
  shouldBuffer(sessionId: string, event: StreamEvent): boolean;
  
  /**
   * 获取缓冲区指标
   * @param sessionId 会话ID
   */
  getMetrics(sessionId: string): {
    bufferSize: number;
    occupancy: number;
    droppedEvents: number;
  };
  
  /**
   * 设置缓冲策略
   * @param sessionId 会话ID
   * @param strategy 缓冲策略
   */
  setBufferStrategy(sessionId: string, strategy: BufferStrategy): void;
}

/**
 * 缓冲策略接口
 */
export interface BufferStrategy {
  /**
   * 策略名称
   */
  name: string;
  
  /**
   * 决定是否缓冲事件
   * @param event 事件
   * @param metrics 当前指标
   * @returns 是否缓冲
   */
  shouldBuffer(event: StreamEvent, metrics: any): boolean;
  
  /**
   * 当缓冲区满时的处理
   * @param buffer 当前缓冲区
   * @param newEvent 新事件
   * @returns 更新后的缓冲区
   */
  handleBufferFull(buffer: StreamEvent[], newEvent: StreamEvent): StreamEvent[];
}

/**
 * 错误恢复管理器接口
 */
export interface IErrorRecoveryManager {
  /**
   * 处理流式错误
   * @param sessionId 会话ID
   * @param error 错误
   * @param context 错误上下文
   */
  handleError(sessionId: string, error: Error, context: any): Promise<void>;
  
  /**
   * 从检查点恢复
   * @param sessionId 会话ID
   * @param checkpointId 检查点ID
   */
  recoverFromCheckpoint(sessionId: string, checkpointId: string): Promise<void>;
  
  /**
   * 重试失败的操作
   * @param sessionId 会话ID
   * @param operation 操作标识
   * @param attempt 尝试次数
   */
  retry(sessionId: string, operation: string, attempt: number): Promise<boolean>;
  
  /**
   * 获取会话的错误历史
   * @param sessionId 会话ID
   */
  getErrorHistory(sessionId: string): Array<{
    timestamp: number;
    error: Error;
    recovered: boolean;
  }>;
}

/**
 * 监控和调试接口
 */
export interface IStreamingMonitor {
  /**
   * 记录事件
   * @param event 事件
   */
  recordEvent(event: StreamEvent): void;
  
  /**
   * 获取实时指标
   * @param sessionId 会话ID（可选）
   */
  getMetrics(sessionId?: string): {
    eventRate: number;
    latencyP50: number;
    latencyP99: number;
    errorRate: number;
    activeConnections: number;
  };
  
  /**
   * 追踪特定事件
   * @param eventId 事件ID
   */
  traceEvent(eventId: string): {
    event: StreamEvent;
    timeline: Array<{ timestamp: number; action: string }>;
    impact: any;
  };
  
  /**
   * 获取调试仪表板数据
   */
  getDashboard(): any;
  
  /**
   * 设置监控告警
   * @param metric 指标名称
   * @param threshold 阈值
   * @param handler 告警处理函数
   */
  setAlert(metric: string, threshold: number, handler: (value: number) => void): void;
}