import { describe, it, expect } from 'vitest';
import { OpenAIWrapper } from './openai.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { OPENAI_MODELS } from '../models';

dotenv.config();

describe('OpenAIWrapper', () => {
  // Skip all tests if no API key is provided
  const hasApiKey = !!process.env.OPENAI_API_KEY;

  // Define test values at describe level to be used in multiple tests
  const getWeatherSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).strict();

  // Define a tool for OpenAI to use
  const weatherTool = {
    type: 'function' as const,
    name: 'get_weather',
    description: 'Get current temperature for provided coordinates in Celsius',
    paramSchema: getWeatherSchema,
    async: true,
    strict: true
  };

  // Use conditional testing to skip tests when no API key is available
  (hasApiKey ? it : it.skip)('should create a properly configured instance', () => {
    const wrapper = new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false, 0.7, 1000);
    
    expect(wrapper).toBeInstanceOf(OpenAIWrapper);
    expect(wrapper.model).toBe(OPENAI_MODELS.GPT_4O);
    expect(wrapper.streaming).toBe(false);
    expect(wrapper.temperature).toBe(0.7);
    expect(wrapper.maxTokens).toBe(1000);
  });

  (hasApiKey ? it : it.skip)('should call OpenAI API with callAsync and parse response', async () => {
    const openaiModel = new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false, 0.7, 1000);
    
    const response = await openaiModel.callAsync(
      "What's the weather like in Paris today?", 
      [weatherTool]
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
      
      // If the weather tool was called, validate its parameters
      if (toolCall.name === 'get_weather') {
        expect(toolCall.parameters).toHaveProperty('latitude');
        expect(toolCall.parameters).toHaveProperty('longitude');
        expect(typeof toolCall.parameters.latitude).toBe('number');
        expect(typeof toolCall.parameters.longitude).toBe('number');
      }
    }
    
    // Text should be a non-empty string 
    expect(typeof response.text).toBe('string');
  }, 30000); // Increase timeout to 30 seconds for API call

  // Testing the streaming API implementation with callStream
  (hasApiKey ? it : it.skip)('should support streaming tool calls with callStream API', async () => {
    const openaiModel = new OpenAIWrapper(OPENAI_MODELS.GPT_4O, true, 0.7, 1000);
    
    // Collect streaming chunks
    const textChunks: string[] = [];
    const toolCalls: any[] = [];
    let finalText = '';
    
    for await (const chunk of openaiModel.callStream(
      "What's the weather like in Paris today?", 
      [weatherTool]
    )) {
      console.log(chunk);
      if (chunk.type === 'text-delta') {
        textChunks.push(chunk.content);
      } else if (chunk.type === 'text-done') {
        finalText = chunk.content;
      } else if (chunk.type === 'tool-call-done') {
        toolCalls.push(chunk.toolCall);
      }
    }
    
    // Validate streaming behavior
    // expect(textChunks.length).toBeGreaterThan(0); // Should have received text chunks
    expect(finalText).toBeDefined();
    expect(typeof finalText).toBe('string');
    
    // When tool is used, validate tool calls
    const toolCall = toolCalls[0];
    expect(toolCall).toHaveProperty('type', 'function');
    expect(toolCall).toHaveProperty('name');
    expect(toolCall).toHaveProperty('call_id');
    expect(toolCall).toHaveProperty('parameters');
    
    // If the weather tool was called, validate its parameters
    if (toolCall.name === 'get_weather') {
      expect(toolCall.parameters).toHaveProperty('latitude');
      expect(toolCall.parameters).toHaveProperty('longitude');
      expect(typeof toolCall.parameters.latitude).toBe('number');
      expect(typeof toolCall.parameters.longitude).toBe('number');
      
    }
    
    // Verify that streaming text accumulates to final text
    const accumulatedText = textChunks.join('');
    if (accumulatedText.length > 0 && finalText.length > 0) {
      expect(finalText).toContain(accumulatedText.substring(0, Math.min(50, accumulatedText.length)));
    }
  }, 30000); // Increase timeout to 30 seconds for streaming API call

    // Testing the streaming API implementation with callStream
    (hasApiKey ? it : it.skip)('should support streaming text only with callStream API', async () => {
      const openaiModel = new OpenAIWrapper(OPENAI_MODELS.GPT_4O, true, 0.7, 1000);
      
      // Collect streaming chunks
      const toolCalls: any[] = [];
      let textAccumulators = '';

      for await (const chunk of openaiModel.callStream(
        "hi, how are you?", 
        [],
        { stepIndex: 0 }
      )) {
        console.log(chunk);
        if (chunk.type === 'text-delta') {
          textAccumulators += chunk.content;
        } else if (chunk.type === 'text-done') {
          
          // Verify accumulated text matches final text
          expect(textAccumulators).toBe(chunk.content);
          
        } 
      }
      
    }, 30000); // Increase timeout to 30 seconds for streaming API call
}); 