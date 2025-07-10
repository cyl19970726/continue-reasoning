import { ISessionManager, SessionStats, AgentStorage, IClient } from "../interfaces/index.js";
import { logger } from "../utils/logger.js";
import { 
    EventBus, 
    EventSubscriber, 
    IEventBus,
    SessionEvent,
    AgentEvent,
    ErrorEvent,
    StorageEvent,
    AppEvent
} from "../event-bus/index.js";


/**
 * 具体的EventSubscriber实现
 */
class SessionManagerEventSubscriber extends EventSubscriber {}

/**
 * 会话管理器 - 基于事件驱动架构
 * 替代传统的回调机制，通过事件总线监听Agent状态变化
 */
export class SessionManager implements ISessionManager {
    private eventSubscriber: SessionManagerEventSubscriber;
    private sessions: Map<string, AgentStorage> = new Map();
    private currentSessionId?: string;

    constructor(
        private agent: any, // 支持StreamAgent或AsyncAgent
        private eventBus: IEventBus
    ) {
        // 初始化事件订阅者
        this.eventSubscriber = new SessionManagerEventSubscriber(eventBus, 'SessionManager');
        
        // 设置事件订阅
        this.setupEventSubscriptions();
        
        logger.info('SessionManager: Initialized with event-driven architecture');
    }

    /**
     * 设置事件订阅
     */
    private setupEventSubscriptions(): void {
        // 订阅会话相关事件
        this.eventSubscriber.subscribeToSessionEvents(
            this.handleSessionEvent.bind(this)
        );

        // 订阅Agent步骤事件
        this.eventSubscriber.subscribeToAgentEvents(
            this.handleAgentEvent.bind(this)
        );

        // 订阅存储事件
        this.eventSubscriber.subscribeToStorageEvents(
            this.handleStorageEvent.bind(this)
        );

        // 订阅错误事件
        this.eventSubscriber.subscribeToErrorEvents(
            this.handleErrorEvent.bind(this)
        );

        logger.info('SessionManager: Event subscriptions configured');
    }

    /**
     * 处理会话事件
     */
    private async handleSessionEvent(event: SessionEvent): Promise<void> {
        try {
            switch (event.type) {
                case 'session.started':
                    await this.onSessionStarted(event.sessionId, event.data);
                    break;
                
                case 'session.ended':
                    await this.onSessionEnded(event.sessionId, event.data);
                    break;
                
                default:
                    logger.debug(`SessionManager: Unhandled session event: ${event.type}`);
            }
        } catch (error) {
            logger.error('SessionManager: Error handling session event:', error);
        }
    }

    /**
     * 处理Agent事件
     */
    private async handleAgentEvent(event: AgentEvent): Promise<void> {
        try {
            switch (event.type) {
                case 'agent.step.completed':
                    await this.onAgentStepCompleted(event);
                    break;
                
                case 'agent.step.failed':
                    await this.onAgentStepFailed(event);
                    break;
                
                case 'agent.stopped':
                    await this.onAgentStopped(event);
                    break;
                
                default:
                    logger.debug(`SessionManager: Unhandled agent event: ${event.type}`);
            }
        } catch (error) {
            logger.error('SessionManager: Error handling agent event:', error);
        }
    }

    /**
     * 处理存储事件
     */
    private async handleStorageEvent(event: StorageEvent): Promise<void> {
        try {
            switch (event.type) {
                case 'storage.save.requested':
                    if (event.data?.storage) {
                        await this.saveSession(event.sessionId!, event.data.storage);
                    }
                    break;
                
                case 'storage.load.requested':
                    if (event.sessionId) {
                        const storage = await this.loadSession(event.sessionId);
                        // 通过事件总线发布加载的存储数据
                        await this.eventBus.publish({
                            type: 'storage.updated',
                            timestamp: Date.now(),
                            source: 'SessionManager',
                            sessionId: event.sessionId,
                            data: { storage }
                        } as StorageEvent);
                    }
                    break;
                
                default:
                    logger.debug(`SessionManager: Unhandled storage event: ${event.type}`);
            }
        } catch (error) {
            logger.error('SessionManager: Error handling storage event:', error);
        }
    }

    /**
     * 处理错误事件
     */
    private async handleErrorEvent(event: ErrorEvent): Promise<void> {
        try {
            logger.error(`SessionManager: Error event received for session ${event.sessionId}:`, event.data?.error);
            
            // 如果是会话相关的错误，可能需要保存错误状态
            if (event.sessionId && this.sessions.has(event.sessionId)) {
                const session = this.sessions.get(event.sessionId)!;
                // 可以在这里记录错误历史或采取其他措施
                session.lastActiveTime = Date.now();
                await this.saveSession(event.sessionId, session);
            }
        } catch (error) {
            logger.error('SessionManager: Error handling error event:', error);
        }
    }

