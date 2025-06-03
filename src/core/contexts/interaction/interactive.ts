import { createTool, ContextHelper } from "../../utils";
import { z } from "zod";
import { IAgent, PromptCtx } from "../../interfaces";
import { logger } from "../../utils/logger";
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
  description: 'Request specific input from the user (e.g., password, configuration, file paths)',
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
    success: z.boolean(),
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
    const context = agent?.contextManager.findContextById(InteractiveContextId);
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
      success: true,
      requestId,
      sent: true
    };
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

### Approval Request Flow:
1. **Risk Assessment**: Identify actions requiring user approval
2. **Request Submission**: Use interaction_management to request approval
3. **User Response**: Wait for user approval/rejection/modification
4. **Action Execution**: Proceed based on user decision
5. **Result Feedback**: Inform user of action completion

### Input Request Flow:
1. **Information Need**: Identify required user input
2. **Input Request**: Use request_user_input to request specific information
3. **User Response**: Receive and validate user input
4. **Data Processing**: Use provided information in subsequent actions
`,
      status: `Interactive Status: No pending interactions`,
      guideline: `
## INTERACTION GUIDELINES

### When to Request Approval:
- **File Operations**: Creating, modifying, or deleting files
- **Command Execution**: Running system commands or scripts
- **Git Operations**: Committing, pushing, or merging code
- **Network Access**: Making external API calls or downloads
- **Critical Actions**: Any action that could affect system state

### Risk Levels:
- **Low**: Reading files, listing directories, checking status
- **Medium**: Creating/modifying non-critical files, running safe commands
- **High**: Modifying system files, running potentially dangerous commands
- **Critical**: Deleting files, system-level operations, irreversible actions

### Best Practices:
1. Always request approval for actions that could modify the system
2. Provide clear, descriptive explanations of what you want to do
3. Include file paths, command details, and expected outcomes
4. Respect user decisions - don't retry rejected requests immediately
5. Use appropriate risk levels to help users make informed decisions
6. Request user input when you need specific information not available in context
`,
      examples: `
## INTERACTION EXAMPLES

