import { ISessionManager } from './session.js';
import { AgentStep } from './prompt.js';
import { ToolCallParams, ToolExecutionResult } from './tool.js';
import { IEventBus } from '../event-bus/index.js';

/**
 * 客户端消息类型
 */
export interface ClientMessage {
    id: string;
    content: string;
    type: 'user' | 'agent' | 'system' | 'tool' | 'error';
    timestamp: number;
    stepIndex?: number;
    metadata?: Record<string, any>;
}

/**
 * 客户端配置
 */
export interface ClientConfig {
    name?: string;
    userId?: string;
    agentId?: string;
    sessionId?: string;
    enableStreaming?: boolean;
    maxSteps?: number;
    theme?: 'light' | 'dark';
    displayOptions?: {
        showTimestamps?: boolean;
        showStepNumbers?: boolean;
        compactMode?: boolean;
    };
}

/**
 * 客户端类型
 */
export type ClientType = 'readline' | 'react-terminal' | 'web' | 'custom';

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
 * 通用客户端接口 - 所有客户端实现的核心接口
 */
export interface IClient {
    // 基本属性
    readonly name: string;
    readonly type: ClientType;
    currentSessionId?: string;
    sessionManager?: ISessionManager;
    
    // Event Bus for event-driven architecture
    eventBus?: IEventBus;
    
    // 核心方法
    initialize?(config: ClientConfig): Promise<void>;
    start?(): Promise<void>;
    stop?(): Promise<void>;
    
    // Session management
    setSessionManager(sessionManager: ISessionManager): void;
    createSession?(userId?: string, agentId?: string): string | undefined;
    switchSession?(sessionId: string): void;
    newSession(): void;
    
    // Event Bus setup
    setEventBus(eventBus: IEventBus): void;
    
    // Streaming mode check
    isStreamingMode(): boolean;

    // Communication
    sendMessageToAgent(message: string): Promise<void>;
    
    // 消息管理 (可选实现)
    addMessage?(message: ClientMessage): void;
    clearMessages?(): void;
    getMessages?(): ClientMessage[];
    
    // Status
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