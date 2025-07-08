import { AgentStorage } from './agent.js';
import { AgentStep } from './prompt.js';
import { ToolCallParams, ToolExecutionResult } from './tool.js';

/**
 * Session manager interface for managing agent sessions and state
 */
export interface ISessionManager {
    agent: any;
    
    // Core session management
    setClient(client: any): void; // 设置客户端以连接 client callbacks
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

// ISessionManagerCallbacks 已移除
// 在新架构中，所有回调都通过 Client 的 AgentCallbacks 统一处理

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