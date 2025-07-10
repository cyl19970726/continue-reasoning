import { IEventBus } from './events.js';
import { AgentStorage } from './agent.js';
import { ISessionManager, SessionStats } from './session.js';

/**
 * 客户端类型
 */
export type ClientType = 'web' | 'cli' | 'api' | 'react-terminal';

/**
 * 客户端配置
 */
export interface ClientConfig {
    name?: string;
    userId?: string;
    agentId?: string;
    debug?: boolean;
    // 可扩展的配置
    [key: string]: any;
}

/**
 * 客户端状态
 */
export interface ClientStatus {
    name: string;
    type: ClientType;
    isInitialized: boolean;
    isRunning: boolean;
    hasSessionManager: boolean;
    currentSessionId?: string;
    messageCount: number;
    lastActivity?: number;
}

/**
 * 客户端消息类型
 */
export interface ClientMessage {
    id: string;
    content: string;
    type: 'user' | 'agent' | 'agent.response' | 'agent.reasoning' | 'system' | 'tool' | 'tool.start' | 'tool.completed' | 'error';
    timestamp: number;
    stepIndex?: number;
    metadata?: Record<string, any>;
}

// 移除重复的接口定义，从session.ts中导入

/**
 * 统一的客户端接口 - 基于事件驱动架构
 * 通过SessionManager与Agent交互，不直接管理Agent
 */
export interface IClient {
    // ==================== 基本属性 ====================
    readonly name: string;
    readonly type: ClientType;
    currentSessionId?: string;
    
    // ==================== 核心依赖 ====================
    // Session Manager for agent interaction
    sessionManager?: ISessionManager;
    
    // Event Bus for event-driven architecture
    eventBus?: IEventBus;
    
    // ==================== 生命周期管理 ====================
    initialize?(config: ClientConfig): Promise<void>;
    start?(): Promise<void>;
    stop?(): Promise<void>;
    
    // ==================== Session Manager 管理 ====================
    // 设置Session Manager实例
    setSessionManager(sessionManager: ISessionManager): void;
    
    // ==================== Agent通信 (通过SessionManager) ====================
    // Agent通信 - 委托给SessionManager
    sendMessageToAgent(message: string): Promise<void>;
    
    // ==================== 会话管理 (委托给SessionManager) ====================
    // 会话操作
    createSession(userId?: string, agentId?: string): string;
    switchSession(sessionId: string): Promise<void>;
    deleteSession(sessionId: string): Promise<void>;
    
    // 会话状态管理
    loadSession(sessionId: string): Promise<AgentStorage | null>;
    saveSession(sessionId: string, storage: AgentStorage): Promise<void>;
    
    // 会话查询
    getCurrentSessionId(): string | undefined;
    listSessions(): Promise<AgentStorage[]>;
    getSessionStats(): Promise<SessionStats>;
    
    // ==================== 事件管理 ====================
    // Event Bus setup
    setEventBus(eventBus: IEventBus): void;
    
    // ==================== 消息管理 ====================
    // 流式模式检查
    isStreamingMode(): boolean;
    
    // 消息管理
    addMessage?(message: ClientMessage): void;
    clearMessages?(): void;
    getMessages?(): ClientMessage[];
    
    // ==================== 状态查询 ====================
    getStatus(): ClientStatus;
}

/**
 * 客户端工厂函数类型
 */
export type ClientFactory<T extends IClient = IClient> = (config: ClientConfig) => T;

/**
 * 客户端注册表接口
 */
export interface IClientRegistry {
    register<T extends IClient>(type: string, factory: ClientFactory<T>): void;
    create<T extends IClient>(type: string, config: ClientConfig): T;
    getAvailableTypes(): string[];
    isTypeAvailable(type: string): boolean;
}