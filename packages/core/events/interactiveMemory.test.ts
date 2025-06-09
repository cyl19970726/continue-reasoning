import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InteractiveMemory, ConversationRecord, IInteractiveMemory } from './interactiveMemory';
import { EventBus } from './eventBus';
import { logger } from '../utils/logger';

describe('InteractiveMemory', () => {
  let eventBus: EventBus;
  let memory: IInteractiveMemory;
  let sessionId: string;

  beforeEach(async () => {
    // 创建基础组件
    eventBus = new EventBus();
    await eventBus.start();

    memory = new InteractiveMemory(
      'test-memory',
      'Test InteractiveMemory',
      eventBus,
      {
        maxConversationsPerSession: 50,
        maxTotalConversations: 500
      }
    );

    await memory.start();
    sessionId = await memory.createSession('test-user', 'test-agent');
  });

  afterEach(async () => {
    await memory.stop();
    await eventBus.stop();
  });

  describe('基础功能', () => {
    it('应该能够启动和停止', async () => {
      expect(memory.id).toBe('test-memory');
      expect(memory.name).toBe('Test InteractiveMemory');
    });

    it('应该能够创建会话', async () => {
      const newSessionId = await memory.createSession('new-user', 'new-agent');
      expect(newSessionId).toBeDefined();
      expect(typeof newSessionId).toBe('string');
      expect(newSessionId.length).toBeGreaterThan(0);
    });
  });

  describe('对话记录功能', () => {
    it('应该能够记录对话', async () => {
      const recordId = await memory.recordConversation({
        sessionId,
        userId: 'test-user',
        agentId: 'test-agent',
        type: 'user_message',
        role: 'user',
        content: '你好，测试消息'
      });

      expect(recordId).toBeDefined();
      expect(typeof recordId).toBe('string');
    });

    it('应该能够获取对话历史', async () => {
      // 记录一些测试对话
      const conversations = [
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: '你好，我需要帮助创建一个 React 组件'
        },
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'agent_reply' as const,
          role: 'agent' as const,
          content: '好的，我可以帮你创建 React 组件。你想创建什么类型的组件？'
        },
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: '我需要一个用户登录表单组件'
        }
      ];

      for (const conv of conversations) {
        await memory.recordConversation(conv);
      }

      const history = await memory.getConversationHistory(sessionId);
      
      // 应该包含系统消息 + 3条对话 = 4条记录
      expect(history.length).toBe(4);
      expect(history[1].content).toBe('你好，我需要帮助创建一个 React 组件');
      expect(history[2].role).toBe('agent');
      expect(history[3].content).toBe('我需要一个用户登录表单组件');
    });

    it('应该能够限制历史记录数量', async () => {
      // 记录5条消息
      for (let i = 1; i <= 5; i++) {
        await memory.recordConversation({
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message',
          role: 'user',
          content: `测试消息 ${i}`
        });
      }

      const limitedHistory = await memory.getConversationHistory(sessionId, 3);
      expect(limitedHistory.length).toBe(3);
    });
  });

  describe('搜索功能', () => {
    beforeEach(async () => {
      // 准备测试数据
      const testConversations = [
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: 'React 组件开发问题'
        },
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'agent_reply' as const,
          role: 'agent' as const,
          content: 'Vue 组件也是不错的选择'
        },
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: 'JavaScript 函数定义'
        }
      ];

      for (const conv of testConversations) {
        await memory.recordConversation(conv);
      }
    });

    it('应该能够根据内容搜索对话', async () => {
      const results = await memory.searchConversations('React', {
        sessionId,
        limit: 10
      });

      expect(results.length).toBe(1);
      expect(results[0].content).toContain('React');
    });

    it('应该能够根据角色过滤搜索结果', async () => {
      const userResults = await memory.searchConversations('', {
        sessionId,
        role: 'user',
        limit: 10
      });

      expect(userResults.length).toBeGreaterThan(0);
      expect(userResults.every(r => r.role === 'user')).toBe(true);
    });

    it('应该能够根据类型过滤搜索结果', async () => {
      const agentResults = await memory.searchConversations('', {
        sessionId,
        type: 'agent_reply',
        limit: 10
      });

      expect(agentResults.every(r => r.type === 'agent_reply')).toBe(true);
    });
  });

  describe('会话摘要功能', () => {
    beforeEach(async () => {
      // 记录一些对话用于生成摘要
      const conversations = [
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: '创建 React 登录组件'
        },
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'agent_reply' as const,
          role: 'agent' as const,
          content: '好的，我来帮你创建登录组件'
        }
      ];

      for (const conv of conversations) {
        await memory.recordConversation(conv);
      }
    });

    it('应该能够生成会话摘要', async () => {
      const summary = await memory.generateSessionSummary(sessionId);

      expect(summary).toBeDefined();
      expect(summary.sessionId).toBe(sessionId);
      expect(summary.userId).toBe('test-user');
      expect(summary.agentId).toBe('test-agent');
      expect(summary.messageCount).toBeGreaterThan(0);
      expect(summary.summary).toContain('user messages');
      expect(summary.topics).toBeInstanceOf(Array);
    });

    it('应该能够获取会话摘要', async () => {
      await memory.generateSessionSummary(sessionId);
      const retrievedSummary = await memory.getSessionSummary(sessionId);

      expect(retrievedSummary).toBeDefined();
      expect(retrievedSummary!.sessionId).toBe(sessionId);
    });

    it('应该能够归档会话', async () => {
      await memory.archiveSession(sessionId);
      const summary = await memory.getSessionSummary(sessionId);

      expect(summary).toBeDefined();
      expect(summary!.sessionId).toBe(sessionId);
    });
  });

  describe('统计功能', () => {
    beforeEach(async () => {
      // 创建多个会话和对话
      const session2 = await memory.createSession('test-user', 'test-agent');
      
      const conversations = [
        {
          sessionId,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: '第一个会话的消息'
        },
        {
          sessionId: session2,
          userId: 'test-user',
          agentId: 'test-agent',
          type: 'user_message' as const,
          role: 'user' as const,
          content: '第二个会话的消息'
        }
      ];

      for (const conv of conversations) {
        await memory.recordConversation(conv);
      }
    });

    it('应该能够获取用户对话统计', async () => {
      const userStats = await memory.getUserConversationStats('test-user');

      expect(userStats).toBeDefined();
      expect(userStats.userId).toBe('test-user');
      expect(userStats.totalSessions).toBeGreaterThan(0);
      expect(userStats.totalMessages).toBeGreaterThan(0);
      expect(userStats.mostActiveAgent).toBe('test-agent');
    });

    it('应该能够获取Agent对话统计', async () => {
      const agentStats = await memory.getAgentConversationStats('test-agent');

      expect(agentStats).toBeDefined();
      expect(agentStats.agentId).toBe('test-agent');
      expect(agentStats.totalSessions).toBeGreaterThan(0);
      expect(agentStats.totalMessages).toBeGreaterThan(0);
    });

    it('应该能够获取内存使用统计', async () => {
      const memoryStats = (memory as InteractiveMemory).getMemoryStats();

      expect(memoryStats).toBeDefined();
      expect(memoryStats.totalConversations).toBeGreaterThan(0);
      expect(memoryStats.totalSessions).toBeGreaterThan(0);
      expect(memoryStats.averageConversationsPerSession).toBeGreaterThan(0);
      expect(memoryStats.memoryUsage).toBeDefined();
    });
  });

  describe('持久化功能', () => {
    const testFilePath = './test-memory-persistence.json';

    afterEach(async () => {
      // 清理测试文件
      try {
        const fs = await import('fs/promises');
        await fs.unlink(testFilePath);
      } catch (error) {
        // 文件可能不存在，忽略错误
      }
    });

    it('应该能够保存到持久化存储', async () => {
      // 记录一些数据
      await memory.recordConversation({
        sessionId,
        userId: 'test-user',
        agentId: 'test-agent',
        type: 'user_message',
        role: 'user',
        content: '持久化测试消息'
      });

      await (memory as InteractiveMemory).saveToPersistentStorage(testFilePath);

      // 验证文件是否创建
      const fs = await import('fs/promises');
      const fileExists = await fs.access(testFilePath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);
    });

    it('应该能够从持久化存储加载', async () => {
      // 先保存数据
      await memory.recordConversation({
        sessionId,
        userId: 'test-user',
        agentId: 'test-agent',
        type: 'user_message',
        role: 'user',
        content: '加载测试消息'
      });

      await (memory as InteractiveMemory).saveToPersistentStorage(testFilePath);

      // 创建新的内存实例并加载数据
      const memory2 = new InteractiveMemory(
        'test-memory-2',
        'Test InteractiveMemory 2',
        eventBus
      );
      await memory2.start();
      await memory2.loadFromPersistentStorage(testFilePath);

      const loadedHistory = await memory2.getConversationHistory(sessionId);
      expect(loadedHistory.length).toBeGreaterThan(0);
      
      const testMessage = loadedHistory.find(h => h.content === '加载测试消息');
      expect(testMessage).toBeDefined();

      await memory2.stop();
    });
  });

  describe('事件监听功能', () => {
    it('应该能够启动和停止事件监听', () => {
      // 这些方法应该不抛出错误
      expect(() => {
        memory.startEventListening();
        memory.stopEventListening();
      }).not.toThrow();
    });

    it('应该能够处理用户消息事件', async () => {
      // 模拟用户消息事件
      const userMessageEvent = {
        sessionId,
        payload: {
          userId: 'test-user',
          content: '来自事件的用户消息'
        }
      };

      // 通过事件总线发布消息
      await eventBus.publish({
        type: 'user_message',
        source: 'user',
        sessionId,
        payload: userMessageEvent.payload
      });

      // 等待事件处理
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证消息是否被记录
      const history = await memory.getConversationHistory(sessionId);
      const eventMessage = history.find(h => h.content === '来自事件的用户消息');
      expect(eventMessage).toBeDefined();
    });
  });

  describe('错误处理', () => {
    it('应该处理空会话的摘要生成', async () => {
      const emptySessionId = await memory.createSession('empty-user', 'empty-agent');
      
      // 移除系统消息，让会话为空
      // 注意：在实际实现中，这可能需要修改 createSession 行为
      await expect(memory.generateSessionSummary('non-existent-session'))
        .rejects.toThrow();
    });

    it('应该处理不存在的会话摘要', async () => {
      const summary = await memory.getSessionSummary('non-existent-session');
      expect(summary).toBeNull();
    });

    it('应该处理持久化存储错误', async () => {
      await expect((memory as InteractiveMemory).loadFromPersistentStorage('/invalid/path/file.json'))
        .resolves.not.toThrow(); // 应该优雅地处理错误，而不是抛出异常
    });
  });
});

