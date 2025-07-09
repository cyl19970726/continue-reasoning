import { AgentFactory, AgentMode, StreamAgent, AsyncAgent, EventBus } from './index.js';

console.log('🚀 Testing New Event-Driven Architecture...');

// 测试导出
console.log('✅ Imports successful:', {
    AgentFactory: typeof AgentFactory,
    AgentMode: typeof AgentMode,
    StreamAgent: typeof StreamAgent,
    AsyncAgent: typeof AsyncAgent,
    EventBus: typeof EventBus
});

// 测试LLM能力检测
const mockLLM = {
    async *callStream() {
        yield { type: 'text-delta', content: 'Hello' };
    },
    async callAsync() {
        return { text: 'Hello' };
    }
};

try {
    const capabilities = AgentFactory.checkLLMCapabilities(mockLLM);
    console.log('✅ LLM Capabilities Detection:', capabilities);
} catch (error) {
    console.error('❌ LLM Capabilities Test Failed:', error);
}

console.log('🎉 New Architecture Test Complete!'); 