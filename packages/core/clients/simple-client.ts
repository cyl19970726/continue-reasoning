import { logger } from "../utils/logger.js";
import { AgentStep, IClient, ISessionManager, ToolCallParams, ToolExecutionResult, ClientStatus, ClientType, AgentStorage, ClientConfig, SessionStats } from "../interfaces/index.js";
import { IEventBus } from "../event-bus/index.js";

/**
 * 简单客户端实现 - 事件驱动版本
 */
export class SimpleClient implements IClient {
    readonly name: string;
    readonly type: ClientType = 'cli';
    currentSessionId?: string;
    sessionManager?: ISessionManager;
    eventBus?: IEventBus;

    constructor(name: string = 'SimpleClient') {
        this.name = name;
        logger.info(`SimpleClient ${name} initialized`);
    }

    async initialize(config: ClientConfig): Promise<void> {
        logger.info(`Initializing SimpleClient with config:`, config);
        
        if (config.sessionId) {
            this.currentSessionId = config.sessionId;
        }
        
        // 其他初始化逻辑...
        logger.info(`SimpleClient ${this.name} initialized successfully`);
    }

    async start(): Promise<void> {
        logger.info(`Starting SimpleClient ${this.name}`);
        
        // 如果有eventBus，设置事件监听
        if (this.eventBus) {
            this.setupEventListeners();
        }
        
        logger.info(`SimpleClient ${this.name} started successfully`);
    }

    async stop(): Promise<void> {
        logger.info(`Stopping SimpleClient ${this.name}`);
        
        // 清理事件监听
        if (this.eventBus) {
            this.cleanupEventListeners();
        }
        
        logger.info(`SimpleClient ${this.name} stopped successfully`);
    }

    setSessionManager(sessionManager: ISessionManager): void {
        this.sessionManager = sessionManager;
        
        // 如果SessionManager有EventBus，使用它
        if (sessionManager.getEventBus) {
            this.eventBus = sessionManager.getEventBus();
            this.setupEventListeners();
        }
        
        logger.info(`SessionManager set for SimpleClient ${this.name}`);
    }

    setEventBus(eventBus: IEventBus): void {
        this.eventBus = eventBus;
        this.setupEventListeners();
        logger.info(`EventBus set for SimpleClient ${this.name}`);
    }

    createSession(userId?: string, agentId?: string): string {
        if (!this.sessionManager) {
            logger.error('SessionManager not available');
            throw new Error('SessionManager not available');
        }
        
        const sessionId = this.sessionManager.createSession(userId, agentId);
        this.currentSessionId = sessionId;
        logger.info(`Created new session: ${sessionId}`);
        return sessionId;
    }

    async switchSession(sessionId: string): Promise<void> {
        if (!this.sessionManager) {
            logger.error('SessionManager not available');
            throw new Error('SessionManager not available');
        }
        
        await this.sessionManager.switchSession(sessionId);
        this.currentSessionId = sessionId;
        logger.info(`Switched to session: ${sessionId}`);
    }

    async deleteSession(sessionId: string): Promise<void> {
        if (!this.sessionManager) {
            throw new Error('SessionManager not available');
        }
        
        await this.sessionManager.deleteSession(sessionId);
        
        // 如果删除的是当前会话，清除当前会话ID
        if (this.currentSessionId === sessionId) {
            this.currentSessionId = undefined;
        }
        
        logger.info(`Deleted session: ${sessionId}`);
    }

    async loadSession(sessionId: string): Promise<AgentStorage | null> {
        if (!this.sessionManager) {
            return null;
        }
        
        return await this.sessionManager.loadSession(sessionId);
    }

    async saveSession(sessionId: string, storage: AgentStorage): Promise<void> {
        if (!this.sessionManager) {
            throw new Error('SessionManager not available');
        }
        
        await this.sessionManager.saveSession(sessionId, storage);
    }

    getCurrentSessionId(): string | undefined {
        return this.currentSessionId;
    }

    async listSessions(): Promise<AgentStorage[]> {
        if (!this.sessionManager) {
            return [];
        }
        
        return await this.sessionManager.listSessions();
    }

