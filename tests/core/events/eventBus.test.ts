import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus, IEventBus } from '../../../src/core/events/eventBus';
import { InteractiveMessage, StatusUpdateEvent } from '../../../src/core/events/types';

describe('EventBus', () => {
  let eventBus: IEventBus;

  beforeEach(async () => {
    eventBus = new EventBus(100); // 小的历史记录大小以便测试
    await eventBus.start();
  });

  afterEach(async () => {
    await eventBus.stop();
  });

  describe('Basic Functionality', () => {
    it('should start and stop successfully', async () => {
      const newBus = new EventBus();
      await newBus.start();
      await newBus.stop();
      
      expect(true).toBe(true); // 如果没有抛出异常，测试通过
    });

    it('should create and manage sessions', async () => {
      const sessionId = eventBus.createSession();
      expect(sessionId).toBeTruthy();
      expect(typeof sessionId).toBe('string');
      
      const activeSessions = eventBus.getActiveSessions();
      expect(activeSessions).toContain(sessionId);
      
      eventBus.closeSession(sessionId);
      const activeSessionsAfterClose = eventBus.getActiveSessions();
      expect(activeSessionsAfterClose).not.toContain(sessionId);
    });
  });

  describe('Event Publishing and Subscription', () => {
    it('should publish and receive events', async () => {
      const sessionId = eventBus.createSession();
      const receivedEvents: InteractiveMessage[] = [];
      
      const subscriptionId = eventBus.subscribe('status_update', async (message) => {
        receivedEvents.push(message);
      });

      const testEvent: Omit<StatusUpdateEvent, 'id' | 'timestamp'> = {
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'Test status update',
          progress: 50
        }
      };

      await eventBus.publish(testEvent);
      
      // 等待一小段时间让事件处理完成
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe('status_update');
      expect((receivedEvents[0] as StatusUpdateEvent).payload.message).toBe('Test status update');
      
      eventBus.unsubscribe(subscriptionId);
    });

    it('should support multiple event types in subscription', async () => {
      const sessionId = eventBus.createSession();
      const receivedEvents: InteractiveMessage[] = [];
      
      const subscriptionId = eventBus.subscribe(['status_update', 'error'], async (message) => {
        receivedEvents.push(message);
      });

      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'Status update',
        }
      });

      await eventBus.publish({
        type: 'error',
        source: 'system',
        sessionId,
        payload: {
          errorType: 'runtime_error',
          message: 'Test error',
          recoverable: true
        }
      });

      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].type).toBe('status_update');
      expect(receivedEvents[1].type).toBe('error');
      
      eventBus.unsubscribe(subscriptionId);
    });

    it('should handle subscription errors gracefully', async () => {
      const sessionId = eventBus.createSession();
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      
      const subscriptionId = eventBus.subscribe('status_update', errorHandler);

      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'Test message',
        }
      });

      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(errorHandler).toHaveBeenCalled();
      
      // 事件总线应该继续工作
      const stats = eventBus.getStats();
      expect(stats.totalEventsPublished).toBe(1);
      
      eventBus.unsubscribe(subscriptionId);
    });
  });

  describe('Event History and Filtering', () => {
    it('should maintain event history', async () => {
      const sessionId = eventBus.createSession();
      
      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'First message',
        }
      });

      // 添加微小延迟确保第二个事件的时间戳更大
      await new Promise(resolve => setTimeout(resolve, 5));

      await eventBus.publish({
        type: 'status_update',
        source: 'user',
        sessionId,
        payload: {
          stage: 'executing',
          message: 'Second message',
        }
      });

      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(2);
      expect((history[0].event as StatusUpdateEvent).payload.message).toBe('Second message'); // 最新的在前
      expect((history[1].event as StatusUpdateEvent).payload.message).toBe('First message');
    });

    it('should filter events by type', async () => {
      const sessionId = eventBus.createSession();
      
      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'Status message',
        }
      });

      await eventBus.publish({
        type: 'error',
        source: 'system',
        sessionId,
        payload: {
          errorType: 'runtime_error',
          message: 'Error message',
          recoverable: true
        }
      });

      const statusEvents = eventBus.getEventHistory({
        eventTypes: ['status_update']
      });
      
      expect(statusEvents).toHaveLength(1);
      expect(statusEvents[0].event.type).toBe('status_update');
    });

    it('should filter events by source', async () => {
      const sessionId = eventBus.createSession();
      
      await eventBus.publish({
        type: 'status_update',
        source: 'user',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'User message',
        }
      });

      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'System message',
        }
      });

      const userEvents = eventBus.getEventHistory({
        sources: ['user']
      });
      
      expect(userEvents).toHaveLength(1);
      expect(userEvents[0].event.source).toBe('user');
    });

    it('should clear event history', async () => {
      const sessionId = eventBus.createSession();
      
      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'Test message',
        }
      });

      expect(eventBus.getEventHistory()).toHaveLength(1);
      
      const clearedCount = eventBus.clearEventHistory();
      expect(clearedCount).toBe(1);
      expect(eventBus.getEventHistory()).toHaveLength(0);
    });
  });

  describe('Statistics', () => {
    it('should track basic statistics', async () => {
      const sessionId = eventBus.createSession();
      const initialStats = eventBus.getStats();
      
      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'planning',
          message: 'Test message',
        }
      });

      const stats = eventBus.getStats();
      expect(stats.totalEventsPublished).toBe(initialStats.totalEventsPublished + 1);
      expect(stats.eventHistorySize).toBe(1);
      expect(stats.activeSessions).toBe(1);
    });

    it('should track subscription counts', async () => {
      const initialStats = eventBus.getStats();
      
      const subscriptionId = eventBus.subscribe('status_update', async () => {});
      
      const stats = eventBus.getStats();
      expect(stats.activeSubscriptions).toBe(initialStats.activeSubscriptions + 1);
      
      eventBus.unsubscribe(subscriptionId);
      
      const finalStats = eventBus.getStats();
      expect(finalStats.activeSubscriptions).toBe(initialStats.activeSubscriptions);
    });
  });

  describe('Error Handling', () => {
    it('should throw error when publishing to stopped bus', async () => {
      const testBus = new EventBus();
      // 不启动事件总线
      
      await expect(testBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId: 'test',
        payload: {
          stage: 'planning',
          message: 'Test message',
        }
      })).rejects.toThrow('EventBus is not running');
    });

    it('should handle concurrent operations safely', async () => {
      const sessionId = eventBus.createSession();
      
      // 并发发布多个事件
      const promises = Array(10).fill(0).map((_, i) => 
        eventBus.publish({
          type: 'status_update',
          source: 'system',
          sessionId,
          payload: {
            stage: 'planning',
            message: `Message ${i}`,
          }
        })
      );

      await Promise.all(promises);
      
      const history = eventBus.getEventHistory();
      expect(history).toHaveLength(10);
      
      const stats = eventBus.getStats();
      expect(stats.totalEventsPublished).toBe(10);
    });
  });
}); 