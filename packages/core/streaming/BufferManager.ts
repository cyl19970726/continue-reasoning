/**
 * 缓冲管理器 - 管理事件缓冲和背压控制
 */

import { IBufferManager, BufferStrategy } from './interfaces';
import { StreamEvent, EventPriority, BufferMetrics } from './types';
import { logger } from '../utils/logger';

/**
 * 默认缓冲策略 - 基于优先级和负载的智能缓冲
 */
class SmartBufferStrategy implements BufferStrategy {
  name = 'smart';

  shouldBuffer(event: StreamEvent, metrics: BufferMetrics): boolean {
    // 关键事件不缓冲
    if (event.metadata.priority === 'critical') {
      return false;
    }

    // 基于客户端处理能力动态决定
    const loadFactor = metrics.eventRate / Math.max(1, metrics.clientProcessingRate);
    
    // 高负载时缓冲低优先级事件
    if (loadFactor > 1.5 && event.metadata.priority === 'low') {
      return true;
    }

    // 中等负载时也缓冲正常优先级事件
    if (loadFactor > 2.0 && event.metadata.priority === 'normal') {
      return true;
    }

    // 缓冲区接近满时总是缓冲
    if (metrics.bufferOccupancy > 0.8) {
      return true;
    }

    return false;
  }

  handleBufferFull(buffer: StreamEvent[], newEvent: StreamEvent): StreamEvent[] {
    // 优先级队列：丢弃最低优先级的事件
    const priorityOrder: EventPriority[] = ['low', 'normal', 'high', 'critical'];
    
    for (const priority of priorityOrder) {
      const index = buffer.findIndex(e => e.metadata.priority === priority);
      if (index !== -1 && newEvent.metadata.priority >= priority) {
        // 替换低优先级事件
        buffer[index] = newEvent;
        return buffer;
      }
    }

    // 如果新事件优先级最低，则丢弃它
    return buffer;
  }
}

/**
 * FIFO缓冲策略 - 先进先出
 */
class FIFOBufferStrategy implements BufferStrategy {
  name = 'fifo';

  shouldBuffer(event: StreamEvent, metrics: BufferMetrics): boolean {
    return metrics.bufferOccupancy < 1.0;
  }

  handleBufferFull(buffer: StreamEvent[], newEvent: StreamEvent): StreamEvent[] {
    buffer.shift(); // 移除最旧的
    buffer.push(newEvent);
    return buffer;
  }
}

/**
 * 优先级缓冲策略 - 只保留高优先级事件
 */
class PriorityBufferStrategy implements BufferStrategy {
  name = 'priority';

  shouldBuffer(event: StreamEvent, metrics: BufferMetrics): boolean {
    return event.metadata.priority !== 'low' && metrics.bufferOccupancy < 1.0;
  }

  handleBufferFull(buffer: StreamEvent[], newEvent: StreamEvent): StreamEvent[] {
    // 按优先级排序
    const sorted = [...buffer, newEvent].sort((a, b) => {
      const priorityMap = { low: 0, normal: 1, high: 2, critical: 3 };
      return priorityMap[b.metadata.priority] - priorityMap[a.metadata.priority];
    });

    // 保留前N个最高优先级的事件
    return sorted.slice(0, buffer.length);
  }
}

/**
 * 缓冲会话状态
 */
interface BufferSession {
  buffer: StreamEvent[];
  strategy: BufferStrategy;
  metrics: BufferMetrics;
  lastFlush: number;
  droppedEvents: number;
}

/**
 * 缓冲管理器实现
 */
export class BufferManager implements IBufferManager {
  private sessions = new Map<string, BufferSession>();
  private strategies = new Map<string, BufferStrategy>();
  private defaultBufferSize = 1000;
  private metricsUpdateInterval = 1000; // 1秒更新一次指标

  constructor() {
    // 注册默认策略
    this.registerStrategy(new SmartBufferStrategy());
    this.registerStrategy(new FIFOBufferStrategy());
    this.registerStrategy(new PriorityBufferStrategy());

    // 启动指标更新定时器
    this.startMetricsUpdater();
  }

  /**
   * 注册缓冲策略
   */
  registerStrategy(strategy: BufferStrategy): void {
    this.strategies.set(strategy.name, strategy);
    logger.debug(`Registered buffer strategy: ${strategy.name}`);
  }

  /**
   * 添加事件到缓冲区
   */
  bufferEvent(sessionId: string, event: StreamEvent): boolean {
    const session = this.getOrCreateSession(sessionId);
    
    // 检查缓冲区是否已满
    if (session.buffer.length >= this.defaultBufferSize) {
      // 使用策略处理缓冲区满的情况
      session.buffer = session.strategy.handleBufferFull(session.buffer, event);
      
      // 如果事件没有被加入缓冲区，记录丢弃
      if (!session.buffer.includes(event)) {
        session.droppedEvents++;
        logger.debug(`Dropped event in session ${sessionId}, total dropped: ${session.droppedEvents}`);
        return false;
      }
    } else {
      session.buffer.push(event);
    }

    // 更新指标
    this.updateMetrics(session);
    
    return true;
  }