    async getSessionStats(): Promise<SessionStats> {
        if (!this.sessionManager) {
            return {
                totalSessions: 0,
                activeSessions: 0,
                currentSessionId: this.currentSessionId
            };
        }
        
        return await this.sessionManager.getSessionStats();
    }

    async newSession(): Promise<void> {
        const sessionId = this.createSession();
        if (sessionId) {
            await this.switchSession(sessionId);
        }
    }

    isStreamingMode(): boolean {
        // 这个客户端默认支持流式模式
        return true;
    }

    async sendMessageToAgent(message: string): Promise<void> {
        if (!this.sessionManager) {
            logger.error('SessionManager not available');
            return;
        }
        
        if (!this.currentSessionId) {
            logger.error('No active session');
            return;
        }
        
        try {
            // 通过EventBus发送消息而不是直接调用SessionManager
            if (this.eventBus) {
                this.eventBus.publish({
                    type: 'user.message',
                    timestamp: Date.now(),
                    source: `client.${this.name}`,
                    data: {
                        message,
                        sessionId: this.currentSessionId,
                        clientName: this.name
                    }
                });
            } else {
                logger.error('EventBus not available');
            }
        } catch (error) {
            logger.error('Failed to send message to agent:', error);
        }
    }

    addMessage(message: any): void {
        // 简单记录消息
        logger.info(`[${this.name}] Message:`, message);
    }

    clearMessages(): void {
        // 简单实现：清空消息
        logger.info(`[${this.name}] Messages cleared`);
    }

    getMessages(): any[] {
        // 简单实现：返回空数组
        return [];
    }

    getStatus(): ClientStatus {
        return {
            name: this.name,
            type: this.type,
            isInitialized: true,
            isRunning: true,
            hasSessionManager: !!this.sessionManager,
            currentSessionId: this.currentSessionId,
            messageCount: 0,
            lastActivity: Date.now()
        };
    }

    /**
     * 设置事件监听
     */
    private setupEventListeners(): void {
        if (!this.eventBus) return;
        
        // 监听会话事件
        this.eventBus.subscribe('session.started', (event) => {
            logger.info(`[${this.name}] Session started:`, event.data);
            if (event.type === 'session.started') {
                this.onSessionStarted(event.sessionId);
            }
        });
        
        this.eventBus.subscribe('session.ended', (event) => {
            logger.info(`[${this.name}] Session ended:`, event.data);
            if (event.type === 'session.ended') {
                this.onSessionEnded(event.sessionId);
            }
        });
        
        // 监听Agent步骤事件
        this.eventBus.subscribe('agent.step.completed', (event) => {
            logger.info(`[${this.name}] Agent step completed:`, event.data);
            if (event.type === 'agent.step.completed' && event.data?.step) {
                this.onAgentStep(event.data.step);
            }
        });
        
        // 监听工具执行事件
        this.eventBus.subscribe('tool.execution.started', (event) => {
            logger.info(`[${this.name}] Tool execution started:`, event.data);
            if (event.type === 'tool.execution.started' && event.data?.toolCall) {
                this.onToolExecutionStart(event.data.toolCall);
            }
        });
        
        this.eventBus.subscribe('tool.execution.completed', (event) => {
            logger.info(`[${this.name}] Tool execution completed:`, event.data);
            if (event.type === 'tool.execution.completed' && event.data?.result) {
                this.onToolExecutionEnd(event.data.result);
            }
        });
        
        // 监听LLM文本增量事件
        this.eventBus.subscribe('llm.text.delta', (event) => {
            if (event.type === 'llm.text.delta' && event.data?.stepIndex !== undefined && event.data?.chunkIndex !== undefined && event.data?.delta) {
                this.onLLMTextDelta(event.data.stepIndex, event.data.chunkIndex, event.data.delta);
            }
        });
        
        this.eventBus.subscribe('llm.text.completed', (event) => {
            if (event.type === 'llm.text.completed' && event.data?.stepIndex !== undefined && event.data?.chunkIndex !== undefined && event.data?.text) {
                this.onLLMTextDone(event.data.stepIndex, event.data.chunkIndex, event.data.text);
            }
        });
        
        // 监听错误事件
        this.eventBus.subscribe('error.occurred', (event) => {
            logger.error(`[${this.name}] Error event:`, event.data);
            if (event.type === 'error.occurred' && event.data?.error) {
                this.onError(event.data.error);
            }
        });
        
        logger.info(`[${this.name}] Event listeners set up`);
    }

