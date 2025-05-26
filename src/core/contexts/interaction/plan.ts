import { createTool, ContextHelper } from "../../utils";
import { z } from "zod";
import { IAgent } from "../../interfaces";
import { logger } from "../../utils/logger";
import { v4 as uuidv4 } from 'uuid';

export const PlanContextId = "plan-context";

// Schema for plan items
const PlanItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  createdAt: z.number(),
  updatedAt: z.number(),
  estimatedDuration: z.number().optional().describe("Estimated duration in minutes"),
  actualDuration: z.number().optional().describe("Actual duration in minutes"),
  dependencies: z.array(z.string()).optional().describe("IDs of dependent plan items"),
  tags: z.array(z.string()).optional().describe("Tags for categorization")
});

// Schema for the plan context data
const PlanContextSchema = z.object({
  currentPlan: z.array(PlanItemSchema).describe("Current active plan items"),
  completedPlans: z.array(PlanItemSchema).describe("Completed plan items history"),
  planMetadata: z.object({
    totalItems: z.number(),
    completedItems: z.number(),
    inProgressItems: z.number(),
    estimatedTotalDuration: z.number().optional(),
    actualTotalDuration: z.number().optional(),
    startTime: z.number().optional(),
    endTime: z.number().optional()
  })
});

// Create Plan Tool
const CreatePlanInputSchema = z.object({
  title: z.string().describe("Title of the plan item"),
  description: z.string().describe("Detailed description of what needs to be done"),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional().describe("Priority level (default: medium)"),
  estimatedDuration: z.number().optional().describe("Estimated duration in minutes"),
  dependencies: z.array(z.string()).optional().describe("IDs of plan items this depends on"),
  tags: z.array(z.string()).optional().describe("Tags for categorization")
});

const CreatePlanOutputSchema = z.object({
  success: z.boolean(),
  planId: z.string().optional(),
  message: z.string().optional()
});

