import { z } from 'zod';
import { createTool } from '@continue-reasoning/core';
import { logger } from '@continue-reasoning/core';

/**
 * Tool for excluding chat history messages from context
 * Allows agents to manage their conversation context by marking messages for exclusion
 */
export const ExcludeChatHistoryTool = createTool({
  name: 'excludeChatHistory',
  description: `
  Exclude specific chat messages from the context to reduce noise and improve focus.
  Messages marked as excluded will be filtered out in future interactions.
  
  Usage:
  - Remove redundant, repetitive, outdated, irrelevant messages that add noise.
`,
  inputSchema: z.object({
    messageIds: z.array(z.string()).describe('Array of message IDs to exclude from chat history'),
    reason: z.string().optional().describe('Optional reason for excluding these messages')
  }),
  async: false,
  execute: async (args, agent) => {
    const { messageIds, reason } = args;
    
    if (!agent) {
      return {
        success: false,
        message: 'Agent context is required for chat history management'
      };
    }

    try {
      // Get the prompt processor from the agent
      const promptProcessor = agent.getPromptProcessor();
      if (!promptProcessor) {
        return {
          success: false,
          message: 'Prompt processor not found in agent'
        };
      }

      // Get the chat history manager from the prompt processor
      const chatHistoryManager = promptProcessor.getChatHistoryManager();
      if (!chatHistoryManager) {
        return {
          success: false,
          message: 'Chat history manager not found in prompt processor'
        };
      }

      // Use the chat history manager's exclusion methods
      chatHistoryManager.excludeChatHistoryBatch(messageIds);
      
      logger.info(`Excluded ${messageIds.length} messages from chat history${reason ? `: ${reason}` : ''}`);
      
      return {
        success: true,
        message: `Successfully excluded ${messageIds.length} messages from chat history${reason ? `: ${reason}` : ''}`,
        excludedIds: messageIds
      };
    } catch (error) {
      logger.error('Error excluding chat history:', error);
      return {
        success: false,
        message: `Failed to exclude chat history: ${error}`
      };
    }
  }
});