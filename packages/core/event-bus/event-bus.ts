import { 
    IEventBus, 
    AppEvent, 
    EventHandler, 
    EventFilter 
} from '../interfaces/events.js';

export interface EventSubscription {
    id: string;
    eventTypes: string[];
    handler: EventHandler;
    filter?: EventFilter;
    source: string; // 订阅来源组件名称
}

export interface EventStats {
    totalEvents: number;
    activeSubscriptions: number;
    eventsByType: Record<string, number>;
}

/**
 * 事件总线核心实现
 */
export class EventBus implements IEventBus {
    private subscriptions: Map<string, EventSubscription> = new Map();
    private eventHistory: AppEvent[] = [];
    private maxHistorySize: number = 1000;
    private stats: EventStats = {
        totalEvents: 0,
        activeSubscriptions: 0,
        eventsByType: {}
    };

    constructor(maxHistorySize: number = 1000) {
        this.maxHistorySize = maxHistorySize;
    }

    /**
     * 订阅事件
     */
    subscribe<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): string {
        const subscriptionId = this.generateSubscriptionId();
        const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
        
        const subscription: EventSubscription = {
            id: subscriptionId,
            eventTypes,
            handler: handler as EventHandler,
            filter,
            source: filter?.source || 'Unknown'
        };

        this.subscriptions.set(subscriptionId, subscription);
        this.stats.activeSubscriptions = this.subscriptions.size;

        return subscriptionId;
    }

    /**
     * 发布事件
     */
    async publish(event: AppEvent): Promise<void> {
        // 记录事件历史
        this.addToHistory(event);
        
        // 更新统计信息
        this.updateStats(event);

        // 查找匹配的订阅
        const matchingSubscriptions = this.findMatchingSubscriptions(event);

        // 并行执行所有匹配的处理器
        const promises = matchingSubscriptions.map(subscription => 
            this.executeHandler(subscription.handler, event)
        );

        await Promise.all(promises);
    }

    /**
     * 取消订阅
     */
    unsubscribe(subscriptionId: string): void {
        if (this.subscriptions.has(subscriptionId)) {
            this.subscriptions.delete(subscriptionId);
            this.stats.activeSubscriptions = this.subscriptions.size;
        }
    }

    /**
     * 批量取消订阅
     */
    unsubscribeAll(source?: string): void {
        if (source) {
            // 只取消指定来源的订阅
            for (const [id, subscription] of this.subscriptions.entries()) {
                if (subscription.source === source) {
                    this.subscriptions.delete(id);
                }
            }
        } else {
            // 取消所有订阅
            this.subscriptions.clear();
        }
        this.stats.activeSubscriptions = this.subscriptions.size;
    }

    /**
     * 事件历史查询
     */
    getEventHistory(filter?: EventFilter): AppEvent[] {
        if (!filter) {
            return [...this.eventHistory];
        }

        return this.eventHistory.filter(event => this.matchesFilter(event, filter));
    }

    /**
     * 清理事件历史
     */
    clearHistory(olderThan?: number): void {
        if (olderThan) {
            const cutoffTime = Date.now() - olderThan;
            this.eventHistory = this.eventHistory.filter(event => event.timestamp > cutoffTime);
        } else {
            this.eventHistory = [];
        }
    }

    /**
     * 获取统计信息
     */
    getStats(): EventStats {
        return { ...this.stats };
    }

    /**
     * 添加事件到历史记录
     */
    private addToHistory(event: AppEvent): void {
        this.eventHistory.push(event);
        
        // 保持历史记录大小限制
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * 更新统计信息
     */
    private updateStats(event: AppEvent): void {
        this.stats.totalEvents++;
        this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;
    }

    /**
     * 查找匹配的订阅
     */
    private findMatchingSubscriptions(event: AppEvent): EventSubscription[] {
        const matching: EventSubscription[] = [];

        for (const subscription of this.subscriptions.values()) {
            // 检查事件类型匹配
            if (!this.matchesEventType(event.type, subscription.eventTypes)) {
                continue;
            }

            // 检查过滤器匹配
            if (subscription.filter && !this.matchesFilter(event, subscription.filter)) {
                continue;
            }

            matching.push(subscription);
        }

        return matching;
    }

    /**
     * 检查事件类型是否匹配
     */
    private matchesEventType(eventType: string, subscriptionTypes: string[]): boolean {
        return subscriptionTypes.includes(eventType);
    }

    /**
     * 检查事件是否匹配过滤器
     */
    private matchesFilter(event: AppEvent, filter: EventFilter): boolean {
        // 检查事件类型过滤
        if (filter.type) {
            const filterTypes = Array.isArray(filter.type) ? filter.type : [filter.type];
            if (!filterTypes.includes(event.type)) {
                return false;
            }
        }

        // 检查会话ID过滤
        if (filter.sessionId && event.sessionId !== filter.sessionId) {
            return false;
        }

        // 检查步骤索引过滤
        if (filter.stepIndex !== undefined && event.stepIndex !== filter.stepIndex) {
            return false;
        }

        // 检查来源过滤
        if (filter.source && event.source !== filter.source) {
            return false;
        }

        return true;
    }

    /**
     * 执行事件处理器
     */
    private async executeHandler(handler: EventHandler, event: AppEvent): Promise<void> {
        try {
            await handler(event);
        } catch (error) {
            console.error(`Error in event handler for ${event.type}:`, error);
            
            // 发布错误事件（避免无限循环）
            if (event.type !== 'error.occurred') {
                await this.publish({
                    type: 'error.occurred',
                    timestamp: Date.now(),
                    source: 'EventBus',
                    data: {
                        error: error instanceof Error ? error.message : String(error),
                        context: { originalEvent: event }
                    }
                } as any);
            }
        }
    }

    /**
     * 生成订阅ID
     */
    private generateSubscriptionId(): string {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 获取调试信息
     */
    getDebugInfo(): {
        subscriptions: Array<{
            id: string;
            eventTypes: string[];
            source: string;
            hasFilter: boolean;
        }>;
        recentEvents: AppEvent[];
        stats: EventStats;
    } {
        return {
            subscriptions: Array.from(this.subscriptions.values()).map(sub => ({
                id: sub.id,
                eventTypes: sub.eventTypes,
                source: sub.source,
                hasFilter: !!sub.filter
            })),
            recentEvents: this.eventHistory.slice(-10),
            stats: this.getStats()
        };
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.subscriptions.clear();
        this.eventHistory = [];
        this.stats = {
            totalEvents: 0,
            activeSubscriptions: 0,
            eventsByType: {}
        };
    }
} 