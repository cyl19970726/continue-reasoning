// Agent和InteractiveLayer之间的交互事件类型定义

// 基础事件接口
export interface BaseEvent {
  id: string;
  timestamp: number;
  source: 'user' | 'agent' | 'system';
  sessionId: string;
}

// 1. 执行模式变更请求/响应
export interface ExecutionModeChangeRequestEvent extends BaseEvent {
  type: 'execution_mode_change_request';
  payload: {
    requestId: string;
    fromMode: 'auto' | 'manual' | 'supervised';
    toMode: 'auto' | 'manual' | 'supervised';
    reason?: string;
  };
}

export interface ExecutionModeChangeResponseEvent extends BaseEvent {
  type: 'execution_mode_change_response';
  payload: {
    requestId: string;
    mode: 'auto' | 'manual' | 'supervised';
    timestamp: number;
    success: boolean;
    error?: string;
  };
}

// 2. 权限确认请求/响应
export interface ApprovalRequestEvent extends BaseEvent {
  type: 'approval_request';
  payload: {
    requestId: string;
    actionType: 'file_write' | 'file_delete' | 'command_execute' | 'git_operation' | 'network_access';
    description: string;
    details: {
      command?: string;
      filePaths?: string[];
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      preview?: string;
    };
    timeout?: number;
  };
}

export interface ApprovalResponseEvent extends BaseEvent {
  type: 'approval_response';
  payload: {
    requestId: string;
    decision: 'accept' | 'reject' | 'modify';
    modification?: string;
    rememberChoice?: boolean;
  };
}

// 3. 用户输入请求/响应（Agent主动请求特定输入，如密码、配置等）
export interface InputRequestEvent extends BaseEvent {
  type: 'input_request';
  payload: {
    requestId: string;
    prompt: string;
    inputType: 'text' | 'choice' | 'file_path' | 'confirmation' | 'password' | 'config';
    options?: string[];
    validation?: {
      required: boolean;
      pattern?: string;
      minLength?: number;
      maxLength?: number;
    };
    sensitive?: boolean;
    timeout?: number;
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

// 4. 协作解决问题请求/响应
export interface CollaborationRequestEvent extends BaseEvent {
  type: 'collaboration_request';
  payload: {
    requestId: string;
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

// 5. 用户消息处理（用户的一般输入需要Agent处理）
export interface UserMessageEvent extends BaseEvent {
  type: 'user_message';
  payload: {
    content: string;
    messageType: 'question' | 'command' | 'request' | 'feedback';
    context?: {
      previousMessages?: string[];
      currentTask?: string;
      userIntent?: string;
    };
  };
}

// 跨组件交互事件联合类型
export type CrossComponentEvent = 
  | ExecutionModeChangeRequestEvent
  | ExecutionModeChangeResponseEvent
  | ApprovalRequestEvent
  | ApprovalResponseEvent
  | InputRequestEvent
  | InputResponseEvent
  | CollaborationRequestEvent
  | CollaborationResponseEvent
  | UserMessageEvent;

// 所有事件类型的联合
export type AllEventTypes = CrossComponentEvent; 