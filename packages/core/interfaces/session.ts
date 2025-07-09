import { AgentStorage } from './agent.js';
import { IEventBus } from './events.js';

/**
 * 事件驱动的会话管理器接口
 * 专门为事件驱动架构设计，通过事件总线进行通信
 */
export interface ISessionManager {
    // 核心会话操作（简化版）
    createSession(userId?: string, agentId?: string): string;
    switchSession(sessionId: string): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    
    // 会话状态管理（异步）
    loadSession(sessionId: string): Promise<AgentStorage | null>;
    saveSession(sessionId: string, storage: AgentStorage): Promise<void>;
    
    // 会话查询（简化版）
    getCurrentSessionId(): string | undefined;
    listSessions(): Promise<AgentStorage[]>;
    getSessionStats(): Promise<SessionStats>;
    
    // 事件总线访问
    getEventBus(): IEventBus;
    
    // 资源清理
    dispose(): void;
}

/**
 * 简化的会话统计信息
 */
export interface SessionStats {
    totalSessions: number;
    activeSessions: number;
    currentSessionId?: string;
}

/**
 * 会话管理器配置
 */
export interface SessionManagerConfig {
    // 存储配置
    storageType?: 'memory' | 'file' | 'database';
    storagePath?: string;
    
    // 会话自动清理配置
    autoCleanup?: boolean;
    maxInactiveDuration?: number; // 毫秒
    maxSessionCount?: number;
    
    // 事件配置
    enableEventHistory?: boolean;
    eventHistoryLimit?: number;
    
    // 性能配置
    batchSaveEnabled?: boolean;
    batchSaveInterval?: number; // 毫秒
}

/**
 * 会话管理器工厂接口
 */
export interface ISessionManagerFactory {
    createSessionManager(
        agent: any, // 这里可以是StreamAgentV2或AsyncAgentV2
        eventBus: IEventBus,
        config?: SessionManagerConfig
    ): ISessionManager;
}

/**
 * 会话事件处理器接口
 * 定义会话管理器可以处理的事件类型
 */
export interface ISessionEventHandler {
    // 会话生命周期事件
    onSessionStarted(sessionId: string, data?: any): Promise<void>;
    onSessionEnded(sessionId: string, data?: any): Promise<void>;
    onSessionSwitched(sessionId: string, data?: any): Promise<void>;
    
    // Agent事件
    onAgentStepCompleted(stepIndex: number, sessionId: string, stepData: any): Promise<void>;
    onAgentStepFailed(stepIndex: number, sessionId: string, error: string): Promise<void>;
    onAgentStopped(sessionId: string, reason?: string): Promise<void>;
    
    // 存储事件
    onStorageSaveRequested(sessionId: string, storage: AgentStorage): Promise<void>;
    onStorageLoadRequested(sessionId: string): Promise<void>;
    
    // 错误事件
    onErrorOccurred(sessionId: string, error: Error, context?: any): Promise<void>;
}

/**
 * 会话管理器扩展接口
 * 可选的高级功能，不是所有实现都需要支持
 */
export interface ISessionManagerExtensions {
    // 会话归档和恢复
    archiveSession?(sessionId: string): Promise<void>;
    restoreSession?(sessionId: string): Promise<void>;
    listArchivedSessions?(): Promise<string[]>;
    
    // 会话导入导出
    exportSession?(sessionId: string): Promise<SessionExportData>;
    importSession?(data: SessionExportData): Promise<string>;
    
    // 会话模板
    createSessionFromTemplate?(templateId: string, userId?: string): Promise<string>;
    saveSessionAsTemplate?(sessionId: string, templateName: string): Promise<string>;
    
    // 会话克隆
    cloneSession?(sessionId: string, newUserId?: string): Promise<string>;
    
    // 批量操作
    batchDeleteSessions?(sessionIds: string[]): Promise<number>;
    batchArchiveSessions?(sessionIds: string[]): Promise<number>;
    
    // 高级查询
    findSessions?(filter: SessionFilter): Promise<AgentStorage[]>;
    getSessionMetrics?(sessionId: string): Promise<SessionMetrics>;
}

/**
 * 会话过滤器
 */
export interface SessionFilter {
    userId?: string;
    agentId?: string;
    startTime?: { from?: number; to?: number };
    stepRange?: { min?: number; max?: number };
    tokenRange?: { min?: number; max?: number };
    tags?: string[];
    isActive?: boolean;
}

/**
 * 会话指标
 */
export interface SessionMetrics {
    sessionId: string;
    duration: number; // 毫秒
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    toolCallsCount: number;
    totalTokensUsed: number;
    averageStepDuration: number;
    lastActivityTime: number;
}

/**
 * 会话导出数据
 */
export interface SessionExportData {
    version: string;
    exportTime: number;
    sessionData: AgentStorage;
    metadata: {
        agentVersion?: string;
        contextVersions?: Record<string, string>;
        toolVersions?: Record<string, string>;
    };
}

/**
 * 会话管理器事件类型
 * 会话管理器发布的特定事件
 */
export type SessionManagerEvent = 
    | {
        type: 'sessionManager.initialized';
        timestamp: number;
        source: string;
        data: { config: SessionManagerConfig };
    }
    | {
        type: 'sessionManager.disposed';
        timestamp: number;
        source: string;
        data: { reason?: string };
    }
    | {
        type: 'sessionManager.stats.updated';
        timestamp: number;
        source: string;
        data: { stats: SessionStats };
    }
    | {
        type: 'sessionManager.cleanup.completed';
        timestamp: number;
        source: string;
        data: { 
            sessionsRemoved: number; 
            storageFreed: number;
        };
    };

// ============================================
// 向后兼容性 - 废弃但保留的接口
// ============================================

/**
 * @deprecated 使用 SessionStats 替代
 * 保留以维持向后兼容性
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
 * @deprecated 使用 AgentStorage 替代
 * 保留以维持向后兼容性
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