/**
 * 流式系统类型定义
 */

import { AgentStep, ToolCallParams, ToolExecutionResult } from '../interfaces';

/**
 * 流式事件类型枚举
 */
export enum StreamEventType {
  // 生命周期事件
  SESSION_START = 'session:start',
  SESSION_END = 'session:end',
  STEP_START = 'step:start',
  STEP_END = 'step:end',
  
  // 内容流事件
  TEXT_DELTA = 'text:delta',
  TEXT_CHUNK = 'text:chunk',
  TEXT_COMPLETE = 'text:complete',
  
  // 工具调用事件
  TOOL_DISCOVERY = 'tool:discovery',
  TOOL_CALL_START = 'tool:call:start',
  TOOL_CALL_PROGRESS = 'tool:call:progress',
  TOOL_CALL_COMPLETE = 'tool:call:complete',
  TOOL_CALL_ERROR = 'tool:call:error',
  
  // 思考过程事件
  THINKING_START = 'thinking:start',
  THINKING_PROGRESS = 'thinking:progress',
  THINKING_COMPLETE = 'thinking:complete',
  
  // 上下文事件
  CONTEXT_UPDATE = 'context:update',
  CONTEXT_SWITCH = 'context:switch',
  
  // 性能监控事件
  PERFORMANCE_METRIC = 'performance:metric',
  MEMORY_USAGE = 'memory:usage',
  
  // 错误和恢复
  ERROR_OCCURRED = 'error:occurred',
  ERROR_RECOVERED = 'error:recovered',
  CHECKPOINT_CREATED = 'checkpoint:created',
  
  // 多模态事件
  IMAGE_CHUNK = 'image:chunk',
  AUDIO_CHUNK = 'audio:chunk',
  FILE_CHUNK = 'file:chunk'
}

/**
 * 事件优先级
 */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * 流式事件基础结构
 */
export interface StreamEvent<T = any> {
  id: string;
  type: StreamEventType;
  sessionId: string;
  timestamp: number;
  sequenceNumber: number;
  payload: T;
  metadata: {
    stepIndex?: number;
    chunkIndex?: number;
    source: string;
    priority: EventPriority;
    correlationId?: string;
  };
}

/**
 * 事件类型映射
 */
export interface StreamEventMap {
  [StreamEventType.SESSION_START]: { sessionId: string; userId?: string; agentId: string };
  [StreamEventType.SESSION_END]: { sessionId: string; reason: string };
  [StreamEventType.STEP_START]: { stepIndex: number; timestamp: number };
  [StreamEventType.STEP_END]: { stepIndex: number; agentStep: AgentStep };
  
  [StreamEventType.TEXT_DELTA]: { text: string; position: number };
  [StreamEventType.TEXT_CHUNK]: { chunkIndex: number; text: string };
  [StreamEventType.TEXT_COMPLETE]: { fullText: string; tokenCount: number };
  
  [StreamEventType.TOOL_CALL_START]: { toolName: string; toolId: string; parameters: any; estimatedDuration?: number };
  [StreamEventType.TOOL_CALL_PROGRESS]: { toolId: string; progress: number; message?: string };
  [StreamEventType.TOOL_CALL_COMPLETE]: { toolId: string; result: ToolExecutionResult };
  [StreamEventType.TOOL_CALL_ERROR]: { toolId: string; error: Error };
  
  [StreamEventType.THINKING_START]: { stepIndex: number; timestamp: number };
  [StreamEventType.THINKING_PROGRESS]: { thought: string; confidence?: number };
  [StreamEventType.THINKING_COMPLETE]: { finalThought: string; decision?: string };
  
  [StreamEventType.CONTEXT_UPDATE]: { contextId: string; updates: any };
  [StreamEventType.CONTEXT_SWITCH]: { fromContext: string; toContext: string };
  
  [StreamEventType.PERFORMANCE_METRIC]: PerformanceMetric;
  [StreamEventType.MEMORY_USAGE]: MemoryUsageMetric;
  
  [StreamEventType.ERROR_OCCURRED]: { error: Error; context: any };
  [StreamEventType.ERROR_RECOVERED]: { error: Error; recoveryMethod: string };
  [StreamEventType.CHECKPOINT_CREATED]: { checkpointId: string; stepIndex: number };
  
  [StreamEventType.IMAGE_CHUNK]: { chunkIndex: number; totalChunks: number; data: string; mimeType: string };
  [StreamEventType.AUDIO_CHUNK]: { chunkIndex: number; totalChunks: number; data: ArrayBuffer };
  [StreamEventType.FILE_CHUNK]: { chunkIndex: number; totalChunks: number; data: Buffer; filename: string };
}

/**
 * 性能指标
 */
export interface PerformanceMetric {
  metric: string;
  value: number;
  unit: string;
  tags?: Record<string, string>;
}

/**
 * 内存使用指标
 */
export interface MemoryUsageMetric {
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

/**
 * 流式会话选项
 */
export interface StreamingOptions {
  enableCompression?: boolean;
  enableEncryption?: boolean;
  bufferSize?: number;
  flushInterval?: number;
  adaptiveBandwidth?: boolean;
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
}

/**
 * 流式会话状态
 */
export interface StreamingState {
  sessionId: string;
  isStreaming: boolean;
  startTime: number;
  eventCount: number;
  lastEventTime: number;
  bandwidth: number;
  backpressure: number;
  bufferedEvents: number;
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error';
}

/**
 * 客户端能力
 */
export interface ClientCapabilities {
  supportsWebSocket: boolean;
  supportsSSE: boolean;
  supportsHttp2: boolean;
  supportsCompression: boolean;
  requiresEncryption: boolean;
  maxBandwidth: number;
  preferredProtocol?: 'websocket' | 'sse' | 'http2';
}

/**
 * 流式检查点
 */
export interface StreamingCheckpoint {
  id: string;
  sessionId: string;
  timestamp: number;
  state: any;
  eventSequence: number;
  metadata?: Record<string, any>;
}

/**
 * 传输选项
 */
export interface TransportOptions {
  compression?: boolean;
  encryption?: boolean;
  maxBandwidth?: number;
  heartbeatInterval?: number;
}

/**
 * 事件处理器类型
 */
export type StreamEventHandler<T extends StreamEventType> = (
  event: StreamEvent<StreamEventMap[T]>
) => void | Promise<void>;

/**
 * 订阅者接口
 */
export interface StreamSubscriber {
  id: string;
  sessionId: string;
  eventTypes: StreamEventType[];
  handler: (event: StreamEvent) => void;
  filter?: (event: StreamEvent) => boolean;
  priority?: EventPriority;
}

/**
 * 缓冲区指标
 */
export interface BufferMetrics {
  bufferSize: number;
  bufferOccupancy: number;
  eventRate: number;
  clientProcessingRate: number;
  clientLatency: number;
  droppedEvents: number;
}

/**
 * 调试面板数据
 */
export interface DebugDashboard {
  eventRate: number;
  latencyP50: number;
  latencyP99: number;
  errorRate: number;
  activeStreams: number;
  eventTypeDistribution: Record<StreamEventType, number>;
  topErrors: Array<{ error: string; count: number }>;
}

/**
 * 事件追踪信息
 */
export interface EventTrace {
  event: StreamEvent;
  timeline: Array<{ timestamp: number; action: string }>;
  relatedEvents: StreamEvent[];
  performanceImpact: {
    processingTime: number;
    memoryDelta: number;
    cpuUsage: number;
  };
}