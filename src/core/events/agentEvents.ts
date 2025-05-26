// Agent内部事件类型定义

// 基础事件接口
export interface BaseEvent {
  id: string;
  timestamp: number;
  source: 'user' | 'agent' | 'system';
  sessionId: string;
}

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

// 上下文更新事件
export interface ContextUpdateEvent extends BaseEvent {
  type: 'context_update';
  payload: {
    contextId: string;
    updateType: 'data' | 'toolCall' | 'install';
    data?: any;
  };
}

// 任务队列事件
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

// Agent回复用户事件
export interface AgentReplyEvent extends BaseEvent {
  type: 'agent_reply';
  payload: {
    content: string;
    replyType: 'text' | 'markdown' | 'structured';
    metadata?: {
      reasoning?: string;
      confidence?: number;
      suggestions?: string[];
    };
  };
}

// Agent内部事件联合类型
export type AgentInternalEvent = 
  | AgentStepEvent
  | ToolExecutionResultEvent
  | AgentStateChangeEvent
  | ContextUpdateEvent
  | TaskQueueEvent
  | AgentReplyEvent; 