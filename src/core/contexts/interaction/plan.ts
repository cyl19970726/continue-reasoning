import { createTool, ContextHelper } from "../../utils";
import { z } from "zod";
import { IAgent } from "../../interfaces";
import { logger } from "../../utils/logger";
import { v4 as uuidv4 } from 'uuid';

export const PlanContextId = "plan-context";

// Schema for plan steps
const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  toolsToCall: z.array(z.string()).optional().describe("Tools that will be called in this step"),
  createdAt: z.number(),
  updatedAt: z.number()
});

// Schema for the plan context data
const PlanContextSchema = z.object({
  planId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(['none', 'active', 'completed']).default('none'),
  steps: z.array(PlanStepSchema).default([]),
  currentStepIndex: z.number().default(0),
  createdAt: z.number().optional(),
  completedAt: z.number().optional()
});

// Plan Management Tool - handles all plan operations
const PlanManagementInputSchema = z.object({
  command: z.enum(['create', 'update_step', 'complete_step', 'complete_plan']).describe("Plan operation to perform"),
  
  // For create command
  title: z.string().optional().describe("Plan title (required for create)"),
  description: z.string().optional().describe("Plan description (required for create)"),
  steps: z.array(z.object({
    title: z.string(),
    description: z.string(),
    toolsToCall: z.array(z.string()).optional()
  })).optional().describe("Plan steps (required for create)"),
  
  // For update/complete step commands
  stepId: z.string().optional().describe("Step ID to update (required for update_step/complete_step)"),
  status: z.enum(['pending', 'in_progress', 'completed']).optional().describe("New step status (for update_step)")
});

const PlanManagementOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  planId: z.string().optional(),
  currentStep: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    toolsToCall: z.array(z.string()).optional()
  }).optional()
});

