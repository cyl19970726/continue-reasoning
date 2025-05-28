import { z } from 'zod';
import { IContext, IAgent, ToolCallResult, ITool } from '../../interfaces';
import { logger } from '../../utils/logger';
import { createTool, ContextHelper } from '../../utils';

// 用户输入上下文数据结构
const UserInputContextSchema = z.object({
  currentUserInput: z.string().optional(),
  conversationHistory: z.array(z.object({
    timestamp: z.number(),
    source: z.enum(['user', 'agent']),
    content: z.string(),
    sessionId: z.string()
  })).default([]),
  pendingRequests: z.array(z.object({
    requestId: z.string(),
    type: z.enum(['input', 'approval']),
    prompt: z.string(),
    timestamp: z.number()
  })).default([])
});

type UserInputContextData = z.infer<typeof UserInputContextSchema>;

// 回复用户工具
const ReplyToUserTool = createTool({
  name: 'reply_to_user',
  description: 'Send a reply to the user through the interactive layer',
  inputSchema: z.object({
    content: z.string().describe('The content of the reply'),
    replyType: z.enum(['text', 'markdown', 'structured']).optional().describe('Type of reply format (default: text)'),
    metadata: z.object({
      reasoning: z.string().optional().describe('Reasoning behind the response'),
      confidence: z.number().optional().describe('Confidence level (0-1)'),
      suggestions: z.array(z.string()).optional().describe('Suggestions for the user')
    }).optional().describe('Additional metadata for the response')
  }),
  outputSchema: z.object({
    sent: z.boolean(),
    messageId: z.string()
  }),
  async: false,
  execute: async (params, agent) => {
    const messageId = `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`Sending reply to user: "${params.content}" (${messageId})`);
    
    // 通过EventBus发送Agent回复事件
    if (agent?.eventBus) {
      await agent.eventBus.publish({
        type: 'agent_reply',
        source: 'agent',
        sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
        payload: {
          content: params.content,
          replyType: params.replyType || 'text', // 默认为文本类型
          metadata: params.metadata
        }
      });
    }
    
    // 更新对话历史
    if (agent) {
      const context = agent.contextManager.findContextById('user-input-context');
      if (context && 'setData' in context && 'getData' in context) {
        const currentData = (context as any).getData();
        (context as any).setData({
          ...currentData,
          conversationHistory: [
            ...currentData.conversationHistory,
            {
              timestamp: Date.now(),
              source: 'agent' as const,
              content: params.content,
              sessionId: agent.eventBus?.getActiveSessions()[0] || 'default'
            }
          ]
        });
      }
    }
    
    return {
      sent: true,
      messageId
    };
  }
});

// 请求用户输入工具（用于Agent主动请求特定信息）
const RequestUserInputTool = createTool({
  name: 'request_user_input',
  description: 'Request specific input from the user (e.g., password, configuration)',
  inputSchema: z.object({
    prompt: z.string().describe('The prompt to show to the user'),
    inputType: z.enum(['text', 'choice', 'file_path', 'confirmation', 'password', 'config']).describe('Type of input expected'),
    options: z.array(z.string()).optional().describe('Options for choice type input'),
    validation: z.object({
      required: z.boolean(),
      pattern: z.string().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional()
    }).optional().describe('Validation rules for the input'),
    sensitive: z.boolean().optional().describe('Whether this is sensitive information'),
    timeout: z.number().optional().describe('Timeout in milliseconds')
  }),
  outputSchema: z.object({
    requestId: z.string(),
    sent: z.boolean()
  }),
  async: false,
  execute: async (params, agent) => {
    const requestId = `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`Requesting user input: "${params.prompt}" (${requestId})`);
    
    // 通过EventBus发送输入请求事件
    if (agent?.eventBus) {
      await agent.eventBus.publish({
        type: 'input_request',
        source: 'agent',
        sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
        payload: {
          requestId,
          ...params
        }
      });
    }
    
    // 更新上下文中的待处理请求
    const context = agent?.contextManager.findContextById('user-input-context');
    if (context && 'setData' in context && 'getData' in context) {
      const currentData = (context as any).getData();
      (context as any).setData({
        ...currentData,
        pendingRequests: [
          ...currentData.pendingRequests,
          {
            requestId,
            type: 'input',
            prompt: params.prompt,
            timestamp: Date.now()
          }
        ]
      });
    }
    
    return {
      requestId,
      sent: true
    };
  }
});


// Agent Stop Tool
const AgentStopInputSchema = z.object({
  reason: z.string().optional().describe("Reason for stopping the agent (optional)")
});

const AgentStopOutputSchema = z.object({
  success: z.boolean(),
  message: z.string()
});

