/**
 * Core type definitions - Define locally to avoid cross-package import issues
 * These should match the types in the core package
 */

// Base extractor result interface
export interface ExtractorResult {
  stopSignal?: boolean;
}

// Standard extractor result with thinking and stop signal
export interface StandardExtractorResult extends ExtractorResult {
  thinking?: string;      // Thinking content
  stopSignal?: boolean;   // Stop signal to end execution
  response?: string;      // Response content
  finalAnswer?: string;   // Legacy field for backward compatibility
}

// Enhanced thinking extractor result with structured content
export interface EnhancedThinkingExtractorResult extends ExtractorResult {
  // Structured thinking content
  analysis?: string;        // Analysis content
  plan?: string;           // Plan content  
  reasoning?: string;      // Reasoning content
  
  // Interactive content
  response?: string;       // Interactive response with user
  stopSignal?: boolean;    // Stop signal to end execution
}

// Agent step interface
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

// Local interface definitions for CLI client
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