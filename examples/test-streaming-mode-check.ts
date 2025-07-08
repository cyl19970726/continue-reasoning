import { SimpleClient } from '../packages/core/clients/simple-client';
import { SessionManager } from '../packages/core/session/sessionManager';
import { AgentCallbacks } from '../packages/core/interfaces';

/**
 * 测试 Streaming Mode 检查功能
 * 验证在流式模式和非流式模式下，回调是否被正确过滤
 */

// 模拟 Agent（用于测试）
const mockAgent = {
  setCallBacks: (callbacks: AgentCallbacks) => {
    console.log('=== Agent 接收到的回调 ===');
    console.log('onLLMTextDelta:', typeof callbacks.onLLMTextDelta);
    console.log('onToolCallStart:', typeof callbacks.onToolCallStart);
    console.log('onLLMTextDone:', typeof callbacks.onLLMTextDone);
    console.log('onToolExecutionEnd:', typeof callbacks.onToolExecutionEnd);
    console.log('onSessionStart:', typeof callbacks.onSessionStart);
    console.log('loadAgentStorage:', typeof callbacks.loadAgentStorage);
    console.log('');
  }
} as any;

console.log('🧪 测试 Streaming Mode 检查功能\n');

// 测试 1: 非流式模式
console.log('📝 测试 1: 非流式模式');
const nonStreamingClient = new SimpleClient('non-streaming-client', {
  enableStreaming: false
});

console.log('Client streaming mode:', nonStreamingClient.isStreamingMode());

const sessionManager1 = new SessionManager(mockAgent, nonStreamingClient);
console.log('✅ 非流式模式测试完成 - onLLMTextDelta 和 onToolCallStart 应该是 undefined\n');

// 测试 2: 流式模式
console.log('📝 测试 2: 流式模式');
const streamingClient = new SimpleClient('streaming-client', {
  enableStreaming: true
});

console.log('Client streaming mode:', streamingClient.isStreamingMode());

const sessionManager2 = new SessionManager(mockAgent, streamingClient);
console.log('✅ 流式模式测试完成 - 所有回调都应该可用\n');

// 测试 3: 更换 Client 的流式模式
console.log('📝 测试 3: 在非流式 Client 中设置自定义回调');
const customCallbacks: AgentCallbacks = {
  onLLMTextDelta: (stepIndex, chunkIndex, delta) => {
    console.log(`这个回调不应该被传递给 Agent (non-streaming mode)`);
  },
  onToolCallStart: (toolCall) => {
    console.log(`这个回调不应该被传递给 Agent (non-streaming mode)`);
  },
  onLLMTextDone: (stepIndex, chunkIndex, text) => {
    console.log(`这个回调应该被传递给 Agent`);
  },
  loadAgentStorage: async (sessionId) => null
};

nonStreamingClient.setAgentCallbacks(customCallbacks);
sessionManager1.setClient(nonStreamingClient); // 重新设置以触发回调设置

console.log('✅ 自定义回调测试完成\n');

// 测试 4: 无 Client 的情况
console.log('📝 测试 4: 无 Client 的情况');
const sessionManagerNoClient = new SessionManager(mockAgent);
console.log('✅ 无 Client 测试完成 - 应该只有 SessionManager 的基本回调\n');

console.log('🎉 所有 Streaming Mode 检查测试完成！'); 