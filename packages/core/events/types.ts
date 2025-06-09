// 事件类型统一导出文件
// 从各个事件文件中导入并重新导出

// 导入Agent内部事件
export type {
  BaseEvent,
  AgentStepEvent,
  ToolExecutionResultEvent,
  AgentStateChangeEvent,
  ContextUpdateEvent,
  TaskQueueEvent,
  AgentReplyEvent,
  AgentInternalEvent
} from './agentEvents';

// 导入InteractiveLayer内部事件
export type {
  StatusUpdateEvent,
  FileOperationEvent,
  CommandExecutionEvent,
  ErrorEvent,
  DataCollectionEvent,
  TaskEvent,
  ContextSwitchEvent,
  ToolCallEvent,
  SelfTestEvent,
  InteractiveInternalEvent
} from './interactiveEvents';

// 导入跨组件交互事件
export type {
  ExecutionModeChangeRequestEvent,
  ExecutionModeChangeResponseEvent,
  ApprovalRequestEvent,
  ApprovalResponseEvent,
  InputRequestEvent,
  InputResponseEvent,
  CollaborationRequestEvent,
  CollaborationResponseEvent,
  UserMessageEvent,
  CrossComponentEvent
} from './crossEvents';

// 交互能力接口
export interface InteractiveCapabilities {
  supportsRealTimeUpdates: boolean;
  supportsFilePreview: boolean;
  supportsCodeHighlighting: boolean;
  supportsInteractiveApproval: boolean;
  supportsCollaboration: boolean;
  maxConcurrentSessions: number;
  supportedEventTypes: string[];
}

// 所有事件消息的联合类型
export type InteractiveMessage = CrossComponentEvent;
export type InternalMessage = AgentInternalEvent | InteractiveInternalEvent;
export type AllEventMessages = InteractiveMessage | InternalMessage;

// 事件处理器类型
export type MessageHandler = (message: AllEventMessages) => Promise<void>;

// 事件过滤器
export interface EventFilter {
  eventTypes?: string[];
  sources?: ('user' | 'agent' | 'system')[];
  sessionId?: string;
  afterTimestamp?: number;
  beforeTimestamp?: number;
}

// 订阅配置
export interface SubscriptionConfig {
  filter?: EventFilter;
  persistent?: boolean; // 是否持久化订阅
  maxEvents?: number; // 最大事件缓存数量
} 