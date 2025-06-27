import { createTool, ContextHelper } from "@continue-reasoning/core";
import { BaseInteractiveLayer } from "@continue-reasoning/core";
import { IAgent, PromptCtx } from "@continue-reasoning/core";
import { logger } from "@continue-reasoning/core";
import { z } from "zod";
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

          // Plan created - eventBus removed for simplification
          logger.info(`Plan created: ${planId} with ${planSteps.length} steps`);

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

          // Step started - eventBus removed for simplification
          if (params.status === 'in_progress') {
            logger.info(`Plan step started: ${params.stepId} - ${updatedSteps[stepIndex].title}`);
          }

          // Plan progress - eventBus removed for simplification
          const completedSteps = updatedSteps.filter(step => step.status === 'completed').length;
          const progress = Math.round((completedSteps / updatedSteps.length) * 100);
          logger.info(`Plan progress: ${progress}% (${completedSteps}/${updatedSteps.length} completed)`);

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

          // Step completed - eventBus removed for simplification
          logger.info(`Plan step completed: ${params.stepId} - ${updatedSteps[stepIndex].title}`);

          // Plan progress - eventBus removed for simplification
          const completedSteps = updatedSteps.filter(step => step.status === 'completed').length;
          const progress = Math.round((completedSteps / updatedSteps.length) * 100);
          logger.info(`Plan progress: ${progress}% (${completedSteps}/${updatedSteps.length} completed)`);

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

          // Plan completed - eventBus removed for simplification
          const executionTime = now - (currentData.createdAt || now);
          logger.info(`Plan completed: ${currentData.title} (${executionTime}ms)`);

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
      
      // Plan error - eventBus removed for simplification
      logger.error(`Plan error in ${currentData.planId || 'unknown'}: ${error instanceof Error ? error.message : String(error)}`);
      
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
  description: "Manages execution planning for complex coding tasks.",
  dataSchema: PlanContextSchema,
  initialData: {
    status: 'none',
    steps: [],
    currentStepIndex: 0
  },
  promptCtx: {
    workflow: `
## PLANNING WORKFLOW

Accept Task → Generate Plan → Execute Plan → Update Progress → Complete Plan → Reply User → Agent Stop

### Core Planning Process:
1. **Task Analysis**: Break down complex requirements into manageable steps
2. **Plan Creation**: Use plan_management tool to create structured execution plan
3. **Step Execution**: Execute each step with appropriate tools and update progress
4. **Progress Tracking**: Monitor completion status and adjust as needed
5. **Plan Completion**: Mark plan as complete and notify user
6. **Agent Stop**: Terminate execution when all tasks are finished
`,
    status: `Plan Status: No active plan`,
    guideline: `
## PLANNING GUIDELINES

### When to Create Plans:
- Complex tasks requiring multiple steps
- Tasks involving file creation, modification, and testing
- Workflows that need dependency management
- Tasks requiring validation and error handling

### Plan Management Commands:
- **plan_management create**: Start new plan with title, description, and steps
- **plan_management update_step**: Mark step as 'in_progress'
- **plan_management complete_step**: Complete current step and move to next
- **plan_management complete_plan**: Mark entire plan as complete
- **agent_stop**: Terminate agent when all work is done

### Best Practices:
1. Create clear, specific step titles and descriptions
2. Include toolsToCall for each step when known
3. Update step status to 'in_progress' before starting work
4. Complete steps promptly after finishing work
5. Always use agent_stop after completing plans
`,
    examples: `
## PLANNING EXAMPLES

### Example 1: Simple File Creation Task
\`\`\`
plan_management({
  command: 'create',
  title: 'Create Calculator Module',
  description: 'Create a TypeScript calculator with tests',
  steps: [
    {
      title: 'Create Calculator Function',
      description: 'Implement add, subtract, multiply, divide functions',
      toolsToCall: ['ApplyWholeFileEditTool']
    },
    {
      title: 'Create Test File',
      description: 'Write comprehensive tests for all functions',
      toolsToCall: ['ApplyWholeFileEditTool']
    },
    {
      title: 'Run Tests',
      description: 'Execute tests and verify functionality',
      toolsToCall: ['bash_command']
    }
  ]
})
\`\`\`

### Example 2: Complex Refactoring Task
\`\`\`
plan_management({
  command: 'create',
  title: 'Refactor Authentication System',
  description: 'Update authentication to use JWT tokens',
  steps: [
    {
      title: 'Analyze Current Implementation',
      description: 'Review existing auth code and identify changes needed',
      toolsToCall: ['bash_command']
    },
    {
      title: 'Update Auth Models',
      description: 'Modify user models and add JWT support',
      toolsToCall: ['ApplyEditBlockTool', 'ApplyRangedEditTool']
    },
    {
      title: 'Update API Endpoints',
      description: 'Modify login/logout endpoints for JWT',
      toolsToCall: ['ApplyEditBlockTool']
    },
    {
      title: 'Update Tests',
      description: 'Modify existing tests for new auth flow',
      toolsToCall: ['ApplyEditBlockTool']
    },
    {
      title: 'Integration Testing',
      description: 'Run full test suite and verify functionality',
      toolsToCall: ['bash_command']
    }
  ]
})
\`\`\`
`
  },
  renderPromptFn: (data: z.infer<typeof PlanContextSchema>): PromptCtx => {
    let dynamicStatus = '';
    let dynamicWorkflow = `
## PLANNING WORKFLOW

Accept Task → Generate Plan → Execute Plan → Update Progress → Complete Plan → Reply User → Agent Stop

### Core Planning Process:
1. **Task Analysis**: Break down complex requirements into manageable steps
2. **Plan Creation**: Use plan_management tool to create structured execution plan
3. **Step Execution**: Execute each step with appropriate tools and update progress
4. **Progress Tracking**: Monitor completion status and adjust as needed
5. **Plan Completion**: Mark plan as complete and notify user
6. **Agent Stop**: Terminate execution when all tasks are finished
`;

    if (data.status === 'none') {
      dynamicStatus = `Plan Status: No active plan

For complex tasks, create a plan with these steps:
1. Analyze requirements
2. Create/modify files using coding tools
3. Test and validate changes
4. Update plan progress
5. Complete plan and reply to user

Use plan_management with command='create' to start.`;
    } else if (data.status === 'active') {
      const currentStep = data.steps[data.currentStepIndex];
      const completedSteps = data.steps.filter(step => step.status === 'completed').length;
      
      dynamicStatus = `Plan Status: ACTIVE 🔄
Current Plan: "${data.title}"
Description: ${data.description}
Progress: ${completedSteps}/${data.steps.length} steps completed

CURRENT STEP (${data.currentStepIndex + 1}/${data.steps.length}):
Title: ${currentStep?.title || 'No current step'}
Description: ${currentStep?.description || ''}`;

      if (currentStep?.toolsToCall && currentStep.toolsToCall.length > 0) {
        dynamicStatus += `
Tools to call: ${currentStep.toolsToCall.join(', ')}`;
      }

      dynamicStatus += `

ALL STEPS:`;
      data.steps.forEach((step, index) => {
        const status = step.status === 'completed' ? '✅' : 
                      step.status === 'in_progress' ? '🔄' : '⏳';
        const current = index === data.currentStepIndex ? ' ← CURRENT' : '';
        dynamicStatus += `
${index + 1}. ${status} ${step.title}${current}`;
      });

      dynamicStatus += `

Next Actions:
- Use plan_management with command='update_step' to mark current step as 'in_progress'
- Execute the required coding tools for this step
- Use plan_management with command='complete_step' when step is done
- Use plan_management with command='complete_plan' when all steps are finished
- Use agent_stop when plan is complete and user has been notified`;
    } else if (data.status === 'completed') {
      dynamicStatus = `Plan Status: COMPLETED ✅
Plan: "${data.title}"
All ${data.steps.length} steps completed.

Use agent_stop to finish execution.`;
    }

    return {
      workflow: dynamicWorkflow,
      status: dynamicStatus,
      guideline: `
## PLANNING GUIDELINES

### When to Create Plans:
- Complex tasks requiring multiple steps
- Tasks involving file creation, modification, and testing
- Workflows that need dependency management
- Tasks requiring validation and error handling

### Plan Management Commands:
- **plan_management create**: Start new plan with title, description, and steps
- **plan_management update_step**: Mark step as 'in_progress'
- **plan_management complete_step**: Complete current step and move to next
- **plan_management complete_plan**: Mark entire plan as complete
- **agent_stop**: Terminate agent when all work is done

### Best Practices:
1. Create clear, specific step titles and descriptions
2. Include toolsToCall for each step when known
3. Update step status to 'in_progress' before starting work
4. Complete steps promptly after finishing work
5. Always use agent_stop after completing plans
`,
      examples: `
## PLANNING EXAMPLES

### Example 1: Simple File Creation Task
\`\`\`
plan_management({
  command: 'create',
  title: 'Create Calculator Module',
  description: 'Create a TypeScript calculator with tests',
  steps: [
    {
      title: 'Create Calculator Function',
      description: 'Implement add, subtract, multiply, divide functions',
      toolsToCall: ['ApplyWholeFileEditTool']
    },
    {
      title: 'Create Test File',
      description: 'Write comprehensive tests for all functions',
      toolsToCall: ['ApplyWholeFileEditTool']
    },
    {
      title: 'Run Tests',
      description: 'Execute tests and verify functionality',
      toolsToCall: ['bash_command']
    }
  ]
})
\`\`\`

### Example 2: Complex Refactoring Task
\`\`\`
plan_management({
  command: 'create',
  title: 'Refactor Authentication System',
  description: 'Update authentication to use JWT tokens',
  steps: [
    {
      title: 'Analyze Current Implementation',
      description: 'Review existing auth code and identify changes needed',
      toolsToCall: ['bash_command']
    },
    {
      title: 'Update Auth Models',
      description: 'Modify user models and add JWT support',
      toolsToCall: ['ApplyEditBlockTool', 'ApplyRangedEditTool']
    },
    {
      title: 'Update API Endpoints',
      description: 'Modify login/logout endpoints for JWT',
      toolsToCall: ['ApplyEditBlockTool']
    },
    {
      title: 'Update Tests',
      description: 'Modify existing tests for new auth flow',
      toolsToCall: ['ApplyEditBlockTool']
    },
    {
      title: 'Integration Testing',
      description: 'Run full test suite and verify functionality',
      toolsToCall: ['bash_command']
    }
  ]
})
\`\`\`
`
    };
  },
  toolSetFn: () => ({
    name: "PlanTools",
    description: "Tools for managing execution plans and agent lifecycle in the coding workflow.",
    tools: [PlanManagementTool, AgentStopTool],
    active: true,
    source: "local"
  })
}); 