export const PlanManagementTool = createTool({
  id: "plan_management",
  name: "plan_management",
  description: "Manage the execution plan for complex tasks. Create plans, update step status, and track progress through the coding workflow.",
  inputSchema: PlanManagementInputSchema,
  outputSchema: PlanManagementOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    const context = agent.contextManager.findContextById(PlanContextId);
    if (!context) {
      return { success: false, message: "Plan context not found" };
    }

    const currentData = context.getData();
    const now = Date.now();

    try {
      switch (params.command) {
        case 'create': {
          if (!params.title || !params.description || !params.steps) {
            return { success: false, message: "Title, description, and steps are required for create command" };
          }

          const planId = uuidv4();
          const planSteps = params.steps.map((step, index) => ({
            id: uuidv4(),
            title: step.title,
            description: step.description,
            status: index === 0 ? 'pending' as const : 'pending' as const,
            toolsToCall: step.toolsToCall || [],
            createdAt: now,
            updatedAt: now
          }));

          const newPlan = {
            planId,
            title: params.title,
            description: params.description,
            status: 'active' as const,
            steps: planSteps,
            currentStepIndex: 0,
            createdAt: now
          };

          context.setData(newPlan);
          logger.info(`Created new plan: ${planId} - ${params.title}`);

          // 发布 plan_created 事件
          if (agent?.eventBus) {
            await agent.eventBus.publish({
              type: 'plan_created',
              source: 'agent',
              sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
              payload: {
                planId,
                title: params.title,
                description: params.description,
                totalSteps: planSteps.length,
                steps: planSteps.map(step => ({
                  id: step.id,
                  title: step.title,
                  description: step.description,
                  toolsToCall: step.toolsToCall
                }))
              }
            });
          }

          return {
            success: true,
            message: `Plan "${params.title}" created with ${planSteps.length} steps`,
            planId,
            currentStep: planSteps[0] ? {
              id: planSteps[0].id,
              title: planSteps[0].title,
              description: planSteps[0].description,
              toolsToCall: planSteps[0].toolsToCall
            } : undefined
          };
        }

        case 'update_step': {
          if (!params.stepId || !params.status) {
            return { success: false, message: "Step ID and status are required for update_step command" };
          }

          if (currentData.status !== 'active') {
            return { success: false, message: "No active plan to update" };
          }

          const stepIndex = currentData.steps.findIndex((step: z.infer<typeof PlanStepSchema>) => step.id === params.stepId);
          if (stepIndex === -1) {
            return { success: false, message: `Step with ID ${params.stepId} not found` };
          }

          const updatedSteps = [...currentData.steps];
          updatedSteps[stepIndex] = {
            ...updatedSteps[stepIndex],
            status: params.status,
            updatedAt: now
          };

          context.setData({
            ...currentData,
            steps: updatedSteps
          });

          logger.info(`Updated step ${params.stepId} status to: ${params.status}`);

          // 发布 plan_step_started 事件（如果状态变为 in_progress）
          if (params.status === 'in_progress' && agent?.eventBus) {
            await agent.eventBus.publish({
              type: 'plan_step_started',
              source: 'agent',
              sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
              payload: {
                planId: currentData.planId!,
                stepId: params.stepId,
                stepIndex,
                stepTitle: updatedSteps[stepIndex].title,
                stepDescription: updatedSteps[stepIndex].description,
                toolsToCall: updatedSteps[stepIndex].toolsToCall
              }
            });
          }

          // 发布 plan_progress_update 事件
          if (agent?.eventBus) {
            const completedSteps = updatedSteps.filter(step => step.status === 'completed').length;
            const progress = Math.round((completedSteps / updatedSteps.length) * 100);
            
            await agent.eventBus.publish({
              type: 'plan_progress_update',
              source: 'agent',
              sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
              payload: {
                planId: currentData.planId!,
                currentStepIndex: stepIndex,
                totalSteps: updatedSteps.length,
                completedSteps,
                progress,
                currentStepTitle: updatedSteps[stepIndex].title
              }
            });
          }

          return {
            success: true,
            message: `Step status updated to "${params.status}"`,
            currentStep: {
              id: updatedSteps[stepIndex].id,
              title: updatedSteps[stepIndex].title,
              description: updatedSteps[stepIndex].description,
              toolsToCall: updatedSteps[stepIndex].toolsToCall
            }
          };
        }

        case 'complete_step': {
          if (!params.stepId) {
            return { success: false, message: "Step ID is required for complete_step command" };
          }

          if (currentData.status !== 'active') {
            return { success: false, message: "No active plan to update" };
          }

          const stepIndex = currentData.steps.findIndex((step: z.infer<typeof PlanStepSchema>) => step.id === params.stepId);
          if (stepIndex === -1) {
            return { success: false, message: `Step with ID ${params.stepId} not found` };
          }

          const updatedSteps = [...currentData.steps];
          updatedSteps[stepIndex] = {
            ...updatedSteps[stepIndex],
            status: 'completed',
            updatedAt: now
          };

          // Move to next step if available
          const nextStepIndex = stepIndex + 1;
          let currentStepIndex = currentData.currentStepIndex;
          
          if (nextStepIndex < updatedSteps.length) {
            currentStepIndex = nextStepIndex;
            // Set next step to pending if it's not already in progress
            if (updatedSteps[nextStepIndex].status === 'pending') {
              updatedSteps[nextStepIndex] = {
                ...updatedSteps[nextStepIndex],
                status: 'pending',
                updatedAt: now
              };
            }
          }

          context.setData({
            ...currentData,
            steps: updatedSteps,
            currentStepIndex
          });

          logger.info(`Completed step ${params.stepId}`);

          const nextStep = nextStepIndex < updatedSteps.length ? updatedSteps[nextStepIndex] : null;

          // 发布 plan_step_completed 事件
          if (agent?.eventBus) {
            await agent.eventBus.publish({
              type: 'plan_step_completed',
              source: 'agent',
              sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
              payload: {
                planId: currentData.planId!,
                stepId: params.stepId,
                stepIndex,
                stepTitle: updatedSteps[stepIndex].title,
                completedAt: now,
                nextStepId: nextStep?.id,
                nextStepTitle: nextStep?.title
              }
            });
          }

          // 发布 plan_progress_update 事件
          if (agent?.eventBus) {
            const completedSteps = updatedSteps.filter(step => step.status === 'completed').length;
            const progress = Math.round((completedSteps / updatedSteps.length) * 100);
            
            await agent.eventBus.publish({
              type: 'plan_progress_update',
              source: 'agent',
              sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
              payload: {
                planId: currentData.planId!,
                currentStepIndex: nextStepIndex < updatedSteps.length ? nextStepIndex : stepIndex,
                totalSteps: updatedSteps.length,
                completedSteps,
                progress,
                currentStepTitle: nextStep?.title
              }
            });
          }

          return {
            success: true,
            message: nextStep ? 
              `Step completed. Next step: "${nextStep.title}"` : 
              "Step completed. All steps finished!",
            currentStep: nextStep ? {
              id: nextStep.id,
              title: nextStep.title,
              description: nextStep.description,
              toolsToCall: nextStep.toolsToCall
            } : undefined
          };
        }

        case 'complete_plan': {
          if (currentData.status !== 'active') {
            return { success: false, message: "No active plan to complete" };
          }

          context.setData({
            ...currentData,
            status: 'completed',
            completedAt: now
          });

          logger.info(`Completed plan: ${currentData.planId}`);

          // 发布 plan_completed 事件
          if (agent?.eventBus) {
            const executionTime = now - (currentData.createdAt || now);
            
            await agent.eventBus.publish({
              type: 'plan_completed',
              source: 'agent',
              sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
              payload: {
                planId: currentData.planId!,
                title: currentData.title!,
                totalSteps: currentData.steps.length,
                completedAt: now,
                executionTime
              }
            });
          }

          return {
            success: true,
            message: `Plan "${currentData.title}" completed successfully`
          };
        }

        default:
          return { success: false, message: `Unknown command: ${params.command}` };
      }
    } catch (error) {
      logger.error(`Plan management error: ${error}`);
      
      // 发布 plan_error 事件
      if (agent?.eventBus && currentData.planId) {
        await agent.eventBus.publish({
          type: 'plan_error',
          source: 'agent',
          sessionId: agent.eventBus.getActiveSessions()[0] || 'default',
          payload: {
            planId: currentData.planId,
            stepId: params.command === 'update_step' || params.command === 'complete_step' ? params.stepId : undefined,
            stepTitle: params.stepId ? currentData.steps.find((s: z.infer<typeof PlanStepSchema>) => s.id === params.stepId)?.title : undefined,
            error: error instanceof Error ? error.message : String(error),
            recoverable: true
          }
        });
      }
      
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// Agent Stop Tool
const AgentStopInputSchema = z.object({
  reason: z.string().describe("Reason for stopping the agent")
});

const AgentStopOutputSchema = z.object({
  success: z.boolean(),
  message: z.string()
});

export const AgentStopTool = createTool({
  id: "agent_stop",
  name: "agent_stop",
  description: "Stop the agent execution when all tasks are completed or when user interaction is needed.",
  inputSchema: AgentStopInputSchema,
  outputSchema: AgentStopOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    logger.info(`Agent stop requested: ${params.reason}`);
    
    // Signal the agent to stop
    if (agent.stop) {
      await agent.stop();
    }

    return {
      success: true,
      message: `Agent stopped: ${params.reason}`
    };
  }
});

// Create the Plan Context
export const PlanContext = ContextHelper.createContext({
  id: PlanContextId,
  description: "Manages execution planning for complex coding tasks. Follows the workflow: Accept Task → Generate Plan → Execute Plan → Update Progress → Complete Plan → Reply User → Agent Stop.",
  dataSchema: PlanContextSchema,
  initialData: {
    status: 'none',
    steps: [],
    currentStepIndex: 0
  },
  renderPromptFn: (data: z.infer<typeof PlanContextSchema>) => {
    let prompt = `
--- Coding Agent Plan Management ---

WORKFLOW: Accept Task → Generate Plan → Execute Plan → Update Progress → Complete Plan → Reply User → Agent Stop

Available Tools:
• plan_management: Create, update, and complete execution plans
• agent_stop: Stop agent when all tasks are completed

`;

    if (data.status === 'none') {
      prompt += `
Current Status: No active plan

For complex tasks, create a plan with these steps:
1. Analyze requirements
2. Create/modify files using coding tools
3. Test and validate changes
4. Update plan progress
5. Complete plan and reply to user

Use plan_management with command='create' to start.
`;
    } else if (data.status === 'active') {
      const currentStep = data.steps[data.currentStepIndex];
      const completedSteps = data.steps.filter(step => step.status === 'completed').length;
      
      prompt += `
Current Plan: "${data.title}"
Description: ${data.description}
Progress: ${completedSteps}/${data.steps.length} steps completed

CURRENT STEP (${data.currentStepIndex + 1}/${data.steps.length}):
Title: ${currentStep?.title || 'No current step'}
Description: ${currentStep?.description || ''}`;

      if (currentStep?.toolsToCall && currentStep.toolsToCall.length > 0) {
        prompt += `
Tools to call: ${currentStep.toolsToCall.join(', ')}`;
      }

      prompt += `

ALL STEPS:`;
      data.steps.forEach((step, index) => {
        const status = step.status === 'completed' ? '✅' : 
                      step.status === 'in_progress' ? '🔄' : '⏳';
        const current = index === data.currentStepIndex ? ' ← CURRENT' : '';
        prompt += `
${index + 1}. ${status} ${step.title}${current}`;
      });

      prompt += `

NEXT ACTIONS:
- Use plan_management with command='update_step' to mark current step as 'in_progress'
- Execute the required coding tools for this step
- Use plan_management with command='complete_step' when step is done
- Use plan_management with command='complete_plan' when all steps are finished
- Use agent_stop when plan is complete and user has been notified
`;
    } else if (data.status === 'completed') {
      prompt += `
Plan Status: COMPLETED ✅
Plan: "${data.title}"
All ${data.steps.length} steps completed.

Use agent_stop to finish execution.
`;
    }

    return prompt;
  },
  toolSetFn: () => ({
    name: "PlanTools",
    description: "Tools for managing execution plans and agent lifecycle in the coding workflow.",
    tools: [PlanManagementTool, AgentStopTool],
    active: true,
    source: "local"
  })
}); 