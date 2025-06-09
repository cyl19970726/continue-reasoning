import { createTool, ContextHelper } from "@continue-reasoning/core";
import { z } from "zod";
import { IAgent, PromptCtx } from "@continue-reasoning/core";
import { logger } from "@continue-reasoning/core";
import { v4 as uuidv4 } from 'uuid';

export const InteractiveContextId = "interactive-context";

// Schema for the context data
const InteractiveContextSchema = z.object({
  pendingApprovals: z.array(z.object({
    id: z.string(),
    timestamp: z.number(),
    actionType: z.string(),
    description: z.string(),
    status: z.enum(['pending', 'approved', 'rejected', 'timeout'])
  })).default([]),
  approvalHistory: z.array(z.object({
    id: z.string(),
    timestamp: z.number(),
    actionType: z.string(),
    description: z.string(),
    decision: z.enum(['accept', 'reject', 'modify']),
    response: z.string().optional(),
    modification: z.string().optional()
  })).default([]),
  pendingRequests: z.array(z.object({
    requestId: z.string(),
    type: z.enum(['input', 'approval']),
    prompt: z.string(),
    timestamp: z.number()
  })).default([])
});

// Interaction Management Tool - handles all interaction operations
const InteractionManagementInputSchema = z.object({
  command: z.enum(['request_approval', 'list_pending']).describe("Interaction operation to perform"),
  
  // For request_approval command
  actionType: z.enum(['file_write', 'file_delete', 'command_execute', 'git_operation', 'network_access']).optional().describe("Type of action requiring approval (required for request_approval)"),
  description: z.string().optional().describe("Clear description of what action requires approval (required for request_approval)"),
  details: z.object({
    command: z.string().optional().describe("Command to be executed (if applicable)"),
    filePaths: z.array(z.string()).optional().describe("Paths of files to be affected"),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    preview: z.string().optional().describe("Preview of the content/action")
  }).optional().describe("Action details (required for request_approval)"),
  timeout: z.number().optional().describe("Timeout in milliseconds (default: 30 seconds if not specified)")
});

const InteractionManagementOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  
  // For request_approval response
  approved: z.boolean().optional(),
  requestId: z.string().optional(),
  decision: z.enum(['accept', 'reject', 'modify']).optional(),
  modification: z.string().optional(),
  
  // For list_pending response
  pendingApprovals: z.array(z.object({
    id: z.string(),
    timestamp: z.number(),
    actionType: z.string(),
    description: z.string(),
    status: z.string()
  })).optional()
});

