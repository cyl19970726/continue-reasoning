// 基础事件接口
export interface BaseEvent {
  id: string;
  timestamp: number;
  source: 'user' | 'agent' | 'system';
  sessionId: string;
}

// 1. 执行模式控制事件
export interface ExecutionModeChangeEvent extends BaseEvent {
  type: 'execution_mode_change';
  payload: {
    requestId?: string; // 添加请求ID用于关联响应
    fromMode: 'auto' | 'manual' | 'supervised';
    toMode: 'auto' | 'manual' | 'supervised';
    reason?: string;
  };
}

// 执行模式变更确认事件
export interface ExecutionModeChangeConfirmedEvent extends BaseEvent {
  type: 'execution_mode_change_confirmed';
  payload: {
    requestId?: string; // 关联原始请求
    mode: 'auto' | 'manual' | 'supervised';
    timestamp: number;
    success: boolean;
    error?: string;
  };
}

// 2. 权限确认事件
export interface ApprovalRequestEvent extends BaseEvent {
  type: 'approval_request';
  payload: {
    requestId: string; // 添加 requestId 字段用于关联请求和响应
    actionType: 'file_write' | 'file_delete' | 'command_execute' | 'git_operation' | 'network_access';
    description: string;
    details: {
      command?: string;
      filePaths?: string[];
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      preview?: string; // 预览要执行的内容
    };
    timeout?: number; // 超时时间(ms)
  };
}

export interface ApprovalResponseEvent extends BaseEvent {
  type: 'approval_response';
  payload: {
    requestId: string;
    decision: 'accept' | 'reject' | 'modify';
    modification?: string; // 如果decision是modify时的修改内容
    rememberChoice?: boolean; // 是否记住这个选择
  };
}

// 3. 协作解决问题事件
export interface CollaborationRequestEvent extends BaseEvent {
  type: 'collaboration_request';
  payload: {
    problemType: 'error_resolution' | 'design_decision' | 'implementation_choice' | 'testing_strategy';
    context: {
      description: string;
      errorMessage?: string;
      codeSnippet?: string;
      filePath?: string;
      suggestions?: string[];
    };
    urgency: 'low' | 'medium' | 'high';
  };
}

export interface CollaborationResponseEvent extends BaseEvent {
  type: 'collaboration_response';
  payload: {
    requestId: string;
    response: string;
    actionItems?: string[];
    followUpQuestions?: string[];
  };
}

// 4. 状态通知事件
export interface StatusUpdateEvent extends BaseEvent {
  type: 'status_update';
  payload: {
    stage: 'planning' | 'executing' | 'testing' | 'reviewing' | 'completed' | 'error';
    message: string;
    progress?: number; // 0-100
    details?: Record<string, any>;
  };
}

// 5. 文件操作事件
export interface FileOperationEvent extends BaseEvent {
  type: 'file_operation';
  payload: {
    operation: 'read' | 'write' | 'delete' | 'create' | 'move' | 'copy';
    filePath: string;
    preview?: string; // 操作预览
    backup?: boolean; // 是否需要备份
  };
}

// 6. 命令执行事件
export interface CommandExecutionEvent extends BaseEvent {
  type: 'command_execution';
  payload: {
    command: string;
    workingDirectory?: string;
    environment?: Record<string, string>;
    timeout?: number;
    dangerous?: boolean; // 是否是危险命令
  };
}

// 7. 用户输入请求事件
export interface InputRequestEvent extends BaseEvent {
  type: 'input_request';
  payload: {
    prompt: string;
    inputType: 'text' | 'choice' | 'file_path' | 'confirmation';
    options?: string[]; // 用于choice类型
    validation?: {
      required: boolean;
      pattern?: string;
      minLength?: number;
      maxLength?: number;
    };
  };
}

export interface InputResponseEvent extends BaseEvent {
  type: 'input_response';
  payload: {
    requestId: string;
    value: string | boolean;
    cancelled?: boolean;
  };
}

// 8. 错误报告事件
export interface ErrorEvent extends BaseEvent {
  type: 'error';
  payload: {
    errorType: 'runtime_error' | 'validation_error' | 'permission_error' | 'network_error';
    message: string;
    stack?: string;
    recoverable: boolean;
    suggestions?: string[];
  };
}

// 9. 学习/训练数据收集事件
export interface DataCollectionEvent extends BaseEvent {
  type: 'data_collection';
  payload: {
    dataType: 'user_feedback' | 'performance_metric' | 'decision_outcome' | 'error_recovery';
    data: Record<string, any>;
    consent: boolean; // 用户是否同意收集
  };
}

