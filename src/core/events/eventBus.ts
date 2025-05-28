import { EventEmitter } from 'events';
import { 
  InteractiveMessage, 
  MessageHandler, 
  EventFilter, 
  SubscriptionConfig,
  BaseEvent,
  AllEventMessages
} from './types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

interface Subscription {
  id: string;
  handler: MessageHandler;
  config: SubscriptionConfig;
  createdAt: number;
}

interface EventHistoryEntry {
  event: AllEventMessages;
  timestamp: number;
  processed: boolean;
  errors?: Error[];
}

export interface IEventBus {
  // 核心发布订阅功能
  publish(event: Omit<AllEventMessages, 'id' | 'timestamp'>): Promise<void>;
  subscribe(eventTypes: string | string[], handler: MessageHandler, config?: SubscriptionConfig): string;
  unsubscribe(subscriptionId: string): boolean;
  
  // 事件查询和管理
  getEventHistory(filter?: EventFilter, limit?: number): EventHistoryEntry[];
  getActiveSubscriptions(): Subscription[];
  clearEventHistory(filter?: EventFilter): number;
  
  // 会话管理
  createSession(): string;
  closeSession(sessionId: string): void;
  getActiveSessions(): string[];
  
  // 系统管理
  start(): Promise<void>;
  stop(): Promise<void>;
  getStats(): EventBusStats;
}

export interface EventBusStats {
  totalEventsPublished: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  activeSessions: number;
  eventHistorySize: number;
  averageProcessingTime: number;
  errorRate: number;
}

export class EventBus implements IEventBus {
  private emitter: EventEmitter;
  private subscriptions: Map<string, Subscription> = new Map();
  private eventHistory: EventHistoryEntry[] = [];
  private activeSessions: Set<string> = new Set();
  private stats: EventBusStats;
  private maxHistorySize: number;
  private isRunning: boolean = false;
  private processingTimes: number[] = [];
  private errorCount: number = 0;

  constructor(maxHistorySize: number = 10000) {
    this.emitter = new EventEmitter();
    this.maxHistorySize = maxHistorySize;
    this.stats = {
      totalEventsPublished: 0,
      totalSubscriptions: 0,
      activeSubscriptions: 0,
      activeSessions: 0,
      eventHistorySize: 0,
      averageProcessingTime: 0,
      errorRate: 0
    };

    // 设置最大监听器数量
    this.emitter.setMaxListeners(1000);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('EventBus started');
    
    // 定期清理统计数据
    setInterval(() => {
      this.cleanupStats();
    }, 60000); // 每分钟清理一次
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    this.emitter.removeAllListeners();
    this.subscriptions.clear();
    this.activeSessions.clear();
    logger.info('EventBus stopped');
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
      
      // 异步处理订阅
      await this.processSubscriptions(fullEvent);
      
      // 记录处理时间
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      this.updateAverageProcessingTime();
      
      logger.debug(`Event published: ${fullEvent.type} (${fullEvent.id})`);
      
    } catch (error) {
      this.errorCount++;
      this.updateErrorRate();
      logger.error(`Error publishing event ${fullEvent.type}:`, error);
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
        maxEvents: 1000,
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
    
    logger.debug(`Subscription created: ${subscriptionId} for events: ${types.join(', ')}`);
    return subscriptionId;
  }

  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return false;

    this.subscriptions.delete(subscriptionId);
    this.stats.activeSubscriptions = this.subscriptions.size;
    
    logger.debug(`Subscription removed: ${subscriptionId}`);
    return true;
  }

  getEventHistory(filter?: EventFilter, limit: number = 100): EventHistoryEntry[] {
    let filtered = this.eventHistory;

    if (filter) {
      filtered = this.eventHistory.filter(entry => this.matchesFilter(entry.event, filter));
    }

    return filtered
      .sort((a, b) => b.event.timestamp - a.event.timestamp) // 按事件时间戳排序，而不是条目时间戳
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
    logger.debug(`Cleared ${removed} events from history`);
    return removed;
  }

  createSession(): string {
    const sessionId = uuidv4();
    this.activeSessions.add(sessionId);
    this.stats.activeSessions = this.activeSessions.size;
    
    logger.debug(`Session created: ${sessionId}`);
    return sessionId;
  }

  closeSession(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    this.stats.activeSessions = this.activeSessions.size;
    
    // 清理该会话的相关事件
    this.clearEventHistory({ sessionId });
    
    logger.debug(`Session closed: ${sessionId}`);
  }

  getActiveSessions(): string[] {
    return Array.from(this.activeSessions);
  }

  getStats(): EventBusStats {
    return { ...this.stats };
  }

  private async processSubscriptions(event: AllEventMessages): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const subscription of this.subscriptions.values()) {
      if (this.shouldProcessSubscription(subscription, event)) {
        promises.push(this.handleSubscription(subscription, event));
      }
    }
    
    // 并行处理所有符合条件的订阅
    await Promise.allSettled(promises);
    
    // 触发EventEmitter事件，但设置错误处理避免未捕获异常
    try {
      this.emitter.emit(event.type, event);
      this.emitter.emit('*', event); // 通用事件监听器
    } catch (error) {
      logger.warn('Error emitting event to EventEmitter:', error);
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
      logger.error(`Error in subscription handler ${subscription.id}:`, error);
      
      // 更新历史记录中的错误信息
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
    
    // 检查事件类型是否匹配
    const typeMatches = filter.eventTypes.includes(event.type);
    
    return typeMatches && this.matchesFilter(event, filter);
  }

  private matchesSubscriptionFilter(subscription: Subscription, event: AllEventMessages): boolean {
    const filter = subscription.config.filter;
    if (!filter) return true;
    
    return this.matchesFilter(event, filter);
  }

  private matchesFilter(event: AllEventMessages, filter: EventFilter): boolean {
    // 检查事件类型
    if (filter.eventTypes && !filter.eventTypes.includes(event.type)) {
      return false;
    }
    
    // 检查来源
    if (filter.sources && !filter.sources.includes(event.source)) {
      return false;
    }
    
    // 检查会话ID
    if (filter.sessionId && event.sessionId !== filter.sessionId) {
      return false;
    }
    
    // 检查时间范围
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
    
    // 保持历史记录大小在限制内
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
    
    this.stats.eventHistorySize = this.eventHistory.length;
  }

  private updateAverageProcessingTime(): void {
    if (this.processingTimes.length > 100) {
      this.processingTimes = this.processingTimes.slice(-100); // 保持最近100次的时间
    }
    
    const sum = this.processingTimes.reduce((a, b) => a + b, 0);
    this.stats.averageProcessingTime = sum / this.processingTimes.length;
  }

  private updateErrorRate(): void {
    this.stats.errorRate = this.stats.totalEventsPublished > 0 
      ? (this.errorCount / this.stats.totalEventsPublished) * 100 
      : 0;
  }

  private cleanupStats(): void {
    // 每小时重置处理时间统计
    if (this.processingTimes.length > 3600) {
      this.processingTimes = this.processingTimes.slice(-1800);
    }
  }
}

// 单例模式的全局事件总线
export const globalEventBus = new EventBus();

// 工具函数
export function createEvent<T extends AllEventMessages>(
  type: T['type'],
  payload: T['payload'],
  source: BaseEvent['source'] = 'system',
  sessionId?: string
): Omit<T, 'id' | 'timestamp'> {
  return {
    type,
    payload,
    source,
    sessionId: sessionId || 'default'
  } as unknown as Omit<T, 'id' | 'timestamp'>;
} 