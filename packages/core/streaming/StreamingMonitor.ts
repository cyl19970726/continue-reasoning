/**
 * 流式监控器 - 性能监控和调试
 */

import { IStreamingMonitor } from './interfaces';
import { StreamEvent, StreamEventType, PerformanceMetric, DebugDashboard, EventTrace } from './types';
import { logger } from '../utils/logger';

/**
 * 性能指标收集器
 */
interface MetricCollector {
  name: string;
  collect: () => number;
  threshold?: number;
}

/**
 * 事件统计
 */
interface EventStats {
  count: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  lastSeen: number;
  errorCount: number;
}

/**
 * 会话监控状态
 */
interface SessionMonitorState {
  sessionId: string;
  startTime: number;
  eventStats: Map<StreamEventType, EventStats>;
  latencyHistory: number[];
  errorHistory: Array<{ timestamp: number; error: Error; eventType?: StreamEventType }>;
  performanceMetrics: Map<string, number[]>;
  lastActivityTime: number;
}

/**
 * 告警规则
 */
interface AlertRule {
  metric: string;
  threshold: number;
  handler: (value: number) => void;
  lastTriggered: number;
  cooldownMs: number;
}

/**
 * 流式监控器实现
 */
export class StreamingMonitor implements IStreamingMonitor {
  private sessionStates = new Map<string, SessionMonitorState>();
  private globalEventStats = new Map<StreamEventType, EventStats>();
  private alertRules: AlertRule[] = [];
  private metricCollectors: MetricCollector[] = [];
  private eventTraces = new Map<string, EventTrace>();
  
  // 配置
  private maxLatencyHistory = 1000;
  private maxEventTraces = 100;
  private defaultCooldownMs = 30000; // 30秒告警冷却
  
  constructor() {
    // 注册默认指标收集器
    this.registerMetricCollectors();
    
    // 启动监控循环
    this.startMonitoring();
  }

  /**
   * 记录事件
   */
  recordEvent(event: StreamEvent): void {
    const startTime = process.hrtime.bigint();
    
    // 更新全局统计
    this.updateGlobalStats(event);
    
    // 更新会话统计
    this.updateSessionStats(event);
    
    // 记录事件追踪
    this.recordEventTrace(event);
    
    // 计算处理时间
    const endTime = process.hrtime.bigint();
    const processingTimeMs = Number(endTime - startTime) / 1000000;
    
    // 更新延迟历史
    this.updateLatencyHistory(event.sessionId, processingTimeMs);
    
    // 检查告警
    this.checkAlerts(event);
  }

  /**
   * 获取实时指标
   */
  getMetrics(sessionId?: string): {
    eventRate: number;
    latencyP50: number;
    latencyP99: number;
    errorRate: number;
    activeConnections: number;
  } {
    if (sessionId) {
      return this.getSessionMetrics(sessionId);
    } else {
      return this.getGlobalMetrics();
    }
  }

  /**
   * 追踪特定事件
   */
  traceEvent(eventId: string): {
    event: StreamEvent;
    timeline: Array<{ timestamp: number; action: string }>;
    impact: any;
  } {
    const trace = this.eventTraces.get(eventId);
    if (!trace) {
      throw new Error(`Event trace not found for event ${eventId}`);
    }
    
    return {
      event: trace.event,
      timeline: trace.timeline,
      impact: trace.performanceImpact
    };
  }