    /**
     * 清理事件监听
     */
    private cleanupEventListeners(): void {
        if (!this.eventBus) return;
        
        // 取消所有事件订阅
        this.eventBus.unsubscribe('session.started');
        this.eventBus.unsubscribe('session.ended');
        this.eventBus.unsubscribe('agent.step.completed');
        this.eventBus.unsubscribe('tool.execution.started');
        this.eventBus.unsubscribe('tool.execution.completed');
        this.eventBus.unsubscribe('llm.text.delta');
        this.eventBus.unsubscribe('llm.text.complete');
        this.eventBus.unsubscribe('error');
        
        logger.info(`[${this.name}] Event listeners cleaned up`);
    }

    /**
     * 事件处理方法
     */
    private onSessionStarted(sessionId: string): void {
        logger.info(`[${this.name}] Session started: ${sessionId}`);
        // 可以在这里添加UI更新逻辑
    }

    private onSessionEnded(sessionId: string): void {
        logger.info(`[${this.name}] Session ended: ${sessionId}`);
        // 可以在这里添加UI更新逻辑
    }

    private onAgentStep(step: AgentStep): void {
        logger.info(`[${this.name}] Agent step:`, step);
        // 可以在这里添加UI更新逻辑
    }

    private onToolExecutionStart(toolCall: ToolCallParams): void {
        logger.info(`[${this.name}] Tool execution started:`, toolCall);
        // 可以在这里添加UI更新逻辑
    }

    private onToolExecutionEnd(result: ToolExecutionResult): void {
        logger.info(`[${this.name}] Tool execution completed:`, result);
        // 可以在这里添加UI更新逻辑
    }

    private onLLMTextDelta(stepIndex: number, chunkIndex: number, delta: string): void {
        // 处理流式文本增量
        logger.debug(`[${this.name}] LLM text delta [${stepIndex}:${chunkIndex}]:`, delta);
        // 可以在这里添加实时文本显示逻辑
    }

    private onLLMTextDone(stepIndex: number, chunkIndex: number, text: string): void {
        // 处理完整文本
        logger.info(`[${this.name}] LLM text done [${stepIndex}:${chunkIndex}]:`, text);
        // 可以在这里添加UI更新逻辑
    }

    private onError(error: any): void {
        logger.error(`[${this.name}] Error:`, error);
        // 可以在这里添加错误处理逻辑
    }

    /**
     * 简单的存储加载方法 - 事件驱动版本
     */
    async loadAgentStorage(sessionId: string): Promise<AgentStorage | null> {
        logger.info(`[${this.name}] Loading agent storage for session: ${sessionId}`);
        
        // 发布存储加载请求事件
        if (this.eventBus) {
            this.eventBus.publish({
                type: 'storage.load.requested',
                timestamp: Date.now(),
                source: `client.${this.name}`,
                data: {
                    sessionId,
                    clientName: this.name
                }
            });
        }
        
        // 简单实现：返回null，实际应该从存储系统加载
        return null;
    }

    /**
     * 简单的存储保存方法 - 事件驱动版本
     */
    async saveAgentStorage(sessionId: string, storage: AgentStorage): Promise<void> {
        logger.info(`[${this.name}] Saving agent storage for session: ${sessionId}`);
        
        // 发布存储保存请求事件
        if (this.eventBus) {
            this.eventBus.publish({
                type: 'storage.save.requested',
                timestamp: Date.now(),
                source: `client.${this.name}`,
                data: {
                    sessionId,
                    storage,
                    clientName: this.name
                }
            });
        }
    }
}