export const InteractionManagementTool = createTool({
  id: "interaction_management",
  name: "interaction_management",
  description: "Manage user interactions including approval requests and pending approval status. Use this tool to request user approval for risky actions or check approval status.",
  inputSchema: InteractionManagementInputSchema,
  outputSchema: InteractionManagementOutputSchema,
  async: true, // This is async as approval requests wait for user response
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    const context = agent.contextManager.findContextById(InteractiveContextId);
    if (!context) {
      return { success: false, message: "Interactive context not found" };
    }

    try {
      switch (params.command) {
        case 'request_approval': {
          if (!params.actionType || !params.description || !params.details) {
            return { 
              success: false, 
              message: "actionType, description, and details are required for request_approval command",
              approved: false
            };
          }

          if (!agent.eventBus) {
            return { 
              success: false, 
              message: "EventBus not available. Cannot request approval.",
              approved: false,
              requestId: ''
            };
          }

          const requestId = uuidv4();
          const currentData = context.getData();
          
          // Add to pending approvals
          const pendingApproval = {
            id: requestId,
            timestamp: Date.now(),
            actionType: params.actionType,
            description: params.description,
            status: 'pending' as const
          };
          
          context.setData({
            ...currentData,
            pendingApprovals: [...currentData.pendingApprovals, pendingApproval]
          });

          // Use existing session or create new one
          const activeSessions = agent.eventBus.getActiveSessions();
          const sessionId = activeSessions.length > 0 ? activeSessions[0] : agent.eventBus.createSession();

          logger.info(`Approval request sent: ${requestId} - ${params.description}`);
          logger.info(`Using sessionId: ${sessionId} for approval request`);

          // Create subscription BEFORE publishing request to avoid race condition
          const responsePromise = waitForApprovalResponse(agent.eventBus, requestId, params.timeout || 30000, sessionId);

          // Publish approval request event
          await agent.eventBus.publish({
            type: 'approval_request',
            source: 'agent',
            sessionId,
            payload: {
              requestId,
              actionType: params.actionType,
              description: params.description,
              details: params.details,
              timeout: params.timeout
            }
          });

          // Wait for approval response
          const response = await responsePromise;
          
          // Update context with result
          const updatedData = context.getData();
          const approvalIndex = updatedData.pendingApprovals.findIndex((a: any) => a.id === requestId);
          if (approvalIndex >= 0) {
            updatedData.pendingApprovals[approvalIndex].status = 
              response.decision === 'accept' ? 'approved' : 'rejected';
          }

          // Add to history
          updatedData.approvalHistory.push({
            id: requestId,
            timestamp: Date.now(),
            actionType: params.actionType,
            description: params.description,
            decision: response.decision,
            response: response.response,
            modification: response.modification
          });

          context.setData(updatedData);

          return {
            success: true,
            message: `Approval request ${response.decision === 'accept' ? 'approved' : 'rejected'}`,
            approved: response.decision === 'accept',
            requestId,
            decision: response.decision,
            modification: response.modification
          };
        }

        case 'list_pending': {
          const data = context.getData();
          return {
            success: true,
            message: `Found ${data.pendingApprovals.length} pending approvals`,
            pendingApprovals: data.pendingApprovals
          };
        }

        default:
          return { success: false, message: `Unknown command: ${params.command}` };
      }
    } catch (error) {
      logger.error(`Interaction management error: ${error}`);
      
             // Update status to timeout/error for approval requests
       if (params.command === 'request_approval') {
         return { 
           success: false, 
           message: error instanceof Error ? error.message : String(error),
           approved: false,
           requestId: ''
         };
       }

      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// 请求用户输入工具（用于Agent主动请求特定信息）
export const RequestUserInputTool = createTool({
  name: 'request_user_input',
  description: 'Request specific input from the user (e.g., password, configuration, file paths) and wait for response',
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
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 60000)')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    requestId: z.string(),
    value: z.any().optional(),
    error: z.string().optional()
  }),
  async: true, // 🆕 Changed to async since we now wait for response
  execute: async (params, agent) => {
    if (!agent || !agent.eventBus) {
      return { 
        success: false, 
        requestId: '', 
        error: 'Agent or EventBus not available' 
      };
    }

    const requestId = `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeout = params.timeout || 60000; // Default 60 seconds
    
    logger.info(`Requesting user input: "${params.prompt}" (${requestId})`);
    
    try {
      // 使用现有的session或创建新的session
      const activeSessions = agent.eventBus.getActiveSessions();
      const sessionId = activeSessions.length > 0 ? activeSessions[0] : agent.eventBus.createSession();

      // 更新上下文中的待处理请求
      const context = agent.contextManager.findContextById(InteractiveContextId);
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

      // 创建等待响应的Promise
      const responsePromise = waitForUserInput(agent.eventBus, requestId, timeout, sessionId);

      // 发送输入请求事件
      await agent.eventBus.publish({
        type: 'input_request',
        source: 'agent',
        sessionId,
        payload: {
          requestId,
          prompt: params.prompt,
          inputType: params.inputType,
          options: params.options,
          validation: params.validation,
          sensitive: params.sensitive,
          timeout
        }
      });

      // 等待用户响应
      const response = await responsePromise;

      // 清理待处理请求
      if (context && 'setData' in context && 'getData' in context) {
        const currentData = (context as any).getData();
        const updatedRequests = currentData.pendingRequests.filter(
          (req: any) => req.requestId !== requestId
        );
        (context as any).setData({
          ...currentData,
          pendingRequests: updatedRequests
        });
      }

      return {
        success: response.success,
        requestId,
        value: response.value,
        error: response.error
      };

    } catch (error) {
      logger.error(`User input request failed: ${error}`);
      
      // 清理待处理请求（即使失败）
      const context = agent.contextManager.findContextById(InteractiveContextId);
      if (context && 'setData' in context && 'getData' in context) {
        const currentData = (context as any).getData();
        const updatedRequests = currentData.pendingRequests.filter(
          (req: any) => req.requestId !== requestId
        );
        (context as any).setData({
          ...currentData,
          pendingRequests: updatedRequests
        });
      }

      return {
        success: false,
        requestId,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Helper function to wait for approval response
async function waitForApprovalResponse(
  eventBus: any, 
  requestId: string, 
  timeout: number,
  sessionId: string
): Promise<{
  decision: 'accept' | 'reject' | 'modify';
  response?: string;
  modification?: string;
}> {
  return new Promise((resolve, reject) => {
    let responseReceived = false;
    
    logger.info(`Waiting for approval response with requestId: ${requestId} in session: ${sessionId}`);
    
    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      if (!responseReceived) {
        responseReceived = true;
        eventBus.unsubscribe(subscriptionId);
        logger.error(`Approval request timeout after ${timeout}ms for requestId: ${requestId}`);
        reject(new Error(`Approval request timeout after ${timeout}ms`));
      }
    }, timeout);

    // Subscribe to approval responses with session filtering
    const subscriptionId = eventBus.subscribe('approval_response', async (message: any) => {
      if (responseReceived) return;
      
      // Check both requestId and sessionId to ensure proper routing
      if (message.payload && 
          message.payload.requestId === requestId && 
          message.sessionId === sessionId) {
        logger.info(`RequestId and SessionId match found! Resolving approval for: ${requestId}`);
        responseReceived = true;
        clearTimeout(timeoutHandle);
        eventBus.unsubscribe(subscriptionId);
        
        resolve({
          decision: message.payload.decision,
          response: message.payload.response,
          modification: message.payload.modification
        });
      } else {
        logger.debug(`Event mismatch. Expected requestId: ${requestId}, sessionId: ${sessionId}, Got requestId: ${message.payload?.requestId}, sessionId: ${message.sessionId}`);
      }
    }, {
      filter: {
        sessionId: sessionId,
        eventTypes: ['approval_response']
      }
    });
  });
}

// Helper function to wait for user input response
async function waitForUserInput(
  eventBus: any, 
  requestId: string, 
  timeout: number,
  sessionId: string
): Promise<{
  success: boolean;
  value?: any;
  error?: string;
}> {
  return new Promise((resolve, reject) => {
    let responseReceived = false;
    
    logger.info(`Waiting for user input response with requestId: ${requestId} in session: ${sessionId}`);
    
    // Set up timeout
    const timeoutHandle = setTimeout(() => {
      if (!responseReceived) {
        responseReceived = true;
        eventBus.unsubscribe(subscriptionId);
        logger.error(`User input request timeout after ${timeout}ms for requestId: ${requestId}`);
        reject(new Error(`User input request timeout after ${timeout}ms`));
      }
    }, timeout);

    // Subscribe to input responses with session filtering
    const subscriptionId = eventBus.subscribe('input_response', async (message: any) => {
      if (responseReceived) return;
      
      // Check both requestId and sessionId to ensure proper routing
      if (message.payload && 
          message.payload.requestId === requestId && 
          message.sessionId === sessionId) {
        logger.info(`RequestId and SessionId match found! Resolving input for: ${requestId}`);
        responseReceived = true;
        clearTimeout(timeoutHandle);
        eventBus.unsubscribe(subscriptionId);
        
        resolve({
          success: true,
          value: message.payload.value,
          error: message.payload.error
        });
      } else {
        logger.debug(`Event mismatch. Expected requestId: ${requestId}, sessionId: ${sessionId}, Got requestId: ${message.payload?.requestId}, sessionId: ${message.sessionId}`);
      }
    }, {
      filter: {
        sessionId: sessionId,
        eventTypes: ['input_response']
      }
    });
  });
}

// Create the Interactive Context
export function createInteractiveContext() {
  const baseContext = ContextHelper.createContext({
    id: InteractiveContextId,
    description: "Manages interactive communication between the agent and users, including approval requests and collaboration workflows. This context handles the coordination of permission-based actions.",
    dataSchema: InteractiveContextSchema,
    initialData: {
      pendingApprovals: [],
      approvalHistory: [],
      pendingRequests: []
    },
    promptCtx: {
      workflow: `
## USER INTERACTION WORKFLOW
1. Request approval for risky operations using interaction_management
2. Request user input for missing information using request_user_input
3. Wait for user response and continue execution
`,
      status: `Interactive Status: No pending interactions`,
      guideline: `
## INTERACTION GUIDELINES
- **Request approval** for file operations, commands, git operations, network access
- **Request user input** when you need specific information not available
- **Risk levels**: low, medium, high, critical
- Use appropriate timeouts for requests
`,
      examples: `
## QUICK EXAMPLES
Request approval: interaction_management({command: 'request_approval', actionType: 'file_write', description: 'Create new file', details: {riskLevel: 'medium'}})
Request input: request_user_input({prompt: 'Enter API key', inputType: 'password'})
`
    },
    renderPromptFn: (data: z.infer<typeof InteractiveContextSchema>): PromptCtx => {
      const pendingCount = data.pendingApprovals.filter(a => a.status === 'pending').length;
      const pendingRequestsCount = data.pendingRequests?.length || 0;
      
      let dynamicStatus = `Interactive Status: `;
      
      if (pendingCount > 0 || pendingRequestsCount > 0) {
        dynamicStatus += `${pendingCount + pendingRequestsCount} pending interactions`;
      } else {
        dynamicStatus += `No pending interactions`;
      }

      return {
        workflow: `
## USER INTERACTION WORKFLOW
1. Request approval for risky operations using interaction_management
2. Request user input for missing information using request_user_input
3. Wait for user response and continue execution
`,
        status: dynamicStatus,
        guideline: `
## INTERACTION GUIDELINES
- **Request approval** for file operations, commands, git operations, network access
- **Request user input** when you need specific information not available
- **Risk levels**: low, medium, high, critical
- Use appropriate timeouts for requests
`,
        examples: `
## QUICK EXAMPLES
Request approval: interaction_management({command: 'request_approval', actionType: 'file_write', description: 'Create new file', details: {riskLevel: 'medium'}})
Request input: request_user_input({prompt: 'Enter API key', inputType: 'password'})
`
      };
    },
    toolSetFn: () => ({
      name: "InteractiveTools",
      description: "Tools for managing user interactions, approvals, and collaborative workflows. Use this toolset when you need user permission or input for actions.",
      tools: [InteractionManagementTool, RequestUserInputTool],
      active: true,
      source: "local"
    }),
    // 🆕 简化的 install 函数 - 只添加 requestApproval 方法
    install: async (agent: IAgent) => {
      logger.info('Installing Interactive Context - adding requestApproval method...');
      
      // 🔧 只添加 requestApproval 方法到 agent（requestUserInput 通过工具提供）
      (agent as any).requestApproval = async function(request: any): Promise<any> {
        if (!this.eventBus) {
          throw new Error('EventBus is required for approval requests');
        }
        
        const requestId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        logger.info(`Agent requesting approval: ${JSON.stringify(request)}`);
        
        await this.eventBus.publish({
          type: 'approval_request',
          source: 'agent',
          sessionId: this.eventBus.getActiveSessions()[0] || 'default',
          payload: {
            requestId,
            context: 'interactive',
            ...request
          }
        });
        
        // 等待响应（这里简化处理，实际应该有超时机制）
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.eventBus.unsubscribe(subscriptionId);
            reject(new Error('Approval request timeout'));
          }, 30000); // 30 seconds timeout
          
          const subscriptionId = this.eventBus.subscribe('approval_response', async (event: any) => {
            if (event.payload.requestId === requestId) {
              clearTimeout(timeout);
              this.eventBus.unsubscribe(subscriptionId);
              resolve(event.payload);
            }
          });
        });
      };
      
      logger.info('Interactive Context install completed - requestApproval method added');
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
      
      baseContext.setData({
        ...currentData,
        pendingRequests: updatedRequests
      });
      
      logger.info(`Processed input response for request ${requestId}: ${value}`);
    }
  };
}

// 导出默认实例
export const InteractiveContext = createInteractiveContext(); 