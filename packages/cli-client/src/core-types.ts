/**
 * 核心类型定义 - 从核心包重新导出
 * 这样可以避免跨包导入的 TypeScript 配置问题
 */

// 基础接口定义
export interface IClient {
  name: string;
  currentSessionId?: string;
  sessionManager?: ISessionManager;
  setSessionManager(sessionManager: ISessionManager): void;
  handleAgentStep(step: AgentStep<any>): void;
  handleToolCall(toolCall: ToolCallParams): void;
  handleToolCallResult(result: ToolExecutionResult): void;
  sendMessageToAgent(message: string): Promise<void>;
  newSession(): void;
}

export interface ISessionManager {
  agent: any;
  setCallbacks(callbacks: ISessionManagerCallbacks): void;
  sendMessageToAgent(message: string, maxSteps: number, sessionId: string): Promise<string>;
  createSession(userId?: string, agentId?: string): string;
  getSessionCount(): number;
}

export interface ISessionManagerCallbacks {
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: (sessionId: string) => void;
  onAgentStep?: (step: AgentStep<any>) => void;
  onToolCall?: (toolCall: ToolCallParams) => void;
  onToolCallResult?: (result: ToolExecutionResult) => void;
}

export interface AgentStep<T = any> {
  stepIndex: number;
  rawText?: string;
  extractorResult?: T;
  error?: string;
  toolCalls?: Array<{
    name: string;
    call_id: string;
    params: any;
  }>;
  toolCallResults?: Array<{
    name: string;
    call_id: string;
    params: any;
    status: 'pending' | 'succeed' | 'failed';
    result?: any;
    message?: string;
    executionTime?: number;
  }>;
}

export interface ToolCallParams {
  type: "function";
  name: string;
  call_id: string;
  parameters: any;
}

export interface ToolExecutionResult {
  name: string;
  call_id: string;
  params: any;
  status: 'pending' | 'succeed' | 'failed';
  result?: any;
  message?: string;
} 