import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { MultiAgentEvents } from '../interfaces/multi-agent.js';

// 基础事件接口
export interface BaseEvent {
  id: string;
  timestamp: number;
  source: 'user' | 'agent' | 'system' | 'multi-agent';
  sessionId?: string;
}

// Multi-Agent 事件类型
export type MultiAgentEvent<K extends keyof MultiAgentEvents = keyof MultiAgentEvents> = BaseEvent & {
  type: K;
  payload: MultiAgentEvents[K];
};

// 所有事件类型的联合
export type AllEventMessages = MultiAgentEvent<keyof MultiAgentEvents>;

// 事件处理器类型
export type MessageHandler = (message: AllEventMessages) => Promise<void>;

// 事件过滤器
export interface EventFilter {
  eventTypes?: string[];
  sources?: BaseEvent['source'][];
  sessionId?: string;
  afterTimestamp?: number;
  beforeTimestamp?: number;
}

// 订阅配置
export interface SubscriptionConfig {
  filter?: EventFilter;
  persistent?: boolean;
  maxEvents?: number;
}

// 订阅信息
interface Subscription {
  id: string;
  handler: MessageHandler;
  config: SubscriptionConfig;
  createdAt: number;
}

// 事件历史条目
interface EventHistoryEntry {
  event: AllEventMessages;
  timestamp: number;
  processed: boolean;
  errors?: Error[];
}

// EventBus 接口
export interface IEventBus {
  // 核心发布订阅功能
  publish(event: Omit<AllEventMessages, 'id' | 'timestamp'>): Promise<void>;
  subscribe(eventTypes: string | string[], handler: MessageHandler, config?: SubscriptionConfig): string;
  unsubscribe(subscriptionId: string): boolean;
  
  // 事件查询
  getEventHistory(filter?: EventFilter, limit?: number): EventHistoryEntry[];
  getActiveSubscriptions(): Subscription[];
  clearEventHistory(filter?: EventFilter): number;
  
  // 系统管理
  start(): Promise<void>;
  stop(): Promise<void>;
}

// EventBus 统计信息
export interface EventBusStats {
  totalEventsPublished: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  eventHistorySize: number;
  averageProcessingTime: number;
  errorRate: number;
}

/**
 * 简化版 EventBus - 专为 Multi-Agent 系统设计
 */
export class EventBus implements IEventBus {
  private emitter: EventEmitter;
  private subscriptions: Map<string, Subscription> = new Map();
  private eventHistory: EventHistoryEntry[] = [];
  private stats: EventBusStats;
  private maxHistorySize: number;
  private isRunning: boolean = false;
  private processingTimes: number[] = [];
  private errorCount: number = 0;

  constructor(maxHistorySize: number = 1000) {
    this.emitter = new EventEmitter();
    this.maxHistorySize = maxHistorySize;
    this.stats = {
      totalEventsPublished: 0,
      totalSubscriptions: 0,
      activeSubscriptions: 0,
      eventHistorySize: 0,
      averageProcessingTime: 0,
      errorRate: 0
    };

    this.emitter.setMaxListeners(100);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('Multi-Agent EventBus started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.emitter.removeAllListeners();
    this.subscriptions.clear();
    logger.info('Multi-Agent EventBus stopped');
  }

  async publish(event: Omit<AllEventMessages, 'id' | 'timestamp'>): Promise<void> {
    if (!this.isRunning) {
      throw new Error('EventBus is not running');
    }

    const fullEvent: AllEventMessages = {
      ...event,
      id: uuidv4(),
      timestamp: Date.now()
    } as AllEventMessages;

    const startTime = Date.now();
    
    try {
      // 添加到历史记录
      this.addToHistory(fullEvent);
      
      // 更新统计信息
      this.stats.totalEventsPublished++;
      this.stats.eventHistorySize = this.eventHistory.length;
      
      // 处理订阅
      await this.processSubscriptions(fullEvent);
      
      // 记录处理时间
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      this.updateAverageProcessingTime();
      
      logger.debug(`Multi-Agent event published: ${fullEvent.type} (${fullEvent.id})`);
      
    } catch (error) {
      this.errorCount++;
      this.updateErrorRate();
      logger.error(`Error publishing Multi-Agent event ${fullEvent.type}:`, error);
      throw error;
    }
  }

  subscribe(
    eventTypes: string | string[], 
    handler: MessageHandler, 
    config: SubscriptionConfig = {}
  ): string {
    const subscriptionId = uuidv4();
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    
    const subscription: Subscription = {
      id: subscriptionId,
      handler,
      config: {
        persistent: false,
        maxEvents: 100,
        filter: {
          eventTypes: types,
          ...config.filter
        },
        ...config
      },
      createdAt: Date.now()
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.stats.totalSubscriptions++;
    this.stats.activeSubscriptions = this.subscriptions.size;
    
    logger.debug(`Multi-Agent subscription created: ${subscriptionId} for events: ${types.join(', ')}`);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);
    this.stats.activeSubscriptions = this.subscriptions.size;
    
    logger.debug(`Multi-Agent subscription removed: ${subscriptionId}`);
    return true;
  }

  getEventHistory(filter?: EventFilter, limit: number = 50): EventHistoryEntry[] {
    let filtered = this.eventHistory;

    if (filter) {
      filtered = this.eventHistory.filter(entry => this.matchesFilter(entry.event, filter));
    }

    return filtered
      .sort((a, b) => b.event.timestamp - a.event.timestamp)
      .slice(0, limit);
  }

  getActiveSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  clearEventHistory(filter?: EventFilter): number {
    let removed = 0;
    
    if (!filter) {
      removed = this.eventHistory.length;
      this.eventHistory = [];
    } else {
      const originalLength = this.eventHistory.length;
      this.eventHistory = this.eventHistory.filter(entry => !this.matchesFilter(entry.event, filter));
      removed = originalLength - this.eventHistory.length;
    }

    this.stats.eventHistorySize = this.eventHistory.length;
    logger.debug(`Cleared ${removed} Multi-Agent events from history`);
    return removed;
  }

  getStats(): EventBusStats {
    return { ...this.stats };
  }

  private async processSubscriptions(event: AllEventMessages): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const subscription of Array.from(this.subscriptions.values())) {
      if (this.shouldProcessSubscription(subscription, event)) {
        promises.push(this.handleSubscription(subscription, event));
      }
    }
    
