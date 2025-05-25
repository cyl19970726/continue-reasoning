import { createTool, ContextHelper } from "../utils";
import { z } from "zod";
import { IAgent } from "../interfaces";
import { logger } from "../utils/logger";
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
  })).default([])
});

// Approval Request Tool Schema
const ApprovalRequestInputSchema = z.object({
  actionType: z.enum(['file_write', 'file_delete', 'command_execute', 'git_operation', 'network_access']),
  description: z.string().describe("Clear description of what action requires approval"),
  details: z.object({
    command: z.string().optional().describe("Command to be executed (if applicable)"),
    filePaths: z.array(z.string()).optional().describe("Paths of files to be affected"),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    preview: z.string().optional().describe("Preview of the content/action")
  }),
  timeout: z.number().optional().default(30000).describe("Timeout in milliseconds (default: 30 seconds)")
});

const ApprovalRequestOutputSchema = z.object({
  approved: z.boolean(),
  requestId: z.string(),
  decision: z.enum(['accept', 'reject', 'modify']).optional(),
  modification: z.string().optional(),
  error: z.string().optional()
});

// Create the Approval Request Tool
export const ApprovalRequestTool = createTool({
  id: "approval_request",
  name: "approval_request", 
  description: "Request user approval for potentially risky or important actions before executing them. Use this tool when you need to write files, delete files, execute commands, or perform other operations that require user consent.",
  inputSchema: ApprovalRequestInputSchema,
  outputSchema: ApprovalRequestOutputSchema,
  async: true, // This is async as it waits for user response
  execute: async (params, agent?: IAgent) => {
    if (!agent || !agent.eventBus) {
      return { 
        approved: false, 
        requestId: '', 
        error: "EventBus not available. Cannot request approval." 
      };
    }

    const requestId = uuidv4();
    const context = agent.contextManager.findContextById(InteractiveContextId);
    
    if (!context) {
      return { 
        approved: false, 
        requestId, 
        error: "Interactive context not found" 
      };
    }

    try {
      // Add to pending approvals
      const currentData = context.getData();
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

      // Use existing session or create new one - should match InteractiveLayer session
      const activeSessions = agent.eventBus.getActiveSessions();
      const sessionId = activeSessions.length > 0 ? activeSessions[0] : agent.eventBus.createSession();

      logger.info(`Approval request sent: ${requestId} - ${params.description}`);
      logger.info(`Using sessionId: ${sessionId} for approval request`);

      // IMPORTANT: Create subscription BEFORE publishing request to avoid race condition
      const responsePromise = waitForApprovalResponse(agent.eventBus, requestId, params.timeout || 30000, sessionId);

      // Publish approval request event with requestId in payload
      await agent.eventBus.publish({
        type: 'approval_request',
        source: 'agent',
        sessionId,
        payload: {
          requestId, // Add requestId to payload so CLI can use it in response
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
        approved: response.decision === 'accept',
        requestId,
        decision: response.decision,
        modification: response.modification
      };

    } catch (error) {
      logger.error(`Approval request failed: ${error}`);
      
      // Update status to timeout/error
      const currentData = context.getData();
      const approvalIndex = currentData.pendingApprovals.findIndex((a: any) => a.id === requestId);
      if (approvalIndex >= 0) {
        currentData.pendingApprovals[approvalIndex].status = 'timeout';
        context.setData(currentData);
      }

      return { 
        approved: false, 
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

// List Pending Approvals Tool
export const ListPendingApprovalsTool = createTool({
  id: "list_pending_approvals",
  name: "list_pending_approvals",
  description: "List all pending approval requests",
  inputSchema: z.object({}),
  outputSchema: z.object({
    pendingApprovals: z.array(z.object({
      id: z.string(),
      timestamp: z.number(),
      actionType: z.string(),
      description: z.string(),
      status: z.string()
    }))
  }),
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { pendingApprovals: [] };
    }

    const context = agent.contextManager.findContextById(InteractiveContextId);
    if (!context) {
      return { pendingApprovals: [] };
    }

    const data = context.getData();
    return { pendingApprovals: data.pendingApprovals };
  }
});

// Create the Interactive Context
export const InteractiveContext = ContextHelper.createContext({
  id: InteractiveContextId,
  description: "Manages interactive communication between the agent and users, including approval requests, collaboration requests, and other user interaction flows. This context handles the coordination of permission-based actions and collaborative problem-solving.",
  dataSchema: InteractiveContextSchema,
  initialData: {
    pendingApprovals: [],
    approvalHistory: []
  },
  renderPromptFn: (data: z.infer<typeof InteractiveContextSchema>) => {
    const pendingCount = data.pendingApprovals.filter(a => a.status === 'pending').length;
    const recentHistory = data.approvalHistory.slice(-5); // Last 5 approvals
    
    return `
--- Interactive Context ---

User Interaction Management:
• approval_request: Request user approval for actions requiring permission
• list_pending_approvals: Check status of pending approval requests

Current Status:
- Pending Approvals: ${pendingCount}
- Recent Approval History: ${recentHistory.length} entries

${pendingCount > 0 ? `
PENDING APPROVALS:
${data.pendingApprovals
  .filter(a => a.status === 'pending')
  .map(a => `- ${a.id}: ${a.actionType} - ${a.description}`)
  .join('\n')}
` : ''}

${recentHistory.length > 0 ? `
RECENT APPROVAL HISTORY:
${recentHistory
  .map(h => `- ${h.actionType}: ${h.decision} - ${h.description}`)
  .join('\n')}
` : ''}

Usage Guidelines:
1. Always use approval_request before performing potentially risky operations
2. Required for: file operations, command execution, git operations, network access
3. Risk levels: low (simple reads), medium (file writes), high (system commands), critical (deletions)
4. Provide clear descriptions and previews to help users make informed decisions
5. Respect user decisions - do not retry rejected requests without justification

Remember: User approval is required for actions that could modify the system or access external resources.
    `;
  },
  toolSetFn: () => ({
    name: "InteractiveTools",
    description: "Tools for managing user interactions, approvals, and collaborative workflows. Use this toolset when you need user permission or input for actions.",
    tools: [ApprovalRequestTool, ListPendingApprovalsTool],
    active: true,
    source: "local"
  })
}); 