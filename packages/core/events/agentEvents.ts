// Agent内部事件类型定义

import { AgentStep } from '../interfaces';

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
  payload: AgentStep & {
    // 额外的元数据
    agentId: string;
    action: 'start' | 'complete' | 'error';
  };
}

// Agent执行步骤开始事件（专门的简化结构）
export interface AgentStepStartEvent extends BaseEvent {
  type: 'agent_step_start';
  payload: {
    stepIndex: number;
    agentId: string;
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

// Agent思考过程事件
export interface AgentThinkingEvent extends BaseEvent {
  type: 'agent_thinking';
  payload: {
    stepNumber: number;
    thinking: {
      analysis?: string;
      plan?: string;
      reasoning?: string;
      nextAction?: string;
      executionStatus?: 'continue' | 'complete';
    };
    toolCalls: any[];
    rawThinking?: string; // 原始thinking文本
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

// File operation events
export interface FileCreatedEvent extends BaseEvent {
  type: 'file_created';
  payload: {
    path: string;
    size: number;
    diff: string;
  };
}

export interface FileModifiedEvent extends BaseEvent {
  type: 'file_modified';
  payload: {
    path: string;
    tool: 'edit_block' | 'ranged_edit' | 'unified_diff' | 'whole_file';
    changesApplied: number;
    diff: string;
  };
}

export interface FileDeletedEvent extends BaseEvent {
  type: 'file_deleted';
  payload: {
    path: string;
    isDirectory: boolean;
    filesDeleted: string[];
    diff?: string;
  };
}

export interface DirectoryCreatedEvent extends BaseEvent {
  type: 'directory_created';
  payload: {
    path: string;
    recursive: boolean;
  };
}

export interface DiffReversedEvent extends BaseEvent {
  type: 'diff_reversed';
  payload: {
    affectedFiles: string[];
    changesReverted: number;
    reason?: string;
  };
}

// Agent内部事件联合类型
export type AgentInternalEvent = 
  | AgentStepEvent
  | AgentStepStartEvent
  | ToolExecutionResultEvent
  | AgentStateChangeEvent
  | ContextUpdateEvent
  | TaskQueueEvent
  | AgentReplyEvent
  | AgentThinkingEvent
  | PlanCreatedEvent
  | PlanStepStartedEvent
  | PlanStepCompletedEvent
  | PlanProgressUpdateEvent
  | PlanCompletedEvent
  | PlanErrorEvent
  | FileCreatedEvent
  | FileModifiedEvent
  | FileDeletedEvent
  | DirectoryCreatedEvent
  | DiffReversedEvent; 