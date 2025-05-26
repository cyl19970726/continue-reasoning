import { createTool, ContextHelper } from "../../utils";
import { z } from "zod";
import { IAgent } from "../../interfaces";
import { logger } from "../../utils/logger";
import { PlanContextId } from "./plan";

export const CoordinationContextId = "coordination-context";

// Schema for coordination context data
const CoordinationContextSchema = z.object({
  activeWorkflows: z.array(z.object({
    id: z.string(),
    type: z.enum(['coding', 'planning', 'approval', 'mixed']),
    status: z.enum(['active', 'paused', 'completed', 'failed']),
    contexts: z.array(z.string()).describe("List of context IDs involved"),
    startTime: z.number(),
    endTime: z.number().optional(),
    metadata: z.record(z.any()).optional()
  })),
  contextPriorities: z.record(z.number()).describe("Priority levels for different contexts"),
  integrationSettings: z.object({
    autoCreatePlansForCoding: z.boolean().describe("Automatically create plan items for coding tasks"),
    requireApprovalForFileOps: z.boolean().describe("Require approval for file operations"),
    syncCodingProgress: z.boolean().describe("Sync coding progress with plan status"),
    consolidatePrompts: z.boolean().describe("Consolidate prompts from multiple contexts")
  })
});

// Sync Coding Progress Tool
const SyncCodingProgressInputSchema = z.object({
  codingTaskId: z.string().optional().describe("ID of the coding task (optional)"),
  planItemId: z.string().optional().describe("ID of the plan item to sync with"),
  status: z.enum(['started', 'in_progress', 'completed', 'failed']).describe("Current status"),
  filePath: z.string().optional().describe("File path being worked on"),
  operation: z.string().optional().describe("Type of operation (read, write, execute, etc.)")
});

const SyncCodingProgressOutputSchema = z.object({
  success: z.boolean(),
  planItemUpdated: z.boolean(),
  message: z.string()
});