    await Promise.allSettled(promises);
    
    // 触发 EventEmitter 事件
    try {
      this.emitter.emit(event.type, event);
      this.emitter.emit('*', event);
    } catch (error) {
      logger.warn('Error emitting Multi-Agent event to EventEmitter:', error);
    }
  }

  private async handleSubscription(subscription: Subscription, event: AllEventMessages): Promise<void> {
    try {
      if (this.matchesSubscriptionFilter(subscription, event)) {
        await subscription.handler(event);
      }
    } catch (error) {
      this.errorCount++;
      this.updateErrorRate();
      logger.error(`Error in Multi-Agent subscription handler ${subscription.id}:`, error);
      
      const historyEntry = this.eventHistory.find(entry => entry.event.id === event.id);
      if (historyEntry) {
        historyEntry.errors = historyEntry.errors || [];
        historyEntry.errors.push(error as Error);
      }
    }
  }

  private shouldProcessSubscription(subscription: Subscription, event: AllEventMessages): boolean {
    const filter = subscription.config.filter;
    if (!filter || !filter.eventTypes) return true;
    
    const typeMatches = filter.eventTypes.includes(event.type);
    return typeMatches && this.matchesFilter(event, filter);
  }

  private matchesSubscriptionFilter(subscription: Subscription, event: AllEventMessages): boolean {
    const filter = subscription.config.filter;
    if (!filter) return true;
    
    return this.matchesFilter(event, filter);
  }

  private matchesFilter(event: AllEventMessages, filter: EventFilter): boolean {
    if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
      return false;
    }
    
    if (filter.sources && !filter.sources.includes(event.source)) {
      return false;
    }
    
    if (filter.sessionId && event.sessionId !== filter.sessionId) {
      return false;
    }
    
    if (filter.afterTimestamp && event.timestamp <= filter.afterTimestamp) {
      return false;
    }
    
    if (filter.beforeTimestamp && event.timestamp >= filter.beforeTimestamp) {
      return false;
    }
    
    return true;
  }

  private addToHistory(event: AllEventMessages): void {
    const entry: EventHistoryEntry = {
      event,
      timestamp: Date.now(),
      processed: false
    };

    this.eventHistory.push(entry);
    
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
    
    this.stats.eventHistorySize = this.eventHistory.length;
  }

  private updateAverageProcessingTime(): void {
    if (this.processingTimes.length > 50) {
      this.processingTimes = this.processingTimes.slice(-50);
    }
    
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    this.stats.averageProcessingTime = sum / this.processingTimes.length;
  }

  private updateErrorRate(): void {
    this.stats.errorRate = this.stats.totalEventsPublished > 0 
      ? (this.errorCount / this.stats.totalEventsPublished) * 100 
      : 0;
  }
}

// 全局实例
export const globalEventBus = new EventBus();

// 工具函数
export function createMultiAgentEvent<K extends keyof MultiAgentEvents>(
  type: K,
  payload: MultiAgentEvents[K],
  source: BaseEvent['source'] = 'multi-agent',
  sessionId?: string
): Omit<MultiAgentEvent<K>, 'id' | 'timestamp'> {
  return {
    type,
    payload,
    source,
    sessionId: sessionId || 'default'
  };
} 