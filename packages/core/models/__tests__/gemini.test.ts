import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { GeminiWrapper } from '../gemini';
import { ILLM, ToolCallDefinition } from '../../interfaces';
import dotenv from 'dotenv';
import { GOOGLE_MODELS } from '../../models';

// Load environment variables
dotenv.config();

// Skip tests if no API key is available
const runTests = !!process.env.GEMINI_API_KEY;
const itif = runTests ? it : it.skip;

describe('GeminiWrapper', () => {
  let geminiWrapper: ILLM;
  let dummyTools: ToolCallDefinition[];

  beforeEach(() => {
    // Create a test instance
    geminiWrapper = new GeminiWrapper(GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20, true, 0.7, 1000);
    
    // Create some dummy tools for testing
    const TestParamSchema = z.object({
      param1: z.string().describe('A test string parameter'),
      param2: z.number().describe('A test number parameter'),
      optional: z.boolean().optional().describe('An optional boolean parameter')
    });
    
    dummyTools = [
      {
        type: 'function',
        name: 'test_function',
        description: 'A test function',
        paramSchema: TestParamSchema,
        async: false,
        strict: true,
        resultSchema: z.any()
      }
    ];
  });

  it('should initialize with correct defaults', () => {
    expect(geminiWrapper.model).toBe(GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20);
    expect(geminiWrapper.streaming).toBe(true);
    expect(geminiWrapper.parallelToolCall).toBe(false);
    expect(geminiWrapper.temperature).toBe(0.7);
    expect(geminiWrapper.maxTokens).toBe(1000);
  });

  it('should correctly toggle parallel tool calls', () => {
    expect(geminiWrapper.parallelToolCall).toBe(false);
    if (geminiWrapper.setParallelToolCall) {
      geminiWrapper.setParallelToolCall(true);
      expect(geminiWrapper.parallelToolCall).toBe(true);
      geminiWrapper.setParallelToolCall(false);
      expect(geminiWrapper.parallelToolCall).toBe(false);
    } else {
      // If setParallelToolCall is not available, we should set the property directly
      geminiWrapper.parallelToolCall = true;
      expect(geminiWrapper.parallelToolCall).toBe(true);
    }
  });

  // Only run API tests if API key is available
  itif('should handle API calls correctly', async () => {
    // Simple test message
    const message = 'Return a simple greeting';
    
    const result = await geminiWrapper.call(message, []);
    
    // Check response structure without asserting specific content
    expect(result).toHaveProperty('text');
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('toolCalls');
    expect(Array.isArray(result.toolCalls)).toBe(true);
  }, 10000); // Increase timeout for API call

  itif('should process function calls correctly', async () => {
    // Message that should trigger function calling
    const message = 'Please add 2 and 3';
    
    const result = await geminiWrapper.call(message, dummyTools);
    
    // We can't guarantee the model will call the function,
    // so just check response structure
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('toolCalls');
    expect(Array.isArray(result.toolCalls)).toBe(true);
    
    // If tool calls were made, verify they have the right structure
    if (result.toolCalls.length > 0) {
      const toolCall = result.toolCalls[0];
      expect(toolCall).toHaveProperty('type');
      expect(toolCall).toHaveProperty('name');
      expect(toolCall).toHaveProperty('call_id');
      expect(toolCall).toHaveProperty('parameters');
    }
  }, 10000); // Increase timeout for API call

  itif('should handle stream calls correctly', async () => {
    // Simple test message
    const message = 'Return a simple greeting';
    
    const result = await geminiWrapper.streamCall(message, []);
    
    // Check response structure without asserting specific content
    expect(result).toHaveProperty('text');
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('toolCalls');
    expect(Array.isArray(result.toolCalls)).toBe(true);
  }, 10000); // Increase timeout for API call

  itif('should support streaming tool calls with callStream API', async () => {
    const textChunks: string[] = [];
    const toolCalls: any[] = [];
    let finalText = '';
    
    for await (const chunk of geminiWrapper.callStream(
      "What's the weather like in Paris today?", 
      dummyTools,
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
    }
  }, 10000);

  itif('should call Gemini API with callAsync and parse response', async () => {
    const result = await geminiWrapper.callAsync(
      "What's the weather like in Paris today?", 
      dummyTools,
      { stepIndex: 0 }
    );

    // Basic response structure validation
    expect(result).toBeDefined();
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('toolCalls');
    expect(Array.isArray(result.toolCalls)).toBe(true);
    
    // Text should be a non-empty string 
    expect(typeof result.text).toBe('string');
  }, 10000);

  itif('should support streaming text only with callStream API', async () => {
    let textAccumulator = '';

    for await (const chunk of geminiWrapper.callStream(
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
  }, 10000);

  // Test error handling with an invalid API key
  it('should handle API errors gracefully', async () => {
    // Create wrapper with invalid API key
    const invalidWrapper = new GeminiWrapper('google', true, 0.7, 1000);
    // Temporarily override the API key
    const originalKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'invalid_key';
    
    try {
      const result = await invalidWrapper.call('Test message', []);
      
      // Check that we get an error message in the text
      expect(result.text).toContain('Error calling Gemini API');
      expect(result.toolCalls).toEqual([]);
    } finally {
      // Restore the original API key
      process.env.GEMINI_API_KEY = originalKey;
    }
  }, 10000); // Increase timeout for API call
}); 