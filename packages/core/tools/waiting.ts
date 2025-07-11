import { z } from 'zod';
import { createTool } from '../index.js';
import { logger } from '../utils/logger.js';

const WaitingToolParamsSchema = z.object({
  seconds: z.number().min(1).max(300).describe("Number of seconds to wait (1-300 seconds)"),
  reason: z.string().optional().describe("Reason for waiting (e.g., 'Rate limit encountered', 'Avoiding API throttling')")
});

const WaitingToolReturnsSchema = z.object({
  success: z.boolean().describe("Whether the waiting completed successfully"),
  waited_seconds: z.number().describe("Number of seconds actually waited"),
  message: z.string().describe("Status message about the waiting operation")
});

export const WaitingTool = createTool({
  id: 'WaitingTool',
  name: 'WaitingTool',
  description: `
  Pauses execution for a specified number of seconds to avoid rate limits or other throttling issues.
  
  **Use Cases:**
  - Rate limit encountered from OpenAI or other APIs
  - Need to throttle requests to avoid hitting usage limits
  - Implementing deliberate delays between operations
  
  **Important:** Use this tool when you encounter rate limit errors or need to space out API calls.
  `,
  inputSchema: WaitingToolParamsSchema,
  outputSchema: WaitingToolReturnsSchema,
  async: false,
  execute: async (params) => {
    const { seconds, reason } = params;
    
    logger.info(`WaitingTool: Starting wait for ${seconds} seconds. Reason: ${reason || 'Not specified'}`);
    
    const startTime = Date.now();
    
    try {
      // Use Promise-based sleep
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      
      const actualWaitTime = Math.round((Date.now() - startTime) / 1000);
      
      logger.info(`WaitingTool: Successfully waited for ${actualWaitTime} seconds`);
      
      return {
        success: true,
        waited_seconds: actualWaitTime,
        message: `Successfully waited for ${actualWaitTime} seconds. ${reason ? `Reason: ${reason}` : ''}`
      };
    } catch (error) {
      const actualWaitTime = Math.round((Date.now() - startTime) / 1000);
      logger.error(`WaitingTool: Error during wait: ${error}`);
      
      return {
        success: false,
        waited_seconds: actualWaitTime,
        message: `Wait interrupted after ${actualWaitTime} seconds: ${error}`
      };
    }
  }
});