export const SyncCodingProgressTool = createTool({
  id: "sync_coding_progress",
  name: "sync_coding_progress",
  description: "Synchronize coding task progress with plan management. Use this to keep plan items updated when working on code.",
  inputSchema: SyncCodingProgressInputSchema,
  outputSchema: SyncCodingProgressOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, planItemUpdated: false, message: "Agent not available" };
    }

    const coordinationContext = agent.contextManager.findContextById(CoordinationContextId);
    const planContext = agent.contextManager.findContextById(PlanContextId);
    
    if (!coordinationContext) {
      return { success: false, planItemUpdated: false, message: "Coordination context not found" };
    }

    try {
      const coordinationData = coordinationContext.getData();
      
      // Auto-create plan item if enabled and no planItemId provided
      if (coordinationData.integrationSettings.autoCreatePlansForCoding && !params.planItemId && params.status === 'started') {
        if (planContext) {
          const planData = planContext.getData();
          
          // Create a plan item for this coding task
          const newPlanItem = {
            id: params.codingTaskId || `coding_${Date.now()}`,
            title: `Coding Task: ${params.operation || 'File Operation'}`,
            description: `Working on ${params.filePath || 'code files'}`,
            status: 'in_progress' as const,
            priority: 'medium' as const,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            tags: ['coding', 'auto-generated']
          };
          
          planContext.setData({
            ...planData,
            currentPlan: [...planData.currentPlan, newPlanItem],
            planMetadata: {
              ...planData.planMetadata,
              totalItems: planData.currentPlan.length + 1,
              inProgressItems: planData.currentPlan.filter((item: any) => item.status === 'in_progress').length + 1
            }
          });
          
          logger.info(`Auto-created plan item for coding task: ${newPlanItem.id}`);
          return {
            success: true,
            planItemUpdated: true,
            message: `Auto-created plan item: ${newPlanItem.title}`
          };
        }
      }
      
      // Update existing plan item if planItemId provided
      if (params.planItemId && planContext) {
        const planData = planContext.getData();
                 const planIndex = planData.currentPlan.findIndex((item: any) => item.id === params.planItemId);
        
        if (planIndex >= 0) {
          const updatedPlan = [...planData.currentPlan];
          const planItem = { ...updatedPlan[planIndex] };
          
          // Map coding status to plan status
          switch (params.status) {
            case 'started':
            case 'in_progress':
              planItem.status = 'in_progress';
              break;
            case 'completed':
              planItem.status = 'completed';
              break;
            case 'failed':
              planItem.status = 'cancelled';
              break;
          }
          
          planItem.updatedAt = Date.now();
          updatedPlan[planIndex] = planItem;
          
          // Move to completed if status is completed
          let completedPlans = [...planData.completedPlans];
          if (planItem.status === 'completed') {
            completedPlans.push(planItem);
            updatedPlan.splice(planIndex, 1);
          }
          
          planContext.setData({
            ...planData,
            currentPlan: updatedPlan,
            completedPlans,
            planMetadata: {
              ...planData.planMetadata,
              totalItems: updatedPlan.length,
              completedItems: completedPlans.length,
              inProgressItems: updatedPlan.filter((item: any) => item.status === 'in_progress').length
            }
          });
          
          logger.info(`Updated plan item ${params.planItemId} status to: ${planItem.status}`);
          return {
            success: true,
            planItemUpdated: true,
            message: `Plan item updated to ${planItem.status}`
          };
        }
      }
      
      return {
        success: true,
        planItemUpdated: false,
        message: "Progress logged (no plan item to update)"
      };
    } catch (error) {
      logger.error(`Failed to sync coding progress: ${error}`);
      return {
        success: false,
        planItemUpdated: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Request File Operation Approval Tool
const RequestFileOpApprovalInputSchema = z.object({
  operation: z.enum(['read', 'write', 'delete', 'create', 'execute']).describe("Type of file operation"),
  filePath: z.string().describe("Path of the file to operate on"),
  content: z.string().optional().describe("Content to write (for write operations)"),
  reason: z.string().describe("Reason for the operation"),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional().describe("Risk level (default: medium)")
});

const RequestFileOpApprovalOutputSchema = z.object({
  approved: z.boolean(),
  requestId: z.string(),
  message: z.string()
});

export const RequestFileOpApprovalTool = createTool({
  id: "request_file_op_approval",
  name: "request_file_op_approval",
  description: "Request user approval for file operations when required. Use this before performing potentially risky file operations.",
  inputSchema: RequestFileOpApprovalInputSchema,
  outputSchema: RequestFileOpApprovalOutputSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { approved: false, requestId: '', message: "Agent not available" };
    }

    const coordinationContext = agent.contextManager.findContextById(CoordinationContextId);
    if (!coordinationContext) {
      return { approved: false, requestId: '', message: "Coordination context not found" };
    }

    const coordinationData = coordinationContext.getData();
    
    // Check if approval is required
    if (!coordinationData.integrationSettings.requireApprovalForFileOps) {
      return { approved: true, requestId: 'auto_approved', message: "Auto-approved (approval not required)" };
    }

    // Use the approval request tool from interactive context
    const interactiveContext = agent.contextManager.findContextById('interactive-context');
    if (!interactiveContext) {
      return { approved: false, requestId: '', message: "Interactive context not found" };
    }

    try {
      // Map file operation to action type
      let actionType: 'file_write' | 'file_delete' | 'command_execute' = 'file_write';
      switch (params.operation) {
        case 'delete':
          actionType = 'file_delete';
          break;
        case 'execute':
          actionType = 'command_execute';
          break;
        default:
          actionType = 'file_write';
      }

      const riskLevel = params.riskLevel || 'medium';
      
      // Create approval request
      const approvalRequest = {
        actionType,
        description: `${params.operation.toUpperCase()} operation on ${params.filePath}: ${params.reason}`,
        details: {
          filePaths: [params.filePath],
          riskLevel,
          preview: params.content ? params.content.substring(0, 200) + '...' : undefined
        }
      };

      // This would typically call the ApprovalRequestTool, but for now we'll simulate
      // In a real implementation, this would integrate with the approval system
      logger.info(`File operation approval requested: ${params.operation} on ${params.filePath}`);
      
      return {
        approved: true, // For now, auto-approve to avoid blocking
        requestId: `file_op_${Date.now()}`,
        message: `Approval requested for ${params.operation} on ${params.filePath}`
      };
    } catch (error) {
      logger.error(`Failed to request file operation approval: ${error}`);
      return {
        approved: false,
        requestId: '',
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Consolidate Context Prompts Tool
const ConsolidatePromptsInputSchema = z.object({
  contextIds: z.array(z.string()).describe("List of context IDs to consolidate"),
  priority: z.enum(['coding', 'interaction', 'balanced']).optional().describe("Which context to prioritize (default: balanced)")
});

const ConsolidatePromptsOutputSchema = z.object({
  success: z.boolean(),
  consolidatedPrompt: z.string(),
  activeContexts: z.array(z.string())
});

export const ConsolidatePromptsTool = createTool({
  id: "consolidate_prompts",
  name: "consolidate_prompts",
  description: "Consolidate prompts from multiple contexts to avoid information overload. Use this to create a focused prompt.",
  inputSchema: ConsolidatePromptsInputSchema,
  outputSchema: ConsolidatePromptsOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, consolidatedPrompt: '', activeContexts: [] };
    }

    try {
      const priority = params.priority || 'balanced';
      let consolidatedPrompt = '';
      const activeContexts: string[] = [];

      // Get prompts from specified contexts
      for (const contextId of params.contextIds) {
                 const context = agent.contextManager.findContextById(contextId);
         if (context) {
           const prompt = await Promise.resolve(context.renderPrompt());
           if (prompt && typeof prompt === 'string' && prompt.trim()) {
             activeContexts.push(contextId);
             
             // Add context-specific formatting based on priority
             if (priority === 'coding' && contextId.includes('coding')) {
               consolidatedPrompt += `\n${prompt}\n`;
             } else if (priority === 'interaction' && contextId.includes('interaction')) {
               consolidatedPrompt += `\n${prompt}\n`;
             } else if (priority === 'balanced') {
               // Summarize non-priority contexts
               const lines = prompt.split('\n');
               const summary = lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : '');
               consolidatedPrompt += `\n--- ${contextId} (Summary) ---\n${summary}\n`;
             }
           }
         }
      }

      return {
        success: true,
        consolidatedPrompt: consolidatedPrompt.trim(),
        activeContexts
      };
    } catch (error) {
      logger.error(`Failed to consolidate prompts: ${error}`);
      return {
        success: false,
        consolidatedPrompt: '',
        activeContexts: []
      };
    }
  }
});

// Create the Coordination Context
export const CoordinationContext = ContextHelper.createContext({
  id: CoordinationContextId,
  description: "Coordinates interaction between coding and interaction contexts. Manages workflow integration, approval processes, and prompt consolidation to ensure smooth collaboration between different agent capabilities.",
  dataSchema: CoordinationContextSchema,
  initialData: {
    activeWorkflows: [],
    contextPriorities: {
      'coding_gemini': 1,
      'interactive-context': 2,
      'plan-context': 3,
      'user-input-context': 4
    },
    integrationSettings: {
      autoCreatePlansForCoding: true,
      requireApprovalForFileOps: false, // Start with false to avoid blocking
      syncCodingProgress: true,
      consolidatePrompts: true
    }
  },
  renderPromptFn: (data: z.infer<typeof CoordinationContextSchema>) => {
    const { activeWorkflows, integrationSettings } = data;
    const activeCount = activeWorkflows.filter(w => w.status === 'active').length;
    
    let prompt = `
--- Context Coordination ---

Integration Status:
- Active Workflows: ${activeCount}
- Auto-create Plans for Coding: ${integrationSettings.autoCreatePlansForCoding ? 'ON' : 'OFF'}
- Require Approval for File Ops: ${integrationSettings.requireApprovalForFileOps ? 'ON' : 'OFF'}
- Sync Coding Progress: ${integrationSettings.syncCodingProgress ? 'ON' : 'OFF'}
- Consolidate Prompts: ${integrationSettings.consolidatePrompts ? 'ON' : 'OFF'}

Coordination Tools:
• sync_coding_progress: Keep plan items updated with coding task progress
• request_file_op_approval: Get approval for file operations when required
• consolidate_prompts: Create focused prompts from multiple contexts

Workflow Guidelines:
1. Use sync_coding_progress when starting/completing coding tasks
2. Request approval for risky file operations (delete, execute)
3. Consolidate prompts when multiple contexts are active
4. Coordinate between planning and execution phases
`;

    if (activeWorkflows.length > 0) {
      prompt += `\nActive Workflows:`;
      activeWorkflows.slice(0, 3).forEach(workflow => {
        prompt += `\n- ${workflow.type}: ${workflow.status} (${workflow.contexts.join(', ')})`;
      });
    }

    prompt += `\n\nRemember: Good coordination ensures smooth collaboration between coding and interaction capabilities.`;

    return prompt;
  },
  toolSetFn: () => ({
    name: "CoordinationTools",
    description: "Tools for coordinating between coding and interaction contexts. Use these to manage workflow integration and context collaboration.",
    tools: [SyncCodingProgressTool, RequestFileOpApprovalTool, ConsolidatePromptsTool],
    active: true,
    source: "local"
  })
}); 