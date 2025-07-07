import { describe, it, expect, beforeEach } from 'vitest';
import { AnthropicWrapper } from './anthropic';
import { LLMCallbacks, ToolCallDefinition } from '../interfaces';
import { ANTHROPIC_MODELS } from '../models';
import { z } from 'zod';

// 真实的集成测试 - 需要真实的 API 密钥
describe('AnthropicWrapper Real Streaming Integration', () => {
  let wrapper: AnthropicWrapper;
  let callbackResults: {
    onStart: number;
    onComplete: number;
    onError: any[];
    onChunkStart: Array<{index: number, data: any}>;
    onChunkComplete: Array<{index: number, data: any}>;
    onTextDelta: string[];
    onTextDone: string[];
    onToolCallStart: Array<{id: string, name: string}>;
    onToolCallDelta: Array<{id: string, delta: string}>;
    onToolCallDone: Array<{id: string, name: string, arguments: any}>;
  };
  let callbacks: LLMCallbacks;

  beforeEach(() => {
    // 检查是否有 API 密钥，如果没有则跳过测试
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('ANTHROPIC_API_KEY not found, skipping real integration tests');
      return;
    }

    wrapper = new AnthropicWrapper(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST, true, 0.7, 1000);
    
    // 设置回调结果追踪
    callbackResults = {
      onStart: 0,
      onComplete: 0,
      onError: [],
      onChunkStart: [],
      onChunkComplete: [],
      onTextDelta: [],
      onTextDone: [],
      onToolCallStart: [],
      onToolCallDelta: [],
      onToolCallDone: []
    };
    
    // 设置测试回调
    callbacks = {
      onStart: () => { 
        console.log('🟢 Stream started');
        callbackResults.onStart++; 
      },
      onComplete: () => { 
        console.log('🏁 Stream completed');
        callbackResults.onComplete++; 
      },
      onError: (error) => { 
        console.log('❌ Error:', error.message);
        callbackResults.onError.push(error); 
      },
      onChunkStart: (index, data) => { 
        console.log(`📦 Chunk ${index} started:`, data?.type);
        callbackResults.onChunkStart.push({index, data}); 
      },
      onChunkComplete: (index, data) => { 
        console.log(`✅ Chunk ${index} completed:`, data?.type);
        callbackResults.onChunkComplete.push({index, data}); 
      },
      onTextDelta: (delta) => { 
        process.stdout.write(delta);
        callbackResults.onTextDelta.push(delta); 
      },
      onTextDone: (text) => { 
        console.log(`\n📝 Complete text (${text.length} chars):`, text.substring(0, 100) + '...');
        callbackResults.onTextDone.push(text); 
      },
      onToolCallStart: (tool) => { 
        console.log(`🔧 Tool call started: ${tool.name} (${tool.id})`);
        callbackResults.onToolCallStart.push(tool); 
      },
      onToolCallDelta: (tool) => { 
        console.log(`🔧📦 Tool arguments delta: ${tool.delta}`);
        callbackResults.onToolCallDelta.push(tool); 
      },
      onToolCallDone: (tool) => { 
        console.log(`🔧✅ Tool call completed: ${tool.name}`, tool.arguments);
        callbackResults.onToolCallDone.push(tool); 
      }
    };
  });

  // 只有在有 API 密钥时才运行
  it.skipIf(!process.env.ANTHROPIC_API_KEY)('should stream a simple text response', async () => {
    console.log('\n=== Testing Simple Text Streaming ===');
    
    const result = await wrapper.streamCall(
      'Say hello in exactly 5 words', 
      [], 
      callbacks
    );

    console.log('\n📊 Final Result:', result);
    console.log('📈 Callback Stats:', {
      start: callbackResults.onStart,
      complete: callbackResults.onComplete,
      textDeltas: callbackResults.onTextDelta.length,
      textDone: callbackResults.onTextDone.length,
      chunkStart: callbackResults.onChunkStart.length,
      chunkComplete: callbackResults.onChunkComplete.length,
      errors: callbackResults.onError.length
    });

    // 验证基本流式行为
    expect(result.text).toBeTruthy();
    expect(result.toolCalls).toHaveLength(0);
    expect(callbackResults.onStart).toBe(1);
    expect(callbackResults.onComplete).toBe(1);
    expect(callbackResults.onTextDelta.length).toBeGreaterThan(0);
    expect(callbackResults.onChunkStart.length).toBeGreaterThan(0);
    expect(callbackResults.onChunkComplete.length).toBeGreaterThan(0);
    expect(callbackResults.onError).toHaveLength(0);
    
    // 验证所有文本片段组合起来等于最终文本
    const combinedDeltas = callbackResults.onTextDelta.join('');
    expect(combinedDeltas).toBe(result.text);
  }, 30000); // 30 秒超时

  it.skipIf(!process.env.ANTHROPIC_API_KEY)('should stream a response with tool calls', async () => {
    console.log('\n=== Testing Tool Call Streaming ===');
    
    const tools: ToolCallDefinition[] = [{
      type: 'function',
      name: 'get_weather',
      description: 'Get the current weather for a location',
      paramSchema: z.object({
        location: z.string().describe('The location to get weather for'),
        units: z.enum(['celsius', 'fahrenheit']).optional().describe('Temperature units')
      }),
      strict: false
    }];

    const result = await wrapper.streamCall(
      'What is the weather like in Paris? Use the get_weather tool.',
      tools,
      callbacks
    );

    console.log('\n📊 Final Result:', result);
    console.log('📈 Callback Stats:', {
      start: callbackResults.onStart,
      complete: callbackResults.onComplete,
      textDeltas: callbackResults.onTextDelta.length,
      toolCallStart: callbackResults.onToolCallStart.length,
      toolCallDelta: callbackResults.onToolCallDelta.length,
      toolCallDone: callbackResults.onToolCallDone.length,
      chunkStart: callbackResults.onChunkStart.length,
      chunkComplete: callbackResults.onChunkComplete.length,
      errors: callbackResults.onError.length
    });

    // 验证工具调用
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(callbackResults.onStart).toBe(1);
    expect(callbackResults.onComplete).toBe(1);
    expect(callbackResults.onToolCallStart.length).toBeGreaterThan(0);
    expect(callbackResults.onToolCallDone.length).toBeGreaterThan(0);
    expect(callbackResults.onError).toHaveLength(0);

    // 验证工具调用参数
    const toolCall = result.toolCalls[0];
    expect(toolCall.name).toBe('get_weather');
    expect(toolCall.parameters).toHaveProperty('location');
    expect(typeof toolCall.parameters.location).toBe('string');
  }, 30000);

  it.skipIf(!process.env.ANTHROPIC_API_KEY)('should handle mixed text and tool response', async () => {
    console.log('\n=== Testing Mixed Response Streaming ===');
    
    const tools: ToolCallDefinition[] = [{
      type: 'function',
      name: 'calculate',
      description: 'Perform a mathematical calculation',
      paramSchema: z.object({
        expression: z.string().describe('The mathematical expression to calculate'),
      }),
      strict: false
    }];

    const result = await wrapper.streamCall(
      'I need to calculate 25 * 4. Let me use the calculator tool.',
      tools,
      callbacks
    );

    console.log('\n📊 Final Result:', result);
    console.log('📈 Callback Stats:', {
      start: callbackResults.onStart,
      complete: callbackResults.onComplete,
      textDeltas: callbackResults.onTextDelta.length,
      textDone: callbackResults.onTextDone.length,
      toolCallStart: callbackResults.onToolCallStart.length,
      toolCallDone: callbackResults.onToolCallDone.length,
      chunkStart: callbackResults.onChunkStart.length,
      chunkComplete: callbackResults.onChunkComplete.length,
      errors: callbackResults.onError.length
    });

    // 验证混合响应
    expect(callbackResults.onStart).toBe(1);
    expect(callbackResults.onComplete).toBe(1);
    expect(callbackResults.onError).toHaveLength(0);
    
    // 应该有文本或工具调用（或两者）
    const hasText = result.text.length > 0;
    const hasToolCalls = result.toolCalls.length > 0;
    expect(hasText || hasToolCalls).toBe(true);
    
    if (hasToolCalls) {
      expect(callbackResults.onToolCallStart.length).toBeGreaterThan(0);
      expect(callbackResults.onToolCallDone.length).toBeGreaterThan(0);
    }
    
    if (hasText) {
      expect(callbackResults.onTextDelta.length).toBeGreaterThan(0);
    }
  }, 30000);

  it.skipIf(!process.env.ANTHROPIC_API_KEY)('should test callback timing and order', async () => {
    console.log('\n=== Testing Callback Order and Timing ===');
    
    const eventLog: Array<{timestamp: number, event: string, data?: any}> = [];
    
    const timedCallbacks: LLMCallbacks = {
      onStart: () => {
        eventLog.push({timestamp: Date.now(), event: 'start'});
      },
      onChunkStart: (index, data) => {
        eventLog.push({timestamp: Date.now(), event: 'chunkStart', data: {index, type: data?.type}});
      },
      onTextDelta: (delta) => {
        eventLog.push({timestamp: Date.now(), event: 'textDelta', data: {length: delta.length}});
      },
      onTextDone: (text) => {
        eventLog.push({timestamp: Date.now(), event: 'textDone', data: {length: text.length}});
      },
      onChunkComplete: (index, data) => {
        eventLog.push({timestamp: Date.now(), event: 'chunkComplete', data: {index, type: data?.type}});
      },
      onComplete: () => {
        eventLog.push({timestamp: Date.now(), event: 'complete'});
      },
      onError: (error) => {
        eventLog.push({timestamp: Date.now(), event: 'error', data: {message: error.message}});
      }
    };

    await wrapper.streamCall(
      'Write a short haiku about programming',
      [],
      timedCallbacks
    );

    console.log('\n📋 Event Log:');
    eventLog.forEach((log, i) => {
      const relativeTime = i === 0 ? 0 : log.timestamp - eventLog[0].timestamp;
      console.log(`  ${i + 1}. [+${relativeTime}ms] ${log.event}:`, log.data || '');
    });

    // 验证事件顺序
    expect(eventLog[0].event).toBe('start');
    expect(eventLog[eventLog.length - 1].event).toBe('complete');
    
    // 验证没有错误
    const errorEvents = eventLog.filter(e => e.event === 'error');
    expect(errorEvents).toHaveLength(0);
    
    // 验证至少有一些文本增量事件
    const textDeltaEvents = eventLog.filter(e => e.event === 'textDelta');
    expect(textDeltaEvents.length).toBeGreaterThan(0);
    
    // 验证块事件配对
    const chunkStartEvents = eventLog.filter(e => e.event === 'chunkStart');
    const chunkCompleteEvents = eventLog.filter(e => e.event === 'chunkComplete');
    expect(chunkStartEvents.length).toBe(chunkCompleteEvents.length);
  }, 30000);

  it.skipIf(!process.env.ANTHROPIC_API_KEY)('should test content block structure', async () => {
    console.log('\n=== Testing Content Block Structure ===');
    
    const result = await wrapper.streamCall(
      'Explain what a content block is in one sentence',
      [],
      callbacks
    );

    console.log('\n📊 Content Block Analysis:');
    console.log('📦 Chunk starts:', callbackResults.onChunkStart.map((c, i) => `${i}: ${c.data?.type}`));
    console.log('✅ Chunk completes:', callbackResults.onChunkComplete.map((c, i) => `${i}: ${c.data?.type}`));
    console.log('📝 Text deltas:', callbackResults.onTextDelta.length);
    console.log('📄 Text done:', callbackResults.onTextDone.length);

    // 验证内容块结构
    expect(callbackResults.onChunkStart.length).toBeGreaterThan(0);
    expect(callbackResults.onChunkComplete.length).toBe(callbackResults.onChunkStart.length);
    
    // 验证文本块
    const textChunks = callbackResults.onChunkStart.filter(c => c.data?.type === 'text');
    expect(textChunks.length).toBeGreaterThan(0);
    
    // 验证文本内容
    expect(result.text).toBeTruthy();
    expect(callbackResults.onTextDelta.length).toBeGreaterThan(0);
  }, 30000);
});