    /**
     * 会话开始处理
     */
    private async onSessionStarted(sessionId: string, data?: any): Promise<void> {
        logger.info(`SessionManager: Session started: ${sessionId}`);
        
        this.currentSessionId = sessionId;
        
        // 尝试加载现有会话或创建新会话
        let session = await this.loadSession(sessionId);
        if (!session) {
            session = {
                sessionId,
                agentId: this.agent.id,
                currentStep: 0,
                contexts: [],
                agentSteps: [],
                totalTokensUsed: 0,
                sessionStartTime: Date.now(),
                lastActiveTime: Date.now(),
            };
        } else {
            // 更新会话活跃时间
            session.lastActiveTime = Date.now();
        }
        
        this.sessions.set(sessionId, session);
        await this.saveSession(sessionId, session);
    }

    /**
     * 会话结束处理
     */
    private async onSessionEnded(sessionId: string, data?: any): Promise<void> {
        logger.info(`SessionManager: Session ended: ${sessionId}`);
        
        if (this.sessions.has(sessionId)) {
            const session = this.sessions.get(sessionId)!;
            session.lastActiveTime = Date.now();
            await this.saveSession(sessionId, session);
        }
        
        // 清理当前会话ID
        if (this.currentSessionId === sessionId) {
            this.currentSessionId = undefined;
        }
    }

    /**
     * Agent步骤完成处理
     */
    private async onAgentStepCompleted(event: AgentEvent): Promise<void> {
        if (!event.sessionId || !event.data?.step) {
            return;
        }

        logger.debug(`SessionManager: Agent step ${event.stepIndex} completed for session ${event.sessionId}`);
        
        const session = this.sessions.get(event.sessionId);
        if (session) {
            // 更新会话数据
            session.currentStep = event.stepIndex || 0;
            session.lastActiveTime = Date.now();
            
            // 添加步骤到历史
            if (!session.agentSteps) {
                session.agentSteps = [];
            }
            session.agentSteps.push(event.data.step);
            
            // 保存会话
            await this.saveSession(event.sessionId, session);
        }
    }

    /**
     * Agent步骤失败处理
     */
    private async onAgentStepFailed(event: AgentEvent): Promise<void> {
        if (!event.sessionId) {
            return;
        }

        logger.warn(`SessionManager: Agent step ${event.stepIndex} failed for session ${event.sessionId}: ${event.data?.error}`);
        
        const session = this.sessions.get(event.sessionId);
        if (session) {
            session.currentStep = event.stepIndex || 0;
            session.lastActiveTime = Date.now();
            await this.saveSession(event.sessionId, session);
        }
    }

    /**
     * Agent停止处理
     */
    private async onAgentStopped(event: AgentEvent): Promise<void> {
        if (!event.sessionId) {
            return;
        }

        logger.info(`SessionManager: Agent stopped for session ${event.sessionId}: ${event.data?.reason}`);
        
        const session = this.sessions.get(event.sessionId);
        if (session) {
            session.lastActiveTime = Date.now();
            await this.saveSession(event.sessionId, session);
        }
    }

    // ===========================================
    // ISessionManager 接口实现
    // ===========================================

    createSession(userId?: string, agentId?: string): string {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const session: AgentStorage = {
            sessionId,
            agentId: agentId || this.agent.id,
            currentStep: 0,
            contexts: [],
            agentSteps: [],
            totalTokensUsed: 0,
            sessionStartTime: Date.now(),
            lastActiveTime: Date.now(),
        };

        this.sessions.set(sessionId, session);
        // 异步保存会话，但不等待完成
        this.saveSession(sessionId, session).catch(error => {
            logger.error(`Failed to save session ${sessionId}:`, error);
        });
        
        logger.info(`SessionManager: Created session ${sessionId}`);
        return sessionId;
    }

    async saveSession(sessionId: string, storage: AgentStorage): Promise<void> {
        try {
            // 更新内存中的会话数据
            this.sessions.set(sessionId, storage);
            
            // 这里可以实现持久化存储（文件系统、数据库等）
            // 目前仅保存在内存中
            
            logger.debug(`SessionManager: Session ${sessionId} saved`);
        } catch (error) {
            logger.error(`SessionManager: Failed to save session ${sessionId}:`, error);
            throw error;
        }
    }

