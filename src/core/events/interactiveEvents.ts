// InteractiveLayer内部事件类型定义

// 基础事件接口
export interface BaseEvent {
  id: string;
  timestamp: number;
  source: 'user' | 'agent' | 'system';
  sessionId: string;
}

// 用户输入事件（用户的一般输入）
export interface UserInputEvent extends BaseEvent {
  type: 'user_input';
  payload: {
    content: string;
    inputType: 'command' | 'message' | 'file_upload';
    metadata?: {
      timestamp: number;
      clientInfo?: any;
    };
  };
}

// 执行模式变更事件已移至 crossEvents.ts

// 状态通知事件
export interface StatusUpdateEvent extends BaseEvent {
  type: 'status_update';
  payload: {
    stage: 'planning' | 'executing' | 'testing' | 'reviewing' | 'completed' | 'error';
    message: string;
    progress?: number; // 0-100
    details?: Record<string, any>;
  };
}

// 错误报告事件
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

// 文件操作事件
export interface FileOperationEvent extends BaseEvent {
  type: 'file_operation';
  payload: {
    operation: 'read' | 'write' | 'delete' | 'create' | 'move' | 'copy';
    filePath: string;
    preview?: string;
    backup?: boolean;
  };
}

// 命令执行事件
export interface CommandExecutionEvent extends BaseEvent {
  type: 'command_execution';
  payload: {
    command: string;
    workingDirectory?: string;
    environment?: Record<string, string>;
    timeout?: number;
    dangerous?: boolean;
  };
}

// 学习/训练数据收集事件
export interface DataCollectionEvent extends BaseEvent {
  type: 'data_collection';
  payload: {
    dataType: 'user_feedback' | 'performance_metric' | 'decision_outcome' | 'error_recovery';
    data: Record<string, any>;
    consent: boolean;
  };
}

// 任务管理事件
export interface TaskEvent extends BaseEvent {
  type: 'task_event';
  payload: {
    action: 'start' | 'pause' | 'resume' | 'cancel' | 'complete';
    taskId: string;
    taskDescription?: string;
    estimatedDuration?: number;
  };
}

// 上下文切换事件
export interface ContextSwitchEvent extends BaseEvent {
  type: 'context_switch';
  payload: {
    fromContext: string;
    toContext: string;
    reason: 'user_request' | 'agent_decision' | 'error_recovery' | 'task_completion';
  };
}

// 工具调用事件
export interface ToolCallEvent extends BaseEvent {
  type: 'tool_call';
  payload: {
    toolName: string;
    parameters: Record<string, any>;
    requiresApproval: boolean;
    estimatedRisk: 'low' | 'medium' | 'high';
  };
}

// 自我测试事件
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

// InteractiveLayer内部事件联合类型
export type InteractiveInternalEvent = 
  | UserInputEvent
  | StatusUpdateEvent
  | ErrorEvent
  | FileOperationEvent
  | CommandExecutionEvent
  | DataCollectionEvent
  | TaskEvent
  | ContextSwitchEvent
  | ToolCallEvent
  | SelfTestEvent; 