import { describe, it, expect } from 'vitest';
import { OpenAIChatWrapper } from './openai-chat';
import { z } from 'zod';
import dotenv from 'dotenv';
import { OPENAI_MODELS, DEEPSEEK_MODELS } from '../models';

dotenv.config();

describe('OpenAIChatWrapper', () => {
  const hasOpenAIApiKey = !!process.env.OPENAI_API_KEY;
  const hasDeepSeekApiKey = !!process.env.DEEPSEEK_API_KEY;
  const getWeatherSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).strict();

  const weatherTool = {
    type: 'function' as const,
    name: 'get_weather',
    description: 'Get current temperature for provided coordinates in Celsius',
    paramSchema: getWeatherSchema,
    async: true,
    strict: true,
  };

  (hasOpenAIApiKey ? it : it.skip)('should create a properly configured instance', () => {
    const wrapper = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, false, 0.7, 1000);
    expect(wrapper).toBeInstanceOf(OpenAIChatWrapper);
    expect(wrapper.model).toBe(OPENAI_MODELS.GPT_4O);
    expect(wrapper.streaming).toBe(false);
    expect(wrapper.temperature).toBe(0.7);
    expect(wrapper.maxTokens).toBe(1000);
  });

  (hasOpenAIApiKey ? it : it.skip)('should call OpenAI chat API and parse response', async () => {
    const chatModel = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, false, 0.7, 1000);
    const response = await chatModel.call(
      "What's the weather like in Paris today?",
      [weatherTool]
    );
    expect(response).toBeDefined();
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('toolCalls');
    expect(Array.isArray(response.toolCalls)).toBe(true);

    if (response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      expect(toolCall).toHaveProperty('type', 'function');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
    expect(typeof response.text).toBe('string');
  }, 30000);

  (hasOpenAIApiKey ? it : it.skip)('should stream chat API with OpenAI chat API', async () => {
    const chatModel = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, true, 0.7, 1000);
    const response = await chatModel.streamCall(
      "What's the weather like in Paris today?",
      [weatherTool]
    );
    expect(response).toBeDefined();
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('toolCalls');
    expect(Array.isArray(response.toolCalls)).toBe(true);

    if (response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      expect(toolCall).toHaveProperty('type', 'function');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
    expect(typeof response.text).toBe('string');
  }, 30000);

  (hasOpenAIApiKey ? it : it.skip)('should support streaming tool calls with callStream API', async () => {
    const chatModel = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, true, 0.7, 1000);
    const textChunks: string[] = [];
    const toolCalls: any[] = [];
    let finalText = '';
    
    for await (const chunk of chatModel.callStream(
      "What's the weather like in Paris today?", 
      [weatherTool],
      { stepIndex: 0 }
    )) {
      if (chunk.type === 'text-delta') {
        textChunks.push(chunk.content);
      } else if (chunk.type === 'text-done') {
        finalText = chunk.content;
      } else if (chunk.type === 'tool-call-done') {
        toolCalls.push(chunk.toolCall);
      }
    }
    
    // Validate streaming behavior
    expect(finalText).toBeDefined();
    expect(typeof finalText).toBe('string');
    
    // When tool is used, validate tool calls
    if (toolCalls.length > 0) {
      const toolCall = toolCalls[0];
      expect(toolCall).toHaveProperty('type', 'function');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
      
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
  }, 30000);

  (hasOpenAIApiKey ? it : it.skip)('should call OpenAI Chat API with callAsync and parse response', async () => {
    const chatModel = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, false, 0.7, 1000);
    const response = await chatModel.callAsync(
      "What's the weather like in Paris today?", 
      [weatherTool],
      { stepIndex: 0 }
    );

    // Basic response structure validation
    expect(response).toBeDefined();
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('toolCalls');
    expect(Array.isArray(response.toolCalls)).toBe(true);
    
    // When tool is used, expect toolCalls to potentially contain a call
    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      expect(toolCall).toHaveProperty('type', 'function');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
      
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
    
    // Text should be a non-empty string 
    expect(typeof response.text).toBe('string');
  }, 30000);

  (hasOpenAIApiKey ? it : it.skip)('should support streaming text only with callStream API', async () => {
    const chatModel = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, true, 0.7, 1000);
    let textAccumulator = '';

    for await (const chunk of chatModel.callStream(
      "hi, how are you?", 
      [],
      { stepIndex: 0 }
    )) {
      if (chunk.type === 'text-delta') {
        textAccumulator += chunk.content;
      } else if (chunk.type === 'text-done') {
        // Verify accumulated text matches final text
        expect(textAccumulator).toBe(chunk.content);
      } 
    }
  }, 30000);

  // DeepSeek Tests
  (hasDeepSeekApiKey ? it : it.skip)('should create a properly configured instance with DeepSeek model', () => {
    const wrapper = new OpenAIChatWrapper(DEEPSEEK_MODELS.REASONER, false, 0.7, 1000);
    expect(wrapper).toBeInstanceOf(OpenAIChatWrapper);
    expect(wrapper.model).toBe(DEEPSEEK_MODELS.REASONER);
    expect(wrapper.streaming).toBe(false);
    expect(wrapper.temperature).toBe(0.7);
    expect(wrapper.maxTokens).toBe(1000);
  });

  (hasDeepSeekApiKey ? it : it.skip)('should call DeepSeek API and parse response', async () => {
    const chatModel = new OpenAIChatWrapper(DEEPSEEK_MODELS.REASONER, false, 0.7, 1000);
    const response = await chatModel.call(
      "What's the weather like in Paris today?",
      [weatherTool]
    );
    expect(response).toBeDefined();
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('toolCalls');
    expect(Array.isArray(response.toolCalls)).toBe(true);

    if (response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      expect(toolCall).toHaveProperty('type', 'function');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
    expect(typeof response.text).toBe('string');
  }, 30000);

  (hasDeepSeekApiKey ? it : it.skip)('should stream DeepSeek API and parse response', async () => {
    const chatModel = new OpenAIChatWrapper(DEEPSEEK_MODELS.REASONER, true, 0.7, 1000);
    const response = await chatModel.streamCall(
      "What's the weather like in Paris today?",
      [weatherTool]
    );
    expect(response).toBeDefined();
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('toolCalls');
    expect(Array.isArray(response.toolCalls)).toBe(true);

    if (response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      expect(toolCall).toHaveProperty('type', 'function');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');  
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
    expect(typeof response.text).toBe('string');
  }, 30000);
});