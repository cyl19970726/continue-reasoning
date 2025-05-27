import { describe, it, expect, beforeAll } from 'vitest';
import { AnthropicWrapper } from './anthropic';
import { z } from 'zod';
import dotenv from 'dotenv';
import { ANTHROPIC_MODELS } from '../models';

dotenv.config();

/**
 * Simple test to demonstrate using the Anthropic Claude model with tool calling
 * Note: This test is skipped by default since it requires an API key
 * To run this test, set the ANTHROPIC_API_KEY environment variable
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

  // Define a tool for Claude to use
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
    const wrapper = new AnthropicWrapper(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST, false, 0.7, 1000);
    
    expect(wrapper).toBeInstanceOf(AnthropicWrapper);
    expect(wrapper.model).toBe(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST);
    expect(wrapper.streaming).toBe(false);
    expect(wrapper.temperature).toBe(0.7);
    expect(wrapper.maxTokens).toBe(1000);
  });

  (hasApiKey ? it : it.skip)('should call Claude API and parse response', async () => {
    const anthropicModel = new AnthropicWrapper(ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST, false, 0.7, 1000);
    
    const response = await anthropicModel.call(
      "What's the weather like in Paris today?", 
      [weatherTool]
    );

    // Basic response structure validation
    expect(response).toBeDefined();
    expect(response).toHaveProperty('text');
    expect(response).toHaveProperty('toolCalls');
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
    
    // Text should be a non-empty string 
    expect(typeof response.text).toBe('string');
  }, 30000); // Increase timeout to 30 seconds for API call
}); 