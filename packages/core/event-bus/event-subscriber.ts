import { 
    IEventBus, 
    IEventSubscriber, 
    AppEvent, 
    SessionEvent, 
    AgentEvent, 
    LLMEvent, 
    ToolEvent, 
    UIEvent, 
    ErrorEvent, 
    StorageEvent,
    EventHandler, 
    EventFilter 
} from '../interfaces/events.js';

/**
 * 事件订阅者基类
 * 提供便捷的事件订阅方法，简化组件的事件订阅逻辑
 */
export abstract class EventSubscriber implements IEventSubscriber {
    public subscriptionIds: string[] = [];

    constructor(
        public eventBus: IEventBus,
        public componentName: string
    ) {}

    /**
     * 订阅事件（添加来源过滤）
     */
    subscribeToEvent<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): void {
        // 自动添加来源过滤（避免自己订阅自己发布的事件，除非明确指定）
        const enhancedFilter = {
            ...filter,
            source: filter?.source // 如果明确指定了source，则使用指定的
        };

        const subscriptionId = this.eventBus.subscribe(eventType, handler, enhancedFilter);
        this.subscriptionIds.push(subscriptionId);
    }

    // ===========================================
    // 便捷的事件订阅方法
    // ===========================================

    /**
     * 订阅会话事件
     */
    subscribeToSessionEvents(
        handler: EventHandler<SessionEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['session.started', 'session.ended', 'session.switched'],
            handler,
            filter
        );
    }

    /**
     * 订阅Agent事件
     */
    subscribeToAgentEvents(
        handler: EventHandler<AgentEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['agent.step.started', 'agent.step.completed', 'agent.step.failed', 'agent.stopped'],
            handler,
            filter
        );
    }

    /**
     * 订阅LLM事件
     */
    subscribeToLLMEvents(
        handler: EventHandler<LLMEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
                        [
                'llm.call.started',
                'llm.call.completed',
                'llm.text.delta',
                'llm.text.completed',
                'llm.tool.call.started',
                'llm.tool.call.completed',
                'llm.thinking.started',
                'llm.thinking.completed'
            ],
            handler,
            filter
        );
    }

    /**
     * 订阅工具事件
     */
    subscribeToToolEvents(
        handler: EventHandler<ToolEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['tool.execution.started', 'tool.execution.completed', 'tool.execution.failed', 'tool.execution.error'],
            handler,
            filter
        );
    }

    /**
     * 订阅UI事件
     */
    subscribeToUIEvents(
        handler: EventHandler<UIEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['ui.message.added', 'ui.state.changed', 'ui.input.received'],
            handler,
            filter
        );
    }

    /**
     * 订阅错误事件
     */
    subscribeToErrorEvents(
        handler: EventHandler<ErrorEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(['error.occurred'], handler, filter);
    }

    /**
     * 订阅存储事件
     */
    subscribeToStorageEvents(
        handler: EventHandler<StorageEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['storage.save.requested', 'storage.load.requested', 'storage.updated'],
            handler,
            filter
        );
    }

    // ===========================================
    // 高级便捷订阅方法
    // ===========================================

    /**
     * 订阅特定会话的事件
     */
    subscribeToSessionEvents_ForSession(
        sessionId: string,
        handler: EventHandler<SessionEvent>
    ): void {
        this.subscribeToSessionEvents(handler, { sessionId });
    }

    /**
     * 订阅特定步骤的Agent事件
     */
    subscribeToAgentEvents_ForStep(
        stepIndex: number,
        handler: EventHandler<AgentEvent>,
        sessionId?: string
    ): void {
        this.subscribeToAgentEvents(handler, { stepIndex, sessionId });
    }

    /**
     * 订阅流式LLM事件（只订阅流式相关的事件）
     */
    subscribeToStreamingLLMEvents(
        handler: EventHandler<LLMEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            [
                'llm.text.delta',
                'llm.tool.call.started'
            ],
            handler,
            filter
        );
    }

    /**
     * 订阅LLM完成事件（只订阅完成相关的事件）
     */
    subscribeToLLMCompletionEvents(
        handler: EventHandler<LLMEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            [
                'llm.call.completed',
                'llm.text.completed',
                'llm.tool.call.completed',
                'llm.thinking.completed'
            ],
            handler,
            filter
        );
    }

    /**
     * 订阅工具执行完成事件
     */
    subscribeToToolExecutionCompletionEvents(
        handler: EventHandler<ToolEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['tool.execution.completed', 'tool.execution.failed'],
            handler,
            filter
        );
    }

    /**
     * 订阅用户输入事件
     */
    subscribeToUserInputEvents(
        handler: EventHandler<UIEvent>,
        sessionId?: string
    ): void {
        this.subscribeToEvent(['ui.input.received'], handler, { sessionId });
    }

    // ===========================================
    // 事件过滤和条件订阅
    // ===========================================

    /**
     * 订阅来自特定组件的事件
     */
    subscribeToEventsFromSource(
        eventTypes: string | string[],
        source: string,
        handler: EventHandler
    ): void {
        this.subscribeToEvent(eventTypes as any, handler, { source });
    }

    /**
     * 订阅除了特定组件外的所有事件（通过自定义过滤器实现）
     */
    subscribeToEventsExceptFromSource(
        eventTypes: string | string[],
        excludeSource: string,
        handler: EventHandler
    ): void {
        const wrappedHandler: EventHandler = (event) => {
            if (event.source !== excludeSource) {
                return handler(event);
            }
        };
        
        this.subscribeToEvent(eventTypes as any, wrappedHandler);
    }

    /**
     * 条件订阅：只有满足条件才处理事件
     */
    subscribeToEventWithCondition<T extends AppEvent>(
        eventType: T['type'] | T['type'][],
        condition: (event: T) => boolean,
        handler: EventHandler<T>,
        filter?: EventFilter
    ): void {
        const wrappedHandler: EventHandler<T> = (event) => {
            if (condition(event)) {
                return handler(event);
            }
        };
        
        this.subscribeToEvent(eventType, wrappedHandler, filter);
    }

    /**
     * 一次性订阅：只处理第一个匹配的事件
     */
    subscribeOnce<T extends AppEvent>(
        eventType: T['type'] | T['type'][],
        handler: EventHandler<T>,
        filter?: EventFilter
    ): void {
        let subscriptionId: string;
        
        const wrappedHandler: EventHandler<T> = async (event) => {
            await handler(event);
            // 处理完后立即取消订阅
            this.eventBus.unsubscribe(subscriptionId);
            // 从本地订阅列表中移除
            this.subscriptionIds = this.subscriptionIds.filter(id => id !== subscriptionId);
        };
        
        subscriptionId = this.eventBus.subscribe(eventType, wrappedHandler, filter);
        this.subscriptionIds.push(subscriptionId);
    }

    /**
     * 超时订阅：在指定时间后自动取消订阅
     */
    subscribeWithTimeout<T extends AppEvent>(
        eventType: T['type'] | T['type'][],
        handler: EventHandler<T>,
        timeoutMs: number,
        filter?: EventFilter
    ): void {
        const subscriptionId = this.eventBus.subscribe(eventType, handler, filter);
        this.subscriptionIds.push(subscriptionId);
        
        // 设置超时取消订阅
        setTimeout(() => {
            this.eventBus.unsubscribe(subscriptionId);
            this.subscriptionIds = this.subscriptionIds.filter(id => id !== subscriptionId);
        }, timeoutMs);
    }

    // ===========================================
    // 批量订阅管理
    // ===========================================

    /**
     * 批量订阅多个事件类型到同一个处理器
     */
    subscribeBatch<T extends AppEvent>(
        subscriptions: Array<{
            eventType: T['type'] | T['type'][];
            handler: EventHandler<T>;
            filter?: EventFilter;
        }>
    ): void {
        subscriptions.forEach(({ eventType, handler, filter }) => {
            this.subscribeToEvent(eventType, handler, filter);
        });
    }

    /**
     * 暂停所有订阅（通过取消订阅实现）
     */
    pauseAllSubscriptions(): void {
        this.subscriptionIds.forEach(id => {
            this.eventBus.unsubscribe(id);
        });
        this.subscriptionIds = [];
    }

    /**
     * 清理所有订阅
     */
    cleanup(): void {
        this.subscriptionIds.forEach(id => {
            this.eventBus.unsubscribe(id);
        });
        this.subscriptionIds = [];
    }

    // ===========================================
    // 调试和监控
    // ===========================================

    /**
     * 获取订阅统计信息
     */
    getSubscriptionStats(): {
        totalSubscriptions: number;
        subscriptionIds: string[];
        componentName: string;
    } {
        return {
            totalSubscriptions: this.subscriptionIds.length,
            subscriptionIds: [...this.subscriptionIds],
            componentName: this.componentName
        };
    }

    /**
     * 订阅调试事件处理器
     */
    subscribeToAllEventsForDebugging(
        debugHandler?: (event: AppEvent) => void
    ): void {
        const handler = debugHandler || ((event: AppEvent) => {
            console.log(`[${this.componentName}] Received event:`, {
                type: event.type,
                source: event.source,
                timestamp: new Date(event.timestamp).toISOString(),
                sessionId: event.sessionId,
                stepIndex: event.stepIndex
            });
        });

        // 订阅所有事件类型
        this.subscribeToEvent(
            [
                // Session events
                'session.started', 'session.ended', 'session.switched',
                // Agent events
                'agent.step.started', 'agent.step.completed', 'agent.step.failed', 'agent.stopped',
                // LLM events
                'llm.call.started', 'llm.call.completed', 'llm.text.delta', 'llm.text.completed',
                'llm.tool.call.started', 'llm.tool.call.completed', 'llm.tool.call.delta',
                'llm.thinking.started', 'llm.thinking.progress', 'llm.thinking.completed',
                // Tool events
                'tool.call.started', 'tool.execution.started', 'tool.execution.completed', 'tool.execution.failed',
                // UI events
                'ui.message.added', 'ui.state.changed', 'ui.input.received',
                // Error events
                'error.occurred',
                // Storage events
                'storage.save.requested', 'storage.load.requested', 'storage.updated'
            ] as any,
            handler as any
        );
    }
} 