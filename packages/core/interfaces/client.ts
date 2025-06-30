import { ISessionManager } from './session';
import { AgentStep } from './prompt';
import { ToolCallParams, ToolExecutionResult } from './tool';

/**
 * Client interface for interacting with agents
 */
export interface IClient {
    name: string;
    currentSessionId?: string;
    sessionManager?: ISessionManager;
    
    // Session management
    setSessionManager(sessionManager: ISessionManager): void;
    
    // Event handlers
    handleAgentStep(step: AgentStep<any>): void;
    handleToolCall(toolCall: ToolCallParams): void;
    handleToolCallResult(result: ToolExecutionResult): void;
    
    // Communication
    sendMessageToAgent(message: string): Promise<void>;
    
    // Session operations
    newSession(): void;
    
    // Status
    getStatus(): {
        name: string;
        hasSessionManager: boolean;
        currentSessionId?: string;
    };
}