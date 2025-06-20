import { describe, it, expect } from 'vitest';
import { OpenAIChatWrapper } from './openai-chat';
import { z } from 'zod';
import dotenv from 'dotenv';
import { OPENAI_MODELS } from '../models';

dotenv.config();

describe('OpenAIChatWrapper', () => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;
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

  (hasApiKey ? it : it.skip)('should create a properly configured instance', () => {
    const wrapper = new OpenAIChatWrapper(OPENAI_MODELS.GPT_4O, false, 0.7, 1000);
    expect(wrapper).toBeInstanceOf(OpenAIChatWrapper);
    expect(wrapper.model).toBe(OPENAI_MODELS.GPT_4O);
    expect(wrapper.streaming).toBe(false);
    expect(wrapper.temperature).toBe(0.7);
    expect(wrapper.maxTokens).toBe(1000);
  });

  (hasApiKey ? it : it.skip)('should call OpenAI chat API and parse response', async () => {
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

  (hasApiKey ? it : it.skip)('should stream chat API with OpenAI chat API', async () => {
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
});