// 10. 任务管理事件
export interface TaskEvent extends BaseEvent {
  type: 'task_event';
  payload: {
    action: 'start' | 'pause' | 'resume' | 'cancel' | 'complete';
    taskId: string;
    taskDescription?: string;
    estimatedDuration?: number;
  };
}

// 11. 上下文切换事件
export interface ContextSwitchEvent extends BaseEvent {
  type: 'context_switch';
  payload: {
    fromContext: string;
    toContext: string;
    reason: 'user_request' | 'agent_decision' | 'error_recovery' | 'task_completion';
  };
}

// 12. 工具调用事件
export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  payload: {
    toolName: string;
    parameters: Record<string, any>;
    requiresApproval: boolean;
    estimatedRisk: 'low' | 'medium' | 'high';
  };
}

// 13. 自我测试事件
export interface SelfTestEvent extends BaseEvent {
  type: 'self_test';
  payload: {
    testType: 'capability_assessment' | 'performance_benchmark' | 'regression_test';
    testName: string;
    result: 'pass' | 'fail' | 'partial';
    score?: number; // 0-100
    metrics?: Record<string, any>;
    recommendations?: string[];
  };
}

// 消息联合类型
export type InteractiveMessage = 
  | ExecutionModeChangeEvent
  | ExecutionModeChangeConfirmedEvent
  | ApprovalRequestEvent
  | ApprovalResponseEvent
  | CollaborationRequestEvent
  | CollaborationResponseEvent
  | StatusUpdateEvent
  | FileOperationEvent
  | CommandExecutionEvent
  | InputRequestEvent
  | InputResponseEvent
  | ErrorEvent
  | DataCollectionEvent
  | TaskEvent
  | ContextSwitchEvent
  | ToolCallEvent
  | SelfTestEvent;

// 能力接口
export interface InteractiveCapabilities {
  supportsRealTimeUpdates: boolean;
  supportsFilePreview: boolean;
  supportsCodeHighlighting: boolean;
  supportsInteractiveApproval: boolean;
  supportsCollaboration: boolean;
  maxConcurrentSessions: number;
  supportedEventTypes: string[];
}

// 完整的消息类型（交互 + 内部）
export type AllEventMessages = InteractiveMessage | InternalMessage;

// 消息处理器 - 更新为支持所有事件类型
export type MessageHandler = (message: AllEventMessages) => Promise<void>;

// 事件过滤器
export interface EventFilter {
  eventTypes?: string[];
  sources?: ('user' | 'agent' | 'system')[];
  sessionId?: string;
  afterTimestamp?: number;
  beforeTimestamp?: number;
}

// 事件订阅配置
export interface SubscriptionConfig {
  filter?: EventFilter;
  persistent?: boolean; // 是否持久化订阅
  maxEvents?: number; // 最大事件缓存数量
}

// ========== INTERNAL EVENTS (Agent内部通信事件) ==========

// Agent执行步骤事件
export interface AgentStepEvent extends BaseEvent {
  type: 'agent_step';
  payload: {
    stepNumber: number;
    action: 'start' | 'complete' | 'error';
    prompt?: string;
    toolCalls?: any[];
    error?: string;
  };
}

// 工具执行结果事件
export interface ToolExecutionResultEvent extends BaseEvent {
  type: 'tool_execution_result';
  payload: {
    toolName: string;
    callId: string;
    success: boolean;
    result?: any;
    error?: string;
    executionTime: number;
  };
}

// Agent状态变化事件
export interface AgentStateChangeEvent extends BaseEvent {
  type: 'agent_state_change';
  payload: {
    fromState: 'idle' | 'running' | 'stopping' | 'error';
    toState: 'idle' | 'running' | 'stopping' | 'error';
    reason?: string;
    currentStep?: number;
  };
}

// Context更新事件
export interface ContextUpdateEvent extends BaseEvent {
  type: 'context_update';
  payload: {
    contextId: string;
    updateType: 'data' | 'toolCall' | 'install';
    data?: any;
  };
}

// 队列任务事件
export interface TaskQueueEvent extends BaseEvent {
  type: 'task_queue';
  payload: {
    action: 'add' | 'start' | 'complete' | 'error';
    taskId: string;
    taskType: 'processStep' | 'toolCall' | 'custom';
    priority?: number;
    error?: string;
  };
}

// 扩展消息联合类型，包含内部事件
export type InternalMessage = 
  | AgentStepEvent
  | ToolExecutionResultEvent
  | AgentStateChangeEvent
  | ContextUpdateEvent
  | TaskQueueEvent; 