import { SimpleClient } from '../packages/core/clients/simple-client';
import { SessionManager } from '../packages/core/session/sessionManager';
import { IEventBus, EventBus } from '../packages/core/event-bus';

/**
 * 测试事件驱动架构的功能
 * 验证在流式模式和非流式模式下，事件是否被正确处理
 */

// 模拟 Agent（用于测试）
const mockAgent = {
  id: 'test-agent',
  name: 'Test Agent',
  eventBus: new EventBus(),
  getEventBus: function() { return this.eventBus; },
  simulateEvents: function() {
    console.log('=== Agent 发布事件 ===');
    
    // 发布会话开始事件
    this.eventBus.publish({
      type: 'session.started',
      timestamp: Date.now(),
      source: 'test-agent',
      data: { sessionId: 'test-session', userId: 'test-user', agentId: 'test-agent' }
    });
    
    // 发布LLM文本增量事件（仅在流式模式下）
    this.eventBus.publish({
      type: 'llm.text.delta',
      timestamp: Date.now(),
      source: 'test-agent',
      data: { stepIndex: 0, chunkIndex: 0, delta: 'Hello ' }
    });
    
    // 发布工具调用开始事件
    this.eventBus.publish({
      type: 'tool.call.started',
      timestamp: Date.now(),
      source: 'test-agent',
      data: { toolCall: { name: 'test_tool', call_id: 'test_call_1' } }
    });
    
    // 发布LLM文本完成事件
    this.eventBus.publish({
      type: 'llm.text.complete',
      timestamp: Date.now(),
      source: 'test-agent',
      data: { stepIndex: 0, chunkIndex: 0, text: 'Hello world!' }
    });
    
    // 发布工具执行结束事件
    this.eventBus.publish({
      type: 'tool.execution.completed',
      timestamp: Date.now(),
      source: 'test-agent',
      data: { 
        toolCall: { name: 'test_tool', call_id: 'test_call_1' },
        result: { status: 'succeed', name: 'test_tool', call_id: 'test_call_1' }
      }
    });
    
    // 发布会话结束事件
    this.eventBus.publish({
      type: 'session.ended',
      timestamp: Date.now(),
      source: 'test-agent',
      data: { sessionId: 'test-session', userId: 'test-user', agentId: 'test-agent' }
    });
    
    console.log('✅ 事件发布完成\n');
  }
} as any;

console.log('🧪 测试事件驱动架构功能\n');

// 测试 1: 非流式模式
console.log('📝 测试 1: 非流式模式');
const nonStreamingClient = new SimpleClient('non-streaming-client');

console.log('Client streaming mode:', nonStreamingClient.isStreamingMode());

// 设置事件监听 - 非流式模式应该忽略delta事件
nonStreamingClient.setEventBus(mockAgent.getEventBus());

// 创建session manager
const sessionManager1 = new SessionManager(mockAgent, nonStreamingClient);

// 模拟事件
console.log('非流式模式事件监听结果：');
mockAgent.simulateEvents();

// 等待事件处理
setTimeout(() => {
  console.log('✅ 非流式模式测试完成\n');
  
  // 测试 2: 流式模式
  console.log('📝 测试 2: 流式模式');
  const streamingClient = new SimpleClient('streaming-client');
  
  console.log('Client streaming mode:', streamingClient.isStreamingMode());
  
  // 设置事件监听 - 流式模式应该处理所有事件
  streamingClient.setEventBus(mockAgent.getEventBus());
  
  // 创建session manager
  const sessionManager2 = new SessionManager(mockAgent, streamingClient);
  
  // 模拟事件
  console.log('流式模式事件监听结果：');
  mockAgent.simulateEvents();
  
  setTimeout(() => {
    console.log('✅ 流式模式测试完成\n');
    
    // 测试 3: 自定义事件处理
    console.log('📝 测试 3: 自定义事件处理');
    const customClient = new SimpleClient('custom-client');
    
    // 设置自定义事件监听
    customClient.setEventBus(mockAgent.getEventBus());
    
    // 添加自定义事件监听器
    const eventBus = mockAgent.getEventBus();
    eventBus.subscribe('llm.text.delta', (event) => {
      console.log(`🎯 自定义处理 - LLM文本增量: "${event.data?.delta}"`);
    });
    
    eventBus.subscribe('tool.call.started', (event) => {
      console.log(`🎯 自定义处理 - 工具调用开始: ${event.data?.toolCall?.name}`);
    });
    
    eventBus.subscribe('llm.text.complete', (event) => {
      console.log(`🎯 自定义处理 - LLM文本完成: "${event.data?.text}"`);
    });
    
    // 模拟事件
    console.log('自定义事件处理结果：');
    mockAgent.simulateEvents();
    
    setTimeout(() => {
      console.log('✅ 自定义事件处理测试完成\n');
      
      // 测试 4: 无 Client 的情况
      console.log('📝 测试 4: 无 Client 的情况');
      const sessionManagerNoClient = new SessionManager(mockAgent);
      
      // 直接监听Agent的事件
      const agentEventBus = mockAgent.getEventBus();
      agentEventBus.subscribe('session.started', (event) => {
        console.log('📊 SessionManager 直接监听 - 会话开始');
      });
      
      agentEventBus.subscribe('session.ended', (event) => {
        console.log('📊 SessionManager 直接监听 - 会话结束');
      });
      
      console.log('无Client事件监听结果：');
      mockAgent.simulateEvents();
      
      setTimeout(() => {
        console.log('✅ 无 Client 测试完成\n');
        console.log('🎉 所有事件驱动架构测试完成！');
      }, 100);
    }, 100);
  }, 100);
}, 100); 