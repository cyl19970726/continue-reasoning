import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { AnthropicWrapper, type AnthropicMessage, type ToolChoice } from './anthropic.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import { ANTHROPIC_MODELS } from '../models';

dotenv.config();

/**
 * Comprehensive test suite for the Anthropic Claude model with tool calling
 * Note: Tests are conditionally skipped if no API key is provided
 * To run these tests, set the ANTHROPIC_API_KEY environment variable
 */

async function testAnthropicWithTools() {
  // Skip test if no API key is provided
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('Skipping Anthropic test: No API key provided');
    return;
  }

  // Define a test tool
  const getWeatherSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).strict();

  // Mock weather data function
  async function getWeather(latitude: number, longitude: number) {
    console.log(`Getting weather for coordinates: ${latitude}, ${longitude}`);
    return { temperature: 22, conditions: 'sunny' };
  }

  // Create the Anthropic wrapper
  const anthropicModel = new AnthropicWrapper(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST, false, 0.7, 1000);

  // Define a tool for Claude to use
  const weatherTool = {
    type: 'function' as const,
    name: 'get_weather',
    description: 'Get current temperature for provided coordinates in Celsius',
    paramSchema: getWeatherSchema,
    async: true,
    strict: true
  };

  try {
    console.log('Testing Anthropic Claude with tools...');
    
    // Call the model with a message
    const response = await anthropicModel.call(
      "What's the weather like in Paris today?", 
      [weatherTool]
    );

    console.log('Model response text:', response.text);
    console.log('Tool calls:', JSON.stringify(response.toolCalls, null, 2));

    // If there are tool calls, we would process them here
    if (response.toolCalls.length > 0) {
      const toolCall = response.toolCalls[0];
      console.log(`Processing tool call: ${toolCall.name}`);
      
      // Call the actual function
      if (toolCall.name === 'get_weather') {
        const result = await getWeather(
          toolCall.parameters.latitude, 
          toolCall.parameters.longitude
        );
        
        console.log('Weather result:', result);
        
        // In a real implementation, you would call the model again with the tool result
        // This would create a conversation flow with the model
      }
    }

    return response;
  } catch (error) {
    console.error('Error in Anthropic test:', error);
    throw error;
  }
}

// Only run the test if executed directly
if (require.main === module) {
  testAnthropicWithTools()
    .then(() => console.log('Test completed successfully'))
    .catch(err => console.error('Test failed:', err));
}

export { testAnthropicWithTools };