export const CreatePlanTool = createTool({
  id: "create_plan",
  name: "create_plan",
  description: "Create a new plan item to organize and track tasks. Use this to break down complex work into manageable steps.",
  inputSchema: CreatePlanInputSchema,
  outputSchema: CreatePlanOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    const context = agent.contextManager.findContextById(PlanContextId);
    if (!context) {
      return { success: false, message: "Plan context not found" };
    }

    try {
      const planId = uuidv4();
      const now = Date.now();
      
      // Handle default values
      const priority = params.priority || "medium";
      
      const newPlanItem = {
        id: planId,
        title: params.title,
        description: params.description,
        status: 'pending' as const,
        priority,
        createdAt: now,
        updatedAt: now,
        estimatedDuration: params.estimatedDuration,
        dependencies: params.dependencies || [],
        tags: params.tags || []
      };

      const currentData = context.getData();
      const updatedPlan = [...currentData.currentPlan, newPlanItem];
      
      context.setData({
        ...currentData,
        currentPlan: updatedPlan,
        planMetadata: {
          ...currentData.planMetadata,
          totalItems: updatedPlan.length,
          estimatedTotalDuration: updatedPlan.reduce((sum, item: z.infer<typeof PlanItemSchema>) => 
            sum + (item.estimatedDuration || 0), 0)
        }
      });

      logger.info(`Created new plan item: ${planId} - ${params.title}`);
      
      return {
        success: true,
        planId,
        message: `Plan item "${params.title}" created successfully`
      };
    } catch (error) {
      logger.error(`Failed to create plan item: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Update Plan Status Tool
const UpdatePlanStatusInputSchema = z.object({
  planId: z.string().describe("ID of the plan item to update"),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).describe("New status"),
  actualDuration: z.number().optional().describe("Actual duration in minutes (for completed items)")
});

const UpdatePlanStatusOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional()
});

export const UpdatePlanStatusTool = createTool({
  id: "update_plan_status",
  name: "update_plan_status", 
  description: "Update the status of an existing plan item. Use this to track progress and mark items as completed.",
  inputSchema: UpdatePlanStatusInputSchema,
  outputSchema: UpdatePlanStatusOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    const context = agent.contextManager.findContextById(PlanContextId);
    if (!context) {
      return { success: false, message: "Plan context not found" };
    }

    try {
      const currentData = context.getData();
      const planIndex = currentData.currentPlan.findIndex((item: any) => item.id === params.planId);
      
      if (planIndex === -1) {
        return { success: false, message: `Plan item with ID ${params.planId} not found` };
      }

      const updatedPlan = [...currentData.currentPlan];
      const planItem = { ...updatedPlan[planIndex] };
      
      planItem.status = params.status;
      planItem.updatedAt = Date.now();
      
      if (params.actualDuration !== undefined) {
        planItem.actualDuration = params.actualDuration;
      }
      
      updatedPlan[planIndex] = planItem;

      // If completed, move to completed plans
      let completedPlans = [...currentData.completedPlans];
      if (params.status === 'completed') {
        completedPlans.push(planItem);
        updatedPlan.splice(planIndex, 1);
      }

      // Update metadata
      const inProgressItems = updatedPlan.filter(item => item.status === 'in_progress').length;
      const completedItems = completedPlans.length;
      
      context.setData({
        ...currentData,
        currentPlan: updatedPlan,
        completedPlans,
        planMetadata: {
          ...currentData.planMetadata,
          totalItems: updatedPlan.length,
          completedItems,
          inProgressItems,
          actualTotalDuration: completedPlans.reduce((sum, item: z.infer<typeof PlanItemSchema>) => 
            sum + (item.actualDuration || 0), 0)
        }
      });

      logger.info(`Updated plan item ${params.planId} status to: ${params.status}`);
      
      return {
        success: true,
        message: `Plan item status updated to "${params.status}"`
      };
    } catch (error) {
      logger.error(`Failed to update plan status: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// List Plans Tool
const ListPlansInputSchema = z.object({
  includeCompleted: z.boolean().optional().describe("Whether to include completed plans (default: false)")
});

const ListPlansOutputSchema = z.object({
  currentPlan: z.array(PlanItemSchema),
  completedPlans: z.array(PlanItemSchema).optional(),
  metadata: z.object({
    totalItems: z.number(),
    completedItems: z.number(),
    inProgressItems: z.number(),
    pendingItems: z.number()
  })
});

export const ListPlansTool = createTool({
  id: "list_plans",
  name: "list_plans",
  description: "List current plan items and optionally completed ones. Use this to review progress and plan status.",
  inputSchema: ListPlansInputSchema,
  outputSchema: ListPlansOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { 
        currentPlan: [], 
        metadata: { totalItems: 0, completedItems: 0, inProgressItems: 0, pendingItems: 0 }
      };
    }

    const context = agent.contextManager.findContextById(PlanContextId);
    if (!context) {
      return { 
        currentPlan: [], 
        metadata: { totalItems: 0, completedItems: 0, inProgressItems: 0, pendingItems: 0 }
      };
    }

    const data = context.getData();
    const includeCompleted = params.includeCompleted || false;
    
    const pendingItems = data.currentPlan.filter((item: any) => item.status === 'pending').length;
    const inProgressItems = data.currentPlan.filter((item: any) => item.status === 'in_progress').length;
    
    const result: any = {
      currentPlan: data.currentPlan,
      metadata: {
        totalItems: data.currentPlan.length,
        completedItems: data.completedPlans.length,
        inProgressItems,
        pendingItems
      }
    };
    
    if (includeCompleted) {
      result.completedPlans = data.completedPlans;
    }
    
    return result;
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

// Create the Plan Context
export const PlanContext = ContextHelper.createContext({
  id: PlanContextId,
  description: "Manages planning and task organization for the agent. Tracks plan items, their status, dependencies, and provides tools for creating, updating, and monitoring progress. Also includes agent lifecycle management.",
  dataSchema: PlanContextSchema,
  initialData: {
    currentPlan: [],
    completedPlans: [],
    planMetadata: {
      totalItems: 0,
      completedItems: 0,
      inProgressItems: 0
    }
  },
  renderPromptFn: (data: z.infer<typeof PlanContextSchema>) => {
    const { currentPlan, completedPlans, planMetadata } = data;
    const pendingItems = currentPlan.filter(item => item.status === 'pending');
    const inProgressItems = currentPlan.filter(item => item.status === 'in_progress');
    
    let prompt = `
--- Plan Management Context ---

Planning Tools:
• create_plan: Create new plan items to organize tasks
• update_plan_status: Update status of existing plan items
• list_plans: View current and completed plan items
• agent_stop: Stop the agent when tasks are completed

Current Plan Status:
- Total Active Items: ${currentPlan.length}
- Pending: ${pendingItems.length}
- In Progress: ${inProgressItems.length}
- Completed: ${completedPlans.length}`;

    if (planMetadata.estimatedTotalDuration) {
      prompt += `\n- Estimated Total Duration: ${planMetadata.estimatedTotalDuration} minutes`;
    }
    
    if (planMetadata.actualTotalDuration) {
      prompt += `\n- Actual Duration (Completed): ${planMetadata.actualTotalDuration} minutes`;
    }

    if (pendingItems.length > 0) {
      prompt += `\n\nPENDING ITEMS:`;
             pendingItems.slice(0, 5).forEach((item: z.infer<typeof PlanItemSchema>) => {
         prompt += `\n- [${item.priority.toUpperCase()}] ${item.title} (${item.id})`;
         if (item.estimatedDuration) {
           prompt += ` - Est: ${item.estimatedDuration}min`;
         }
       });
      if (pendingItems.length > 5) {
        prompt += `\n... and ${pendingItems.length - 5} more pending items`;
      }
    }

    if (inProgressItems.length > 0) {
      prompt += `\n\nIN PROGRESS:`;
      inProgressItems.forEach(item => {
        prompt += `\n- [${item.priority.toUpperCase()}] ${item.title} (${item.id})`;
      });
    }

    if (completedPlans.length > 0) {
      const recentCompleted = completedPlans.slice(-3);
      prompt += `\n\nRECENT COMPLETIONS:`;
      recentCompleted.forEach(item => {
        prompt += `\n- ✅ ${item.title}`;
        if (item.actualDuration) {
          prompt += ` - ${item.actualDuration}min`;
        }
      });
    }

    prompt += `\n\nPlanning Guidelines:
1. Break down complex tasks into smaller, manageable plan items
2. Set realistic priorities and time estimates
3. Update status as you progress through tasks
4. Use dependencies to manage task order
5. Use agent_stop when all planned work is complete
6. Tag items for better organization and tracking

Remember: Good planning leads to better execution and clearer progress tracking.
    `;

    return prompt;
  },
  toolSetFn: () => ({
    name: "PlanTools",
    description: "Tools for planning, task management, and agent lifecycle control. Use these tools to organize work, track progress, and manage agent execution.",
    tools: [CreatePlanTool, UpdatePlanStatusTool, ListPlansTool, AgentStopTool],
    active: true,
    source: "local"
  })
}); 