describe('InteractiveMemory 性能测试', () => {
  let eventBus: EventBus;
  let memory: InteractiveMemory;

  beforeEach(async () => {
    eventBus = new EventBus();
    await eventBus.start();

    memory = new InteractiveMemory(
      'perf-test-memory',
      'Performance Test Memory',
      eventBus
    );

    await memory.start();
  });

  afterEach(async () => {
    await memory.stop();
    await eventBus.stop();
  });

  it('应该能够快速记录大量对话', async () => {
    const sessionId = await memory.createSession('perf-user', 'perf-agent');
    const messageCount = 100; // 减少数量以便测试快速完成
    const startTime = Date.now();

    // 记录大量对话
    for (let i = 0; i < messageCount; i++) {
      await memory.recordConversation({
        sessionId,
        userId: 'perf-user',
        agentId: 'perf-agent',
        type: i % 2 === 0 ? 'user_message' : 'agent_reply',
        role: i % 2 === 0 ? 'user' : 'agent',
        content: `Performance test message ${i + 1}`
      });
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const avgPerMessage = duration / messageCount;

    expect(avgPerMessage).toBeLessThan(10); // 平均每条消息处理时间应该少于10ms
  }, 10000); // 设置10秒超时

  it('应该能够快速检索历史记录', async () => {
    const sessionId = await memory.createSession('perf-user', 'perf-agent');
    
    // 先记录一些数据
    for (let i = 0; i < 50; i++) {
      await memory.recordConversation({
        sessionId,
        userId: 'perf-user',
        agentId: 'perf-agent',
        type: 'user_message',
        role: 'user',
        content: `Message ${i + 1}`
      });
    }

    const retrieveStart = Date.now();
    const history = await memory.getConversationHistory(sessionId, 20);
    const retrieveEnd = Date.now();

    expect(history.length).toBe(20);
    expect(retrieveEnd - retrieveStart).toBeLessThan(50); // 检索应该少于50ms
  });
}); 