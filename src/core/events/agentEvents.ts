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

// Plan 相关事件
export interface PlanCreatedEvent extends BaseEvent {
  type: 'plan_created';
  payload: {
    planId: string;
    title: string;
    description: string;
    totalSteps: number;
    steps: Array<{
      id: string;
      title: string;
      description: string;
      toolsToCall?: string[];
    }>;
  };
}

export interface PlanStepStartedEvent extends BaseEvent {
  type: 'plan_step_started';
  payload: {
    planId: string;
    stepId: string;
    stepIndex: number;
    stepTitle: string;
    stepDescription: string;
    toolsToCall?: string[];
  };
}

export interface PlanStepCompletedEvent extends BaseEvent {
  type: 'plan_step_completed';
  payload: {
    planId: string;
    stepId: string;
    stepIndex: number;
    stepTitle: string;
    completedAt: number;
    nextStepId?: string;
    nextStepTitle?: string;
  };
}

export interface PlanProgressUpdateEvent extends BaseEvent {
  type: 'plan_progress_update';
  payload: {
    planId: string;
    currentStepIndex: number;
    totalSteps: number;
    completedSteps: number;
    progress: number; // 0-100
    currentStepTitle?: string;
  };
}

export interface PlanCompletedEvent extends BaseEvent {
  type: 'plan_completed';
  payload: {
    planId: string;
    title: string;
    totalSteps: number;
    completedAt: number;
    executionTime: number; // 毫秒
  };
}

export interface PlanErrorEvent extends BaseEvent {
  type: 'plan_error';
  payload: {
    planId: string;
    stepId?: string;
    stepTitle?: string;
    error: string;
    recoverable: boolean;
  };
}

// Agent内部事件联合类型
export type AgentInternalEvent = 
  | AgentStepEvent
  | ToolExecutionResultEvent
  | AgentStateChangeEvent
  | ContextUpdateEvent
  | TaskQueueEvent
  | AgentReplyEvent
  | PlanCreatedEvent
  | PlanStepStartedEvent
  | PlanStepCompletedEvent
  | PlanProgressUpdateEvent
  | PlanCompletedEvent
  | PlanErrorEvent; 