### Example 1: File Deletion Approval
\`\`\`
interaction_management({
  command: 'request_approval',
  actionType: 'file_delete',
  description: 'Delete temporary build files',
  details: {
    filePaths: ['build/temp.js', 'build/cache/'],
    riskLevel: 'medium',
    preview: 'Will delete 2 temporary files and 1 cache directory'
  }
})
\`\`\`

### Example 2: Command Execution Approval
\`\`\`
interaction_management({
  command: 'request_approval',
  actionType: 'command_execute',
  description: 'Run npm install to install dependencies',
  details: {
    command: 'npm install',
    riskLevel: 'medium',
    preview: 'Will install packages from package.json'
  }
})
\`\`\`

### Example 3: Request User Input
\`\`\`
request_user_input({
  prompt: 'Enter the API endpoint URL for the production environment',
  inputType: 'text',
  validation: {
    required: true,
    pattern: '^https?://.*'
  }
})
\`\`\`

### Example 4: Request Configuration Choice
\`\`\`
request_user_input({
  prompt: 'Select the deployment environment',
  inputType: 'choice',
  options: ['development', 'staging', 'production']
})
\`\`\`
`
    },
    renderPromptFn: (data: z.infer<typeof InteractiveContextSchema>): PromptCtx => {
      const pendingCount = data.pendingApprovals.filter(a => a.status === 'pending').length;
      const pendingRequestsCount = data.pendingRequests?.length || 0;
      const recentHistory = data.approvalHistory.slice(-5); // Last 5 approvals
      
      let dynamicStatus = `Interactive Status: `;
      
      if (pendingCount > 0 || pendingRequestsCount > 0) {
        dynamicStatus += `${pendingCount + pendingRequestsCount} pending interactions\n`;
        dynamicStatus += `- Pending Approvals: ${pendingCount}\n`;
        dynamicStatus += `- Pending Input Requests: ${pendingRequestsCount}`;
      } else {
        dynamicStatus += `No pending interactions`;
      }
      
      dynamicStatus += `\n- Recent Approval History: ${recentHistory.length} entries`;

      if (pendingCount > 0) {
        dynamicStatus += `\n\nPENDING APPROVALS:\n`;
        data.pendingApprovals
          .filter(a => a.status === 'pending')
          .forEach(a => {
            dynamicStatus += `- ${a.id}: ${a.actionType} - ${a.description}\n`;
          });
      }

      if (pendingRequestsCount > 0) {
        dynamicStatus += `\nPENDING INPUT REQUESTS:\n`;
        data.pendingRequests.forEach(r => {
          dynamicStatus += `- ${r.requestId}: ${r.type} - ${r.prompt}\n`;
        });
      }

      if (recentHistory.length > 0) {
        dynamicStatus += `\nRECENT APPROVAL HISTORY:\n`;
        recentHistory.forEach(h => {
          dynamicStatus += `- ${h.actionType}: ${h.decision} - ${h.description}\n`;
        });
      }

      return {
        workflow: `
## USER INTERACTION WORKFLOW

### Approval Request Flow:
1. **Risk Assessment**: Identify actions requiring user approval
2. **Request Submission**: Use interaction_management to request approval
3. **User Response**: Wait for user approval/rejection/modification
4. **Action Execution**: Proceed based on user decision
5. **Result Feedback**: Inform user of action completion

### Input Request Flow:
1. **Information Need**: Identify required user input
2. **Input Request**: Use request_user_input to request specific information
3. **User Response**: Receive and validate user input
4. **Data Processing**: Use provided information in subsequent actions

### Available Tools:
- **interaction_management**: Handle approval requests and check pending status
- **request_user_input**: Request specific input from the user (passwords, configs, etc.)
`,
        status: dynamicStatus,
        guideline: `
## INTERACTION GUIDELINES

### When to Request Approval:
- **File Operations**: Creating, modifying, or deleting files
- **Command Execution**: Running system commands or scripts
- **Git Operations**: Committing, pushing, or merging code
- **Network Access**: Making external API calls or downloads
- **Critical Actions**: Any action that could affect system state

### Risk Levels:
- **Low**: Reading files, listing directories, checking status
- **Medium**: Creating/modifying non-critical files, running safe commands
- **High**: Modifying system files, running potentially dangerous commands
- **Critical**: Deleting files, system-level operations, irreversible actions

### Best Practices:
1. Always request approval for actions that could modify the system
2. Provide clear, descriptive explanations of what you want to do
3. Include file paths, command details, and expected outcomes
4. Respect user decisions - don't retry rejected requests immediately
5. Use appropriate risk levels to help users make informed decisions
6. Request user input when you need specific information not available in context

### Command Usage:
- **request_approval**: Use before risky operations
- **list_pending**: Check status of pending approval requests
- **request_user_input**: Request specific information from user
`,
        examples: `
## INTERACTION EXAMPLES

### Example 1: File Deletion Approval
\`\`\`
interaction_management({
  command: 'request_approval',
  actionType: 'file_delete',
  description: 'Delete temporary build files',
  details: {
    filePaths: ['build/temp.js', 'build/cache/'],
    riskLevel: 'medium',
    preview: 'Will delete 2 temporary files and 1 cache directory'
  }
})
\`\`\`

### Example 2: Command Execution Approval
\`\`\`
interaction_management({
  command: 'request_approval',
  actionType: 'command_execute',
  description: 'Run npm install to install dependencies',
  details: {
    command: 'npm install',
    riskLevel: 'medium',
    preview: 'Will install packages from package.json'
  }
})
\`\`\`

### Example 3: Request User Input
\`\`\`
request_user_input({
  prompt: 'Enter the API endpoint URL for the production environment',
  inputType: 'text',
  validation: {
    required: true,
    pattern: '^https?://.*'
  }
})
\`\`\`

### Example 4: Request Configuration Choice
\`\`\`
request_user_input({
  prompt: 'Select the deployment environment',
  inputType: 'choice',
  options: ['development', 'staging', 'production']
})
\`\`\`
`
      };
    },
    toolSetFn: () => ({
      name: "InteractiveTools",
      description: "Tools for managing user interactions, approvals, and collaborative workflows. Use this toolset when you need user permission or input for actions.",
      tools: [InteractionManagementTool, RequestUserInputTool],
      active: true,
      source: "local"
    })
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