    async loadSession(sessionId: string): Promise<AgentStorage | null> {
        try {
            const session = this.sessions.get(sessionId);
            if (session) {
                logger.debug(`SessionManager: Session ${sessionId} loaded from memory`);
                return session;
            }
            
            // 这里可以实现从持久化存储加载
            // 目前仅从内存加载
            
            logger.debug(`SessionManager: Session ${sessionId} not found`);
            return null;
        } catch (error) {
            logger.error(`SessionManager: Failed to load session ${sessionId}:`, error);
            return null;
        }
    }

    async switchSession(sessionId: string): Promise<void> {
        const session = await this.loadSession(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }

        this.currentSessionId = sessionId;
        
        // 通过事件总线通知会话切换
        await this.eventBus.publish({
            type: 'session.switched',
            timestamp: Date.now(),
            source: 'SessionManager',
            sessionId,
            data: { userId: undefined, agentId: session.agentId }
        } as SessionEvent);
        
        logger.info(`SessionManager: Switched to session ${sessionId}`);
    }

    async deleteSession(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId);
        
        // 清理当前会话ID
        if (this.currentSessionId === sessionId) {
            this.currentSessionId = undefined;
        }
        
        logger.info(`SessionManager: Deleted session ${sessionId}`);
    }

    async listSessions(): Promise<AgentStorage[]> {
        return Array.from(this.sessions.values());
    }

    getCurrentSessionId(): string | undefined {
        return this.currentSessionId;
    }

    async getSessionStats(): Promise<SessionStats> {
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000; // 5分钟前
        
        const activeSessions = Array.from(this.sessions.values())
            .filter(session => session.lastActiveTime > fiveMinutesAgo)
            .length;

        return {
            totalSessions: this.sessions.size,
            activeSessions,
            currentSessionId: this.currentSessionId
        };
    }

    /**
     * 获取事件总线实例（用于外部订阅）
     */
    getEventBus(): IEventBus {
        return this.eventBus;
    }

    /**
     * 发送消息给Agent (向后兼容方法)
     */
    async sendMessageToAgent(message: string, maxSteps: number, sessionId?: string): Promise<void> {
        const targetSessionId = sessionId || this.currentSessionId;
        if (!targetSessionId) {
            throw new Error('No active session. Please create or select a session first.');
        }

        const session = this.sessions.get(targetSessionId);
        if (!session) {
            throw new Error(`Session ${targetSessionId} not found`);
        }

        // 发布用户消息事件
        await this.eventBus.publish({
            type: 'user.message',
            timestamp: Date.now(),
            source: 'SessionManager',
            sessionId: targetSessionId,
            data: {
                messageContent: message,
                sessionId: targetSessionId,
                maxSteps
            }
        } as any);

        // 调用agent的startWithUserInput方法
        try {
            if (this.agent && typeof this.agent.startWithUserInput === 'function') {
                await this.agent.startWithUserInput(message, maxSteps, targetSessionId);
            } else {
                logger.error('Agent does not have startWithUserInput method');
                throw new Error('Agent does not have startWithUserInput method');
            }
        } catch (error) {
            logger.error('Error sending message to agent:', error);
            
            // 发布错误事件
            await this.eventBus.publish({
                type: 'error.occurred',
                timestamp: Date.now(),
                source: 'SessionManager',
                sessionId: targetSessionId,
                data: {
                    error: error instanceof Error ? error : new Error(String(error)),
                    context: { message, maxSteps, sessionId: targetSessionId }
                }
            } as any);
            
            throw error;
        }
    }

    /**
     * 停止Agent
     */
    async stopAgent(): Promise<void> {
        if (!this.agent) {
            throw new Error('No agent available to stop');
        }

        // 检查Agent是否有stop方法
        if (typeof this.agent.stop === 'function') {
            this.agent.stop();
        } else {
            logger.warn('Agent does not have stop method');
        }

        logger.info('SessionManager: Agent stopped');
    }

    /**
     * 检查Agent是否正在运行
     */
    isAgentRunning(): boolean {
        if (!this.agent) {
            return false;
        }

        // 检查Agent是否有isRunning属性
        if (typeof this.agent.isRunning === 'boolean') {
            return this.agent.isRunning;
        }

        // 检查Agent是否有shouldStop属性（相反逻辑）
        if (typeof this.agent.shouldStop === 'boolean') {
            return !this.agent.shouldStop;
        }

        // 默认返回false
        return false;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        // 取消所有事件订阅
        this.eventSubscriber.cleanup();
        
        // 清理会话数据
        this.sessions.clear();
        this.currentSessionId = undefined;
        
        logger.info('SessionManager: Disposed');
    }
} 