  /**
   * 获取调试仪表板数据
   */
  getDashboard(): DebugDashboard {
    const globalMetrics = this.getGlobalMetrics();
    
    // 计算事件类型分布
    const eventTypeDistribution: Record<StreamEventType, number> = {} as any;
    this.globalEventStats.forEach((stats, eventType) => {
      eventTypeDistribution[eventType] = stats.count;
    });
    
    // 收集最常见的错误
    const errorCounts = new Map<string, number>();
    this.sessionStates.forEach(state => {
      state.errorHistory.forEach(error => {
        const errorKey = error.error.message.slice(0, 100); // 截断错误消息
        errorCounts.set(errorKey, (errorCounts.get(errorKey) || 0) + 1);
      });
    });
    
    const topErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      eventRate: globalMetrics.eventRate,
      latencyP50: globalMetrics.latencyP50,
      latencyP99: globalMetrics.latencyP99,
      errorRate: globalMetrics.errorRate,
      activeStreams: this.sessionStates.size,
      eventTypeDistribution,
      topErrors
    };
  }

  /**
   * 设置监控告警
   */
  setAlert(metric: string, threshold: number, handler: (value: number) => void): void {
    const alertRule: AlertRule = {
      metric,
      threshold,
      handler,
      lastTriggered: 0,
      cooldownMs: this.defaultCooldownMs
    };
    
    this.alertRules.push(alertRule);
    logger.debug(`Set alert for metric '${metric}' with threshold ${threshold}`);
  }

  /**
   * 注册指标收集器
   */
  private registerMetricCollectors(): void {
    // CPU使用率
    this.metricCollectors.push({
      name: 'cpu_usage',
      collect: () => {
        // 简化的CPU使用率计算
        return Math.random() * 100; // 在实际实现中会使用真实的系统指标
      },
      threshold: 80
    });
    
    // 内存使用率
    this.metricCollectors.push({
      name: 'memory_usage',
      collect: () => {
        const used = process.memoryUsage();
        return (used.heapUsed / used.heapTotal) * 100;
      },
      threshold: 85
    });
    
    // 事件队列深度
    this.metricCollectors.push({
      name: 'event_queue_depth',
      collect: () => {
        let totalQueueDepth = 0;
        this.sessionStates.forEach(state => {
          // 简化的队列深度计算
          totalQueueDepth += state.eventStats.size;
        });
        return totalQueueDepth;
      },
      threshold: 1000
    });
  }

  /**
   * 更新全局统计
   */
  private updateGlobalStats(event: StreamEvent): void {
    let stats = this.globalEventStats.get(event.type);
    if (!stats) {
      stats = {
        count: 0,
        totalProcessingTime: 0,
        averageProcessingTime: 0,
        lastSeen: 0,
        errorCount: 0
      };
      this.globalEventStats.set(event.type, stats);
    }
    
    stats.count++;
    stats.lastSeen = event.timestamp;
    
    if (event.type === StreamEventType.ERROR_OCCURRED) {
      stats.errorCount++;
    }
  }

  /**
   * 更新会话统计
   */
  private updateSessionStats(event: StreamEvent): void {
    let sessionState = this.sessionStates.get(event.sessionId);
    if (!sessionState) {
      sessionState = {
        sessionId: event.sessionId,
        startTime: event.timestamp,
        eventStats: new Map(),
        latencyHistory: [],
        errorHistory: [],
        performanceMetrics: new Map(),
        lastActivityTime: event.timestamp
      };
      this.sessionStates.set(event.sessionId, sessionState);
    }
    
    sessionState.lastActivityTime = event.timestamp;
    
    // 更新事件统计
    let eventStats = sessionState.eventStats.get(event.type);
    if (!eventStats) {
      eventStats = {
        count: 0,
        totalProcessingTime: 0,
        averageProcessingTime: 0,
        lastSeen: 0,
        errorCount: 0
      };
      sessionState.eventStats.set(event.type, eventStats);
    }
    
    eventStats.count++;
    eventStats.lastSeen = event.timestamp;
    
    // 记录错误
    if (event.type === StreamEventType.ERROR_OCCURRED) {
      eventStats.errorCount++;
      sessionState.errorHistory.push({
        timestamp: event.timestamp,
        error: event.payload.error,
        eventType: event.type
      });
      
      // 限制错误历史长度
      if (sessionState.errorHistory.length > 100) {
        sessionState.errorHistory = sessionState.errorHistory.slice(-50);
      }
    }
  }

  /**
   * 记录事件追踪
   */
  private recordEventTrace(event: StreamEvent): void {
    const trace: EventTrace = {
      event,
      timeline: [
        { timestamp: Date.now(), action: 'event_received' }
      ],
      relatedEvents: [],
      performanceImpact: {
        processingTime: 0,
        memoryDelta: 0,
        cpuUsage: 0
      }
    };
    
    this.eventTraces.set(event.id, trace);
    
    // 限制追踪数量
    if (this.eventTraces.size > this.maxEventTraces) {
      const oldestKey = this.eventTraces.keys().next().value;
      this.eventTraces.delete(oldestKey);
    }
  }

  /**
   * 更新延迟历史
   */
  private updateLatencyHistory(sessionId: string, latencyMs: number): void {
    const sessionState = this.sessionStates.get(sessionId);
    if (!sessionState) return;
    
    sessionState.latencyHistory.push(latencyMs);
    
    // 限制历史长度
    if (sessionState.latencyHistory.length > this.maxLatencyHistory) {
      sessionState.latencyHistory = sessionState.latencyHistory.slice(-this.maxLatencyHistory / 2);
    }
  }

  /**
   * 获取会话指标
   */
  private getSessionMetrics(sessionId: string): {
    eventRate: number;
    latencyP50: number;
    latencyP99: number;
    errorRate: number;
    activeConnections: number;
  } {
    const sessionState = this.sessionStates.get(sessionId);
    if (!sessionState) {
      return {
        eventRate: 0,
        latencyP50: 0,
        latencyP99: 0,
        errorRate: 0,
        activeConnections: 0
      };
    }
    
    const duration = (Date.now() - sessionState.startTime) / 1000;
    const totalEvents = Array.from(sessionState.eventStats.values())
      .reduce((sum, stats) => sum + stats.count, 0);
    const totalErrors = Array.from(sessionState.eventStats.values())
      .reduce((sum, stats) => sum + stats.errorCount, 0);
    
    const latencies = sessionState.latencyHistory.sort((a, b) => a - b);
    const p50Index = Math.floor(latencies.length * 0.5);
    const p99Index = Math.floor(latencies.length * 0.99);
    
    return {
      eventRate: duration > 0 ? totalEvents / duration : 0,
      latencyP50: latencies[p50Index] || 0,
      latencyP99: latencies[p99Index] || 0,
      errorRate: totalEvents > 0 ? (totalErrors / totalEvents) * 100 : 0,
      activeConnections: 1
    };
  }

  /**
   * 获取全局指标
   */
  private getGlobalMetrics(): {
    eventRate: number;
    latencyP50: number;
    latencyP99: number;
    errorRate: number;
    activeConnections: number;
  } {
    const allMetrics = Array.from(this.sessionStates.values())
      .map(state => this.getSessionMetrics(state.sessionId));
    
    if (allMetrics.length === 0) {
      return {
        eventRate: 0,
        latencyP50: 0,
        latencyP99: 0,
        errorRate: 0,
        activeConnections: 0
      };
    }
    
    // 计算聚合指标
    const totalEventRate = allMetrics.reduce((sum, m) => sum + m.eventRate, 0);
    const avgErrorRate = allMetrics.reduce((sum, m) => sum + m.errorRate, 0) / allMetrics.length;
    
    // 计算全局延迟分位数
    const allLatencies: number[] = [];
    this.sessionStates.forEach(state => {
      allLatencies.push(...state.latencyHistory);
    });
    allLatencies.sort((a, b) => a - b);
    
    const p50Index = Math.floor(allLatencies.length * 0.5);
    const p99Index = Math.floor(allLatencies.length * 0.99);
    
    return {
      eventRate: totalEventRate,
      latencyP50: allLatencies[p50Index] || 0,
      latencyP99: allLatencies[p99Index] || 0,
      errorRate: avgErrorRate,
      activeConnections: this.sessionStates.size
    };
  }

  /**
   * 检查告警
   */
  private checkAlerts(event: StreamEvent): void {
    const now = Date.now();
    
    this.alertRules.forEach(rule => {
      // 检查冷却时间
      if (now - rule.lastTriggered < rule.cooldownMs) {
        return;
      }
      
      let value: number = 0;
      
      // 根据指标名称获取值
      switch (rule.metric) {
        case 'event_rate':
          value = this.getGlobalMetrics().eventRate;
          break;
        case 'error_rate':
          value = this.getGlobalMetrics().errorRate;
          break;
        case 'latency_p99':
          value = this.getGlobalMetrics().latencyP99;
          break;
        default:
          // 查找自定义指标收集器
          const collector = this.metricCollectors.find(c => c.name === rule.metric);
          if (collector) {
            value = collector.collect();
          }
      }
      
      // 检查阈值
      if (value > rule.threshold) {
        try {
          rule.handler(value);
          rule.lastTriggered = now;
          logger.warn(`Alert triggered: ${rule.metric} = ${value} > ${rule.threshold}`);
        } catch (error) {
          logger.error(`Error in alert handler for ${rule.metric}:`, error);
        }
      }
    });
  }

  /**
   * 启动监控循环
   */
  private startMonitoring(): void {
    // 定期清理过期会话
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60000); // 每分钟清理一次
    
    // 定期收集性能指标
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, 5000); // 每5秒收集一次
    
    logger.debug('Started streaming monitor');
  }

  /**
   * 清理过期会话
   */
  private cleanupExpiredSessions(): void {
    const now = Date.now();
    const sessionTimeout = 30 * 60 * 1000; // 30分钟超时
    
    this.sessionStates.forEach((state, sessionId) => {
      if (now - state.lastActivityTime > sessionTimeout) {
        this.sessionStates.delete(sessionId);
        logger.debug(`Cleaned up expired session ${sessionId}`);
      }
    });
  }

  /**
   * 收集性能指标
   */
  private collectPerformanceMetrics(): void {
    this.metricCollectors.forEach(collector => {
      try {
        const value = collector.collect();
        
        // 记录到全局性能指标
        this.sessionStates.forEach(state => {
          let metrics = state.performanceMetrics.get(collector.name);
          if (!metrics) {
            metrics = [];
            state.performanceMetrics.set(collector.name, metrics);
          }
          
          metrics.push(value);
          
          // 限制历史长度
          if (metrics.length > 100) {
            state.performanceMetrics.set(collector.name, metrics.slice(-50));
          }
        });
        
      } catch (error) {
        logger.error(`Error collecting metric ${collector.name}:`, error);
      }
    });
  }

  /**
   * 获取会话列表
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessionStates.keys());
  }

  /**
   * 清理会话监控状态
   */
  cleanupSession(sessionId: string): void {
    this.sessionStates.delete(sessionId);
    
    // 清理相关的事件追踪
    this.eventTraces.forEach((trace, eventId) => {
      if (trace.event.sessionId === sessionId) {
        this.eventTraces.delete(eventId);
      }
    });
    
    logger.debug(`Cleaned up monitoring state for session ${sessionId}`);
  }

  /**
   * 导出监控数据
   */
  exportData(): {
    sessions: any[];
    globalStats: any;
    alerts: any[];
  } {
    const sessions = Array.from(this.sessionStates.entries()).map(([sessionId, state]) => ({
      sessionId,
      startTime: state.startTime,
      eventCount: Array.from(state.eventStats.values()).reduce((sum, stats) => sum + stats.count, 0),
      errorCount: state.errorHistory.length,
      metrics: this.getSessionMetrics(sessionId)
    }));

    const globalStats = {
      totalSessions: this.sessionStates.size,
      globalMetrics: this.getGlobalMetrics(),
      eventTypeDistribution: Object.fromEntries(this.globalEventStats)
    };

    const alerts = this.alertRules.map(rule => ({
      metric: rule.metric,
      threshold: rule.threshold,
      lastTriggered: rule.lastTriggered
    }));

    return { sessions, globalStats, alerts };
  }
}