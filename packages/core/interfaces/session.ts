import { AgentStorage } from './agent';
import { AgentStep } from './prompt';
import { ToolCallParams, ToolExecutionResult } from './tool';

/**
 * Session manager interface for managing agent sessions and state
 */
export interface ISessionManager {
    agent: any;
    
    // Core session management
    setCallbacks(callbacks: ISessionManagerCallbacks): void;
    sendMessageToAgent(message: string, maxSteps: number, sessionId: string): Promise<string>;
    createSession(userId?: string, agentId?: string): string;
    getSessionCount(): number;
    
    // Session state management
    loadSession(sessionId: string): Promise<AgentStorage | null>;
    saveSession(sessionId: string, state: AgentStorage): Promise<void>;
    archiveSession(sessionId: string): Promise<void>;
    
    // Session utility methods
    getActiveSessions(): string[];
    cleanupExpiredSessions(maxAgeMs?: number): number;
    getStats(): SessionStats;
    getSessionDetails(sessionId: string): SessionDetails | null;
    updateTokenUsage(sessionId: string, additionalTokens: number): Promise<void>;
    getAllSessionsSummary(): SessionSummary[];
}

/**
 * Callback interface for session manager events
 */
export interface ISessionManagerCallbacks {
    onSessionStart?: (sessionId: string) => void;
    onSessionEnd?: (sessionId: string) => void;
    onAgentStep?: (step: AgentStep<any>) => void;
    onToolCall?: (toolCall: ToolCallParams) => void;
    onToolCallResult?: (result: ToolExecutionResult) => void;
}

/**
 * Session statistics interface
 */
export interface SessionStats {
    totalSessions: number;
    activeSessions: number;
    averageStepsPerSession: number;
    averageMessagesPerSession: number;
    averageAgentStepsPerSession: number;
}

/**
 * Session details interface
 */
export interface SessionDetails {
    sessionId: string;
    agentId: string;
    userId?: string;
    currentStep: number;
    agentStepsCount: number;
    messagesCount: number;
    totalTokensUsed: number;
    sessionDuration: number;
    lastActiveTime: string;
}

/**
 * Session summary interface
 */
export interface SessionSummary {
    sessionId: string;
    agentId: string;
    userId?: string;
    currentStep: number;
    agentStepsCount: number;
    isActive: boolean;
    lastActiveTime: string;
}