  /**
   * 刷新缓冲区
   */
  flush(sessionId: string): StreamEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return [];
    }

    const events = [...session.buffer];
    session.buffer = [];
    session.lastFlush = Date.now();
    
    // 更新指标
    this.updateMetrics(session);
    
    logger.debug(`Flushed ${events.length} events from session ${sessionId}`);
    
    return events;
  }

  /**
   * 判断是否应该缓冲
   */
  shouldBuffer(sessionId: string, event: StreamEvent): boolean {
    const session = this.getOrCreateSession(sessionId);
    return session.strategy.shouldBuffer(event, session.metrics);
  }

  /**
   * 获取缓冲区指标
   */
  getMetrics(sessionId: string): {
    bufferSize: number;
    occupancy: number;
    droppedEvents: number;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { bufferSize: 0, occupancy: 0, droppedEvents: 0 };
    }

    return {
      bufferSize: session.buffer.length,
      occupancy: session.buffer.length / this.defaultBufferSize,
      droppedEvents: session.droppedEvents
    };
  }

  /**
   * 设置缓冲策略
   */
  setBufferStrategy(sessionId: string, strategy: BufferStrategy): void {
    const session = this.getOrCreateSession(sessionId);
    session.strategy = strategy;
    
    logger.info(`Set buffer strategy for session ${sessionId} to ${strategy.name}`);
  }

  /**
   * 通过名称设置缓冲策略
   */
  setBufferStrategyByName(sessionId: string, strategyName: string): void {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      logger.warn(`Buffer strategy ${strategyName} not found, using default`);
      return;
    }

    this.setBufferStrategy(sessionId, strategy);
  }

  /**
   * 获取或创建会话
   */
  private getOrCreateSession(sessionId: string): BufferSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        buffer: [],
        strategy: this.strategies.get('smart')!,
        metrics: this.createDefaultMetrics(),
        lastFlush: Date.now(),
        droppedEvents: 0
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  /**
   * 创建默认指标
   */
  private createDefaultMetrics(): BufferMetrics {
    return {
      bufferSize: this.defaultBufferSize,
      bufferOccupancy: 0,
      eventRate: 0,
      clientProcessingRate: 100, // 假设初始处理能力
      clientLatency: 0,
      droppedEvents: 0
    };
  }

  /**
   * 更新指标
   */
  private updateMetrics(session: BufferSession): void {
    session.metrics.bufferOccupancy = session.buffer.length / this.defaultBufferSize;
    session.metrics.droppedEvents = session.droppedEvents;
    
    // 计算事件率（简化版）
    const timeSinceLastFlush = Date.now() - session.lastFlush;
    if (timeSinceLastFlush > 0) {
      session.metrics.eventRate = (session.buffer.length * 1000) / timeSinceLastFlush;
    }
  }

  /**
   * 启动指标更新器
   */
  private startMetricsUpdater(): void {
    setInterval(() => {
      this.sessions.forEach((session, sessionId) => {
        // 模拟客户端处理能力的动态变化
        const jitter = 0.9 + Math.random() * 0.2; // ±10% 抖动
        session.metrics.clientProcessingRate *= jitter;
        
        // 模拟客户端延迟
        session.metrics.clientLatency = 10 + Math.random() * 50; // 10-60ms
        
        // 自动调整策略（如果负载过高）
        if (session.metrics.bufferOccupancy > 0.9 && session.droppedEvents > 100) {
          logger.warn(`High load detected for session ${sessionId}, consider switching strategy`);
        }
      });
    }, this.metricsUpdateInterval);
  }

  /**
   * 清理会话
   */
  cleanupSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.debug(`Cleaned up buffer for session ${sessionId}`);
  }

  /**
   * 获取全局统计
   */
  getGlobalStats(): {
    totalSessions: number;
    totalBufferedEvents: number;
    totalDroppedEvents: number;
    averageOccupancy: number;
  } {
    let totalBuffered = 0;
    let totalDropped = 0;
    let totalOccupancy = 0;

    this.sessions.forEach(session => {
      totalBuffered += session.buffer.length;
      totalDropped += session.droppedEvents;
      totalOccupancy += session.metrics.bufferOccupancy;
    });

    return {
      totalSessions: this.sessions.size,
      totalBufferedEvents: totalBuffered,
      totalDroppedEvents: totalDropped,
      averageOccupancy: this.sessions.size > 0 ? totalOccupancy / this.sessions.size : 0
    };
  }
}