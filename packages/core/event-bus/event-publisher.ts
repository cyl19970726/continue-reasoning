import { 
    IEventBus, 
    IEventPublisher, 
    AppEvent, 
    SessionEvent, 
    AgentEvent, 
    LLMEvent, 
    ToolEvent, 
    UIEvent, 
    ErrorEvent, 
    StorageEvent 
} from '../interfaces/events.js';

/**
 * 事件发布者基类
 * 提供便捷的事件发布方法，简化组件的事件发布逻辑
 */
export abstract class EventPublisher implements IEventPublisher {
    constructor(
        public eventBus: IEventBus,
        public componentName: string
    ) {}

    /**
     * 发布事件（添加时间戳和来源）
     */
    async publishEvent(event: Omit<AppEvent, 'timestamp' | 'source'>): Promise<void> {
        const fullEvent: AppEvent = {
            ...event,
            timestamp: Date.now(),
            source: this.componentName
        } as AppEvent;

        await this.eventBus.publish(fullEvent);
    }

    // ===========================================
    // 便捷的事件发布方法
    // ===========================================

    /**
     * 发布会话事件
     */
    async publishSessionEvent(
        type: SessionEvent['type'],
        sessionId: string,
        data?: SessionEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            sessionId,
            data
        } as Omit<SessionEvent, 'timestamp' | 'source'>);
    }

    /**
     * 发布Agent事件
     */
    async publishAgentEvent(
        type: AgentEvent['type'],
        stepIndex: number,
        sessionId?: string,
        data?: AgentEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            stepIndex,
            sessionId,
            data
        } as Omit<AgentEvent, 'timestamp' | 'source'>);
    }

    /**
     * 发布LLM事件
     */
    async publishLLMEvent(
        type: LLMEvent['type'],
        stepIndex: number,
        sessionId?: string,
        data?: LLMEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            stepIndex,
            sessionId,
            data
        } as Omit<LLMEvent, 'timestamp' | 'source'>);
    }

    /**
     * 发布工具事件
     */
    async publishToolEvent(
        type: ToolEvent['type'],
        stepIndex: number,
        sessionId?: string,
        data?: ToolEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            stepIndex,
            sessionId,
            data
        } as Omit<ToolEvent, 'timestamp' | 'source'>);
    }

    /**
     * 发布UI事件
     */
    async publishUIEvent(
        type: UIEvent['type'],
        sessionId?: string,
        stepIndex?: number,
        data?: UIEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            sessionId,
            stepIndex,
            data
        } as Omit<UIEvent, 'timestamp' | 'source'>);
    }

    /**
     * 发布错误事件
     */
    async publishErrorEvent(
        error: Error | string,
        context?: any,
        sessionId?: string,
        stepIndex?: number
    ): Promise<void> {
        await this.publishEvent({
            type: 'error.occurred',
            sessionId,
            stepIndex,
            data: {
                error: error instanceof Error ? error.message : error,
                context
            }
        } as Omit<ErrorEvent, 'timestamp' | 'source'>);
    }

    /**
     * 发布存储事件
     */
    async publishStorageEvent(
        type: StorageEvent['type'],
        sessionId?: string,
        stepIndex?: number,
        data?: StorageEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            sessionId,
            stepIndex,
            data
        } as Omit<StorageEvent, 'timestamp' | 'source'>);
    }

    // ===========================================
    // 高级便捷方法
    // ===========================================

    /**
     * 发布步骤开始事件
     */
    async publishStepStarted(stepIndex: number, sessionId?: string): Promise<void> {
        await this.publishAgentEvent('agent.step.started', stepIndex, sessionId);
    }

    /**
     * 发布步骤完成事件
     */
    async publishStepCompleted(
        stepIndex: number, 
        sessionId?: string, 
        step?: any
    ): Promise<void> {
        await this.publishAgentEvent('agent.step.completed', stepIndex, sessionId, { step });
    }

    /**
     * 发布步骤失败事件
     */
    async publishStepFailed(
        stepIndex: number, 
        sessionId?: string, 
        error?: string
    ): Promise<void> {
        await this.publishAgentEvent('agent.step.failed', stepIndex, sessionId, { error });
    }

    /**
     * 发布会话开始事件
     */
    async publishSessionStarted(
        sessionId: string, 
        userId?: string, 
        agentId?: string
    ): Promise<void> {
        await this.publishSessionEvent('session.started', sessionId, { userId, agentId });
    }

    /**
     * 发布会话结束事件
     */
    async publishSessionEnded(
        sessionId: string, 
        userId?: string, 
        agentId?: string
    ): Promise<void> {
        await this.publishSessionEvent('session.ended', sessionId, { userId, agentId });
    }

    /**
     * 发布用户输入事件
     */
    async publishUserInput(input: string, sessionId?: string): Promise<void> {
        await this.publishUIEvent('ui.input.received', sessionId, undefined, { input });
    }

    /**
     * 发布消息添加事件
     */
    async publishMessageAdded(message: any, sessionId?: string): Promise<void> {
        await this.publishUIEvent('ui.message.added', sessionId, undefined, { message });
    }

    /**
     * 发布工具执行开始事件
     */
    async publishToolExecutionStarted(
        toolCall: any, 
        stepIndex: number, 
        sessionId?: string
    ): Promise<void> {
        await this.publishToolEvent(
            'tool.execution.started', 
            stepIndex, 
            sessionId, 
            { toolCall }
        );
    }

    /**
     * 发布工具执行完成事件
     */
    async publishToolExecutionCompleted(
        result: any, 
        stepIndex: number, 
        sessionId?: string
    ): Promise<void> {
        await this.publishToolEvent(
            'tool.execution.completed', 
            stepIndex, 
            sessionId, 
            { result }
        );
    }

    /**
     * 发布工具执行失败事件
     */
    async publishToolExecutionFailed(
        error: string, 
        stepIndex: number, 
        sessionId?: string
    ): Promise<void> {
        await this.publishToolEvent(
            'tool.execution.failed', 
            stepIndex, 
            sessionId, 
            { error }
        );
    }

    // ===========================================
    // 批量事件发布
    // ===========================================

    /**
     * 批量发布事件
     */
    async publishEvents(events: Array<Omit<AppEvent, 'timestamp' | 'source'>>): Promise<void> {
        const promises = events.map(event => this.publishEvent(event));
        await Promise.all(promises);
    }

    /**
     * 发布事件并等待指定时间
     */
    async publishEventWithDelay(
        event: Omit<AppEvent, 'timestamp' | 'source'>, 
        delayMs: number
    ): Promise<void> {
        await this.publishEvent(event);
        await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // ===========================================
    // 调试和监控
    // ===========================================

    /**
     * 发布调试事件（开发环境）
     */
    async publishDebugEvent(message: string, data?: any): Promise<void> {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[${this.componentName}] ${message}`, data);
        }
    }

    /**
     * 发布性能监控事件
     */
    async publishPerformanceEvent(
        operation: string, 
        duration: number, 
        data?: any
    ): Promise<void> {
        await this.publishEvent({
            type: 'error.occurred', // 暂时使用error事件，后续可以定义专门的performance事件
            data: {
                error: `Performance: ${operation} took ${duration}ms`,
                context: { operation, duration, data }
            }
        } as Omit<ErrorEvent, 'timestamp' | 'source'>);
    }

    /**
     * 测量并发布性能事件
     */
    async measureAndPublish<T>(
        operation: string, 
        fn: () => Promise<T>
    ): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            await this.publishPerformanceEvent(operation, duration, { success: true });
            return result;
        } catch (error) {
            const duration = Date.now() - start;
            await this.publishPerformanceEvent(operation, duration, { success: false, error });
            throw error;
        }
    }
} 