describe('AnthropicWrapper', () => {
  // Skip all tests if no API key is provided
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  // Define test values at describe level to be used in multiple tests
  const getWeatherSchema = z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).strict();

  const getTimeSchema = z.object({
    timezone: z.string(),
  }).strict();

  // Define tools for Claude to use
  const weatherTool = {
    type: 'function' as const,
    name: 'get_weather',
    description: 'Get current temperature for provided coordinates in Celsius',
    paramSchema: getWeatherSchema,
    async: true,
    strict: true
  };

  const timeTool = {
    type: 'function' as const,
    name: 'get_time',
    description: 'Get the current time in a given time zone',
    paramSchema: getTimeSchema,
    async: true,
    strict: true
  };

  const calculatorSchema = z.object({
    expression: z.string().describe('Mathematical expression to evaluate'),
  }).strict();

  const calculatorTool = {
    type: 'function' as const,
    name: 'calculate',
    description: 'Perform mathematical calculations',
    paramSchema: calculatorSchema,
    async: true,
    strict: true
  };

  let wrapper: AnthropicWrapper;

  beforeEach(() => {
    if (hasApiKey) {
      wrapper = new AnthropicWrapper(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST, false, 0.7, 1000);
    }
  });

  // Basic functionality tests
  (hasApiKey ? describe : describe.skip)('Basic functionality', () => {
    it('should create a properly configured instance', () => {
      expect(wrapper).toBeInstanceOf(AnthropicWrapper);
      expect(wrapper.model).toBe(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST);
      expect(wrapper.streaming).toBe(false);
      expect(wrapper.temperature).toBe(0.7);
      expect(wrapper.maxTokens).toBe(1000);
      expect(wrapper.parallelToolCall).toBe(true);
      expect(wrapper.toolChoice).toEqual({ type: "auto" });
    });

    it('should handle parallel tool call settings correctly', () => {
      wrapper.setParallelToolCall(false);
      expect(wrapper.parallelToolCall).toBe(false);
      expect(wrapper.toolChoice).toEqual({ type: "auto", disable_parallel_tool_use: true });

      wrapper.setParallelToolCall(true);
      expect(wrapper.parallelToolCall).toBe(true);
      expect(wrapper.toolChoice).toEqual({ type: "auto", disable_parallel_tool_use: false });
    });

    it('should set tool choice correctly', () => {
      const toolChoice: ToolChoice = { type: "tool", name: "get_weather" };
      wrapper.setToolChoice(toolChoice);
      expect(wrapper.toolChoice).toEqual(toolChoice);
    });

    it('should enable token-efficient tools', () => {
      wrapper.setTokenEfficientTools(true);
      expect(wrapper.enableTokenEfficientTools).toBe(true);
    });
  });

  // Single tool tests
  (hasApiKey ? describe : describe.skip)('Single tool usage', () => {
    it('should call Claude API with single tool and parse response', async () => {
      const response = await wrapper.call(
        "What's the weather like in San Francisco today?", 
        [weatherTool]
      );

      // Basic response structure validation
      expect(response).toBeDefined();
      expect(response).toHaveProperty('text');
      expect(response).toHaveProperty('toolCalls');
      expect(response).toHaveProperty('stopReason');
      expect(Array.isArray(response.toolCalls)).toBe(true);
      
      // When tool is used, expect toolCalls to potentially contain a call
      if (response.toolCalls.length > 0) {
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
      
      // Text should be a string
      expect(typeof response.text).toBe('string');
      
      // Stop reason should be defined
      expect(response.stopReason).toBeDefined();
    }, 30000);

    it('should handle forced tool usage with tool_choice', async () => {
      wrapper.setToolChoice({ type: "tool", name: "get_weather" });
      
      const response = await wrapper.call(
        "Tell me something about San Francisco.", 
        [weatherTool]
      );

      expect(response.toolCalls.length).toBeGreaterThan(0);
      expect(response.toolCalls[0].name).toBe('get_weather');
    }, 30000);

    it('should prevent tool usage with tool_choice none', async () => {
      wrapper.setToolChoice({ type: "none" });
      
      const response = await wrapper.call(
        "What's the weather like in San Francisco?", 
        [weatherTool]
      );

      expect(response.toolCalls.length).toBe(0);
      expect(response.text.length).toBeGreaterThan(0);
    }, 30000);

    it('should support streaming tool calls with callStream API', async () => {
      const textChunks: string[] = [];
      const toolCalls: any[] = [];
      const finalTexts: string[] = [];
      
      for await (const chunk of wrapper.callStream(
        "What's the weather like in Paris today?", 
        [weatherTool],
        { stepIndex: 0 }
      )) {
        if (chunk.type === 'text-delta') {
          textChunks.push(chunk.content);
        } else if (chunk.type === 'text-done') {
          finalTexts.push(chunk.content);
        } else if (chunk.type === 'tool-call-done') {
          toolCalls.push(chunk.toolCall);
        }
      }
      
      // Validate streaming behavior - at least one of text or tool calls should be present
      expect(finalTexts.length + toolCalls.length).toBeGreaterThan(0);
      
      // When tool is used, validate tool calls
      if (toolCalls.length > 0) {
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
      }
    }, 30000);

    it('should call Anthropic API with callAsync and parse response', async () => {
      const response = await wrapper.callAsync(
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
    }, 30000);

    it('should support streaming text only with callStream API', async () => {
      let textAccumulator = '';
      let finalTexts: string[] = [];

      for await (const chunk of wrapper.callStream(
        "hi, how are you?", 
        [],
        { stepIndex: 0 }
      )) {
        if (chunk.type === 'text-delta') {
          textAccumulator += chunk.content;
        } else if (chunk.type === 'text-done') {
          finalTexts.push(chunk.content);
        } 
      }
      
      // 验证至少收到了文本响应
      expect(textAccumulator.length).toBeGreaterThan(0);
      expect(finalTexts.length).toBeGreaterThan(0);
    }, 30000);
  });

  // Multiple tools tests
  (hasApiKey ? describe : describe.skip)('Multiple tool usage', () => {
    it('should handle multiple tools correctly', async () => {
      const response = await wrapper.call(
        "What's the weather like in New York right now? Also what time is it there?",
        [weatherTool, timeTool]
      );

      expect(response).toBeDefined();
      expect(Array.isArray(response.toolCalls)).toBe(true);
      
      // Should potentially call both tools
      if (response.toolCalls.length > 0) {
        const toolNames = response.toolCalls.map(call => call.name);
        const hasWeatherTool = toolNames.includes('get_weather');
        const hasTimeTool = toolNames.includes('get_time');
        
        // At least one tool should be called
        expect(hasWeatherTool || hasTimeTool).toBe(true);
      }
    }, 30000);

    it('should handle parallel tool calls when enabled', async () => {
      wrapper.setParallelToolCall(true);
      
      const response = await wrapper.call(
        "Calculate 15 * 24 and tell me the weather in Tokyo",
        [calculatorTool, weatherTool]
      );

      expect(response).toBeDefined();
      // Note: The model may or may not use parallel calls depending on the query
      // This test just ensures the setting doesn't break functionality
    }, 30000);

    it('should handle sequential tool calls when parallel is disabled', async () => {
      wrapper.setParallelToolCall(false);
      
      const response = await wrapper.call(
        "Calculate 10 + 5 and then tell me what time it is in London",
        [calculatorTool, timeTool]
      );

      expect(response).toBeDefined();
      expect(response.toolCalls.length).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  // Conversation handling tests
  (hasApiKey ? describe : describe.skip)('Conversation handling', () => {
    it('should handle multi-turn conversations', async () => {
      // First turn
      const firstResponse = await wrapper.call(
        "What's the weather like in Paris?",
        [weatherTool]
      );

      expect(firstResponse.toolCalls.length).toBeGreaterThan(0);
      
      // Create a conversation with tool result
      const conversation: AnthropicMessage[] = [
        { role: "user", content: "What's the weather like in Paris?" },
        { role: "assistant", content: firstResponse.text },
        wrapper.createToolResultMessage(
          firstResponse.toolCalls[0].call_id,
          "The weather in Paris is currently 15°C and sunny."
        )
      ];

      // Second turn
      const secondResponse = await wrapper.call(
        conversation,
        [weatherTool]
      );

      expect(secondResponse).toBeDefined();
      expect(typeof secondResponse.text).toBe('string');
      expect(secondResponse.text.length).toBeGreaterThan(0);
    }, 45000);

    it('should create tool result messages correctly', () => {
      const toolResultMessage = wrapper.createToolResultMessage(
        "test_call_id",
        "Test result",
        false
      );

      expect(toolResultMessage.role).toBe("user");
      expect(Array.isArray(toolResultMessage.content)).toBe(true);
      expect(toolResultMessage.content[0]).toMatchObject({
        type: "tool_result",
        tool_use_id: "test_call_id",
        content: "Test result",
        is_error: false
      });
    });

    it('should create error tool result messages', () => {
      const errorMessage = wrapper.createToolResultMessage(
        "test_call_id",
        "Error occurred",
        true
      );

      expect(errorMessage.content[0]).toMatchObject({
        type: "tool_result",
        tool_use_id: "test_call_id",
        content: "Error occurred",
        is_error: true
      });
    });
  });

  // Streaming tests
  (hasApiKey ? describe : describe.skip)('Streaming functionality', () => {
    it('should handle streaming responses', async () => {
      const response = await wrapper.streamCall(
        "What's the weather like in Tokyo?",
        [weatherTool]
      );

      expect(response).toBeDefined();
      expect(response).toHaveProperty('text');
      expect(response).toHaveProperty('toolCalls');
      expect(response).toHaveProperty('stopReason');
      expect(typeof response.text).toBe('string');
      expect(Array.isArray(response.toolCalls)).toBe(true);
    }, 30000);

    it('should stream with multiple tools', async () => {
      const response = await wrapper.streamCall(
        "Calculate 25 * 4 and tell me the time in Sydney",
        [calculatorTool, timeTool]
      );

      expect(response).toBeDefined();
      expect(typeof response.text).toBe('string');
    }, 30000);

    it('should support streaming with multiple tools using callStream API', async () => {
      const textChunks: string[] = [];
      const toolCalls: any[] = [];
      let finalText = '';
      
      for await (const chunk of wrapper.callStream(
        "Calculate 25 * 4 and tell me the time in Sydney", 
        [calculatorTool, timeTool],
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
      
      expect(finalText).toBeDefined();
      expect(typeof finalText).toBe('string');
      
      // Should potentially call multiple tools
      if (toolCalls.length > 0) {
        const toolNames = toolCalls.map(call => call.name);
        const hasCalculatorTool = toolNames.includes('calculate');
        const hasTimeTool = toolNames.includes('get_time');
        
        // At least one tool should be called
        expect(hasCalculatorTool || hasTimeTool).toBe(true);
      }
    }, 30000);
  });

  // Token-efficient tools tests (only for supported models)
  (hasApiKey ? describe : describe.skip)('Token-efficient tools', () => {
    it('should work with token-efficient tools on supported models', async () => {
      // Create a wrapper with a Sonnet 3.7 model
      const sonnetWrapper = new AnthropicWrapper(
        'claude-3-7-sonnet-20250219' as any,  // Cast to handle potential type issues
        false,
        0.7,
        1000
      );
      
      sonnetWrapper.setTokenEfficientTools(true);
      
      const response = await sonnetWrapper.call(
        "What's the weather in Berlin?",
        [weatherTool]
      );

      expect(response).toBeDefined();
      expect(typeof response.text).toBe('string');
    }, 30000);
  });

  // Error handling tests
  (hasApiKey ? describe : describe.skip)('Error handling', () => {
    it('should handle invalid tool parameters gracefully', async () => {
      const invalidTool = {
        type: 'function' as const,
        name: 'invalid_tool',
        description: 'This tool has invalid schema',
        paramSchema: z.string(), // Invalid - should be ZodObject
        async: true,
        strict: true
      };

      // This should return an error response, not throw
      const response = await wrapper.call("Test message", [invalidTool as any]);
      expect(response.stopReason).toBe('error');
      expect(response.text).toContain('paramSchema must be a ZodObject');
    });

    it('should handle API errors gracefully', async () => {
      // Create wrapper with invalid model
      const invalidWrapper = new AnthropicWrapper(
        'invalid-model' as any,
        false,
        0.7,
        1000
      );

      const response = await invalidWrapper.call(
        "Test message",
        [weatherTool]
      );

      expect(response.text).toContain('Error calling Anthropic API');
      expect(response.stopReason).toBe('error');
    }, 30000);
  });

  // Edge cases and advanced scenarios
  (hasApiKey ? describe : describe.skip)('Edge cases and advanced scenarios', () => {
    it('should handle empty tool list', async () => {
      const response = await wrapper.call(
        "Hello, how are you?",
        []
      );

      expect(response).toBeDefined();
      expect(response.toolCalls.length).toBe(0);
      expect(typeof response.text).toBe('string');
      expect(response.text.length).toBeGreaterThan(0);
    }, 30000);

    it('should handle very long messages', async () => {
      const longMessage = "Tell me about the weather. " + "Please provide detailed information. ".repeat(100);
      
      const response = await wrapper.call(
        longMessage,
        [weatherTool]
      );

      expect(response).toBeDefined();
      expect(typeof response.text).toBe('string');
    }, 30000);

    it('should handle complex tool schemas', async () => {
      const complexSchema = z.object({
        location: z.object({
          latitude: z.number(),
          longitude: z.number(),
          address: z.string().optional(),
        }),
        options: z.object({
          units: z.enum(['celsius', 'fahrenheit']),
          includeForcast: z.boolean().default(false),
          days: z.number().min(1).max(10).optional(),
        }).optional(),
        metadata: z.record(z.string()).optional(),
      }).strict();

      const complexTool = {
        type: 'function' as const,
        name: 'get_detailed_weather',
        description: 'Get detailed weather information with complex parameters',
        paramSchema: complexSchema,
        async: true,
        strict: true
      };

      const response = await wrapper.call(
        "Get detailed weather for San Francisco with a 5-day forecast",
        [complexTool]
      );

      expect(response).toBeDefined();
    }, 30000);

    it('should handle max_tokens stop reason', async () => {
      // Set very low max tokens to force truncation
      const lowTokenWrapper = new AnthropicWrapper(
        ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST,
        false,
        0.7,
        10  // Very low token limit
      );

      const response = await lowTokenWrapper.call(
        "Write a very long essay about the weather patterns around the world",
        []
      );

      expect(response).toBeDefined();
      // The response might be truncated
      expect(response.stopReason).toBeDefined();
    }, 30000);
  });

  // Performance and timeout tests
  (hasApiKey ? describe : describe.skip)('Performance and reliability', () => {
    it('should complete within reasonable time limits', async () => {
      const startTime = Date.now();
      
      const response = await wrapper.call(
        "What's the weather like today?",
        [weatherTool]
      );

      const duration = Date.now() - startTime;
      
      expect(response).toBeDefined();
      expect(duration).toBeLessThan(30000); // Should complete within 30 seconds
    });

    it('should handle concurrent requests', async () => {
      const promises = Array.from({ length: 3 }, (_, i) => 
        wrapper.call(
          `What's the weather like in city ${i}?`,
          [weatherTool]
        )
      );

      const responses = await Promise.all(promises);
      
      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response).toBeDefined();
        expect(typeof response.text).toBe('string');
      });
    }, 60000);
  });
}); 