export const AgentStopTool = createTool({
  id: "agent_stop",
  name: "agent_stop",
  description: "Stop the agent after completing current tasks. Use this when all planned work is finished or when you need to halt execution.",
  inputSchema: AgentStopInputSchema,
  outputSchema: AgentStopOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { 
        success: false, 
        message: "Agent not available for stopping" 
      };
    }

    try {
      const reason = params.reason || "Task completion requested";
      
      logger.info(`Agent stop requested: ${reason}`);
      
      // Call the agent's stop method
      agent.stop();
      
      return {
        success: true,
        message: `Agent stop initiated. Reason: ${reason}`
      };
    } catch (error) {
      logger.error(`Failed to stop agent: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// 创建 UserInputContext 工厂函数
export function createUserInputContext() {
  const baseContext = ContextHelper.createContext({
    id: 'user-input-context',
    description: 'Manages user input processing and conversation history',
    dataSchema: UserInputContextSchema,
    initialData: {
      conversationHistory: [],
      pendingRequests: []
    },
    renderPromptFn: (data: UserInputContextData) => {
      const { currentUserInput, conversationHistory, pendingRequests } = data;
      
      let prompt = '## User Input Context\n\n';
      
      if (currentUserInput) {
        prompt += `**Current User Input:** ${currentUserInput}\n\n`;
      }
      
      if (conversationHistory.length > 0) {
        prompt += '**Recent Conversation History:**\n';
        const recentHistory = conversationHistory.slice(-20); // 最近20条
        recentHistory.forEach(entry => {
          const time = new Date(entry.timestamp).toLocaleTimeString();
          prompt += `- [${time}] ${entry.source}: ${entry.content}\n`;
        });
        prompt += '\n';
      }
      
      if (pendingRequests.length > 0) {
        prompt += '**Pending User Input Requests:**\n';
        pendingRequests.forEach(request => {
          const time = new Date(request.timestamp).toLocaleTimeString();
          prompt += `- [${time}] ${request.type}: ${request.prompt} (ID: ${request.requestId})\n`;
        });
        prompt += '\n';
      }
      
      prompt += '**Guidelines:**\n';
      prompt += '- Use `reply_to_user` to respond to user messages and questions\n';
      prompt += '- Use `request_user_input` when you need specific information from the user\n';
      prompt += '- Always maintain conversation context and history\n';
      prompt += '- Choose appropriate replyType for replies (text, markdown, structured)\n';
      prompt += '- Use `agent_stop` to stop the agent when tasks are completed or when you need to halt execution.\n';
      
      return prompt;
    },
    toolSetFn: () => ({
      name: 'UserInputTools',
      description: 'Tools for handling user input and sending replies',
      tools: [ReplyToUserTool, RequestUserInputTool],
      active: true,
      source: 'local' as const
    }),
    handleToolCall: (toolCallResult: ToolCallResult) => {
      // 处理工具调用结果
      if (toolCallResult.name === 'reply_to_user') {
        logger.debug('User reply sent successfully');
      } else if (toolCallResult.name === 'request_user_input') {
        logger.debug('User input request sent successfully');
      }
    }
  });

  // 扩展 context 添加自定义方法
  return {
    ...baseContext,
    
    // 处理输入响应事件
    async handleInputResponse(event: any): Promise<void> {
      const { requestId, value } = event.payload;
      
      // 移除已完成的请求
      const currentData = baseContext.getData();
      const updatedRequests = currentData.pendingRequests.filter(
        (req: any) => req.requestId !== requestId
      );
      
      // 添加到对话历史
      const newHistoryEntry = {
        timestamp: Date.now(),
        source: 'user' as const,
        content: value,
        sessionId: event.sessionId
      };
      
      baseContext.setData({
        ...currentData,
        pendingRequests: updatedRequests,
        conversationHistory: [...currentData.conversationHistory, newHistoryEntry]
      });
      
      logger.info(`Processed input response for request ${requestId}: ${value}`);
    },

    // 处理用户消息事件
    async handleUserMessage(event: any): Promise<void> {
      const { content, messageType, context } = event.payload;
      
      // 添加到对话历史
      const newHistoryEntry = {
        timestamp: Date.now(),
        source: 'user' as const,
        content,
        sessionId: event.sessionId
      };
      
      baseContext.setData({
        ...baseContext.data,
        currentUserInput: content,
        conversationHistory: [...baseContext.data.conversationHistory, newHistoryEntry]
      });
      
      logger.info(`Processed user message: "${content}" (type: ${messageType})`);
    },

    // 公共方法用于处理用户输入（保持向后兼容）
    processUserInput(input: string, sessionId: string): void {
      const newHistoryEntry = {
        timestamp: Date.now(),
        source: 'user' as const,
        content: input,
        sessionId
      };
      
      baseContext.setData({
        ...baseContext.data,
        currentUserInput: input,
        conversationHistory: [...baseContext.data.conversationHistory, newHistoryEntry]
      });
      
      logger.info(`Processed user input: "${input}" in session ${sessionId}`);
    }
  };
}

// 导出默认实例
export const UserInputContext = createUserInputContext(); 