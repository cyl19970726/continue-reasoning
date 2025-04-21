import { z } from "zod";
import { ContextHelper, createTool } from "../utils";
import { randomUUID } from "crypto";
import { IAgent } from "../interfaces";
export const StepSchema = z.object({
    id: z.number().describe("Sequential identifier for the step within the plan, typically assigned based on order during creation and beginning at 0."),
    task: z.string().describe("A description of the specific action or goal to be achieved in this step."),
    process: z.string().describe("A detailed description of the workflow executed for this step, including encountered problems and how they were addressed."),
    result: z.string().describe("The outcome or final result produced by executing this step."),
});


export const PlanInfoSchema = z.object({ 
    id: z.string().describe("Unique identifier for the plan this info relates to."),
    memoryId: z.string().describe("The key used to store/retrieve this plan's full details from memory, if applicable."),
    description: z.string().describe("A concise summary or description of the overall plan."),
    status: z.enum(["pending", "resolved", "rejected"]).describe("The current high-level status of the plan."),
    result: z.string().describe("The final result of the plan."),
});

export const PlanDataSchema = PlanInfoSchema.extend({
    steps: z.array(StepSchema).describe("The list of sequential or parallel steps required to complete the plan."),
    pendingSteps: z.array(z.number()).describe("The IDs of the steps currently being executed or actively waiting for asynchronous results."),
    maxPendingSteps: z.number().describe("The maximum number of steps that can be pending at any given time."),
    resolvedSteps: z.array(z.number()).describe("The IDs of the steps that have been completed."),
    rejectedSteps: z.array(z.number()).describe("The IDs of the steps that have been rejected."),
});

export const PlanContextSchema = PlanDataSchema;
export type PlanContextSchemaType = z.infer<typeof PlanContextSchema>;
export const PLAN_CONTEXT_ID = "plan-context";

export const PlanContext = ContextHelper.createContext({
    id: PLAN_CONTEXT_ID,
    description: "The context for the plan",
    dataSchema: PlanContextSchema,
    initialData: {
        id: "",
        memoryId: "",
        description: "No plan initialized",
        status: "pending",
        result: "Plan is not yet resolved.",
        steps: [],
        maxPendingSteps: 5,
        pendingSteps: [],
        resolvedSteps: [],
        rejectedSteps: [],
    },
    toolListFn: () => [
        CreatePlanTool, 
        ResolveOrRejectPlanTool,
        PendingStepTool,
        UpdatePendingStepProcessTool,
        UpdatePendingStepResultTool,
        ResolvedStepTool,
        RejectedStepTool,
        LoadStepTool,
        UpdatePlanInfoTool,
    ],
    renderPromptFn: (data: PlanContextSchemaType) => {
        // Helper function to get steps by status
        const getWaitingSteps = () => {
            const processedStepIds = new Set([...data.pendingSteps, ...data.resolvedSteps, ...data.rejectedSteps]);
            return data.steps.filter(step => !processedStepIds.has(step.id));
        };

        const waitingSteps = getWaitingSteps();

        // Format step lists concisely
        const formatStep = (stepId: number) => `  - Step ${stepId}: ${data.steps[stepId]?.task || 'N/A'}`;
        const formatStepWithResult = (stepId: number) => `  - Step ${stepId}: ${data.steps[stepId]?.result || 'N/A'}`;

        const pendingStepsList = data.pendingSteps.length > 0
            ? data.pendingSteps.map(formatStep).join('\\n')
            : "  - None";
        const resolvedStepsList = data.resolvedSteps.length > 0
            ? data.resolvedSteps.map(formatStepWithResult).join('\\n')
            : "  - None";
        const rejectedStepsList = data.rejectedSteps.length > 0
            ? data.rejectedSteps.map(formatStepWithResult).join('\\n')
            : "  - None";
        const waitingStepsList = waitingSteps.length > 0
            ? waitingSteps.map(step => `  - Step ${step.id}: ${step.task}`).join('\\n')
            : "  - None";


        return `
--- Plan Context (ID: ${data.id}) ---
Goal: ${data.description}
Status: ${data.status}
Overall Result: ${data.result || 'Plan is not yet resolved.'}

--- Plan Steps ---
Max Concurrent Steps: ${data.maxPendingSteps}

Pending Steps (${data.pendingSteps.length}):
${pendingStepsList}

Waiting Steps (${waitingSteps.length}):
${waitingStepsList}

Resolved Steps (${data.resolvedSteps.length}):
${resolvedStepsList}

Rejected Steps (${data.rejectedSteps.length}):
${rejectedStepsList}

--- Instructions & Focus ---
Note: This Plan Context is intended for resolving complex tasks. Avoid using it for simple, single-step actions.
Focus on the Pending and Waiting steps. You need to progress the plan towards resolution.
- Max ${data.maxPendingSteps} steps can be pending concurrently.
- Current Pending Step IDs: [${data.pendingSteps.join(', ')}]
- Analyze Pending Steps: Monitor their progress. If a step requires interaction or has issues, address them using the 'Update Pending Step' tool.
- Analyze Waiting Steps: Check if their dependencies (previous steps) are met. If yes, initiate them using the 'Pending Step' tool (up to the concurrency limit).
- Update Step Status: Once a pending step completes, mark it as 'Resolved' or 'Rejected' using the appropriate tool ('Resolved Step' / 'Rejected Step'). This may unblock waiting steps.
- Resolving the Plan: Once all steps are resolved or rejected, finalize the plan using the 'Resolve or Reject Plan' tool with the overall result.
- Tool Usage: Remember to use the specific plan/step management tools provided. You can load detailed step info using 'Load Step' if needed.
    `;
    },
});

// Plan Related Tools
export const CREATE_PLAN_ID = "create_plan";
export const UPDATE_PLAN_INFO_ID = "update_plan_info";
export const LOAD_PLAN_ID = "load_plan";

export const RESOLVE_OR_REJECT_PLAN_ID = "resolve_or_reject_plan";

export const PENDING_STEP_ID = "pending_step";
export const UPDATE_PENDING_STEP_PROCESS_ID = "update_pending_step_process";
export const UPDATE_PENDING_STEP_RESULT_ID = "update_pending_step_result";
export const RESOLVED_STEP_ID = "resolved_step";
export const REJECTED_STEP_ID = "rejected_step";
export const LOAD_STEP_ID = "load_step";

// Explicitly define the input schema for CreatePlanTool
const CreatePlanInputSchema = z.object({
    description: z.string().describe("A concise summary or description of the overall plan."),
    steps: z.array(StepSchema).describe("The list of sequential or parallel steps required to complete the plan."),
});

export const CreatePlanTool = createTool({
    id: CREATE_PLAN_ID,
    name: CREATE_PLAN_ID,
    description: `Create a new plan for a complex task.
    Note: Create Plan is intended for resolving complex tasks. Avoid using it for simple, single-step actions.
    `,
    inputSchema: CreatePlanInputSchema,
    outputSchema: PlanContextSchema,
    async: false,
    execute: async (params: z.infer<typeof CreatePlanInputSchema>, agent?: IAgent): Promise<z.infer<typeof PlanContextSchema>> => {
        const context = ContextHelper.findContext<typeof PlanContextSchema>(agent!, PLAN_CONTEXT_ID);
        if (!context) {
             throw new Error(`Context ${PLAN_CONTEXT_ID} not found.`);
        }

        const updatePayload: Partial<z.infer<typeof PlanContextSchema>> = {
            id: randomUUID(),
            description: params.description,
            steps: params.steps.map(s => ({...s, status: 'waiting', process: '', result: ''})),
            status: "pending",
            result: "the plan is pending so the result is empty",
            pendingSteps: [],
            maxPendingSteps: 5,
            resolvedSteps: [],
            rejectedSteps: [],
            memoryId: randomUUID(),
        };

        ContextHelper.updateContextData(context, updatePayload);

        return context.getData();
    },
});

const UpdatePlanInfoInputSchema = PlanInfoSchema.pick({
    id: true,
    description: true,
    result: true,
});

export const UpdatePlanInfoTool = createTool({
    id: UPDATE_PLAN_INFO_ID,
    name: UPDATE_PLAN_INFO_ID,
    description: "Update the description or result of a plan",
    inputSchema: UpdatePlanInfoInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the plan info was updated successfully."),
        error: z.string().optional().describe("The error message if the plan info was not updated successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof UpdatePlanInfoInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext<typeof PlanContextSchema>(agent!, PLAN_CONTEXT_ID);
        if (!context) {
             return {
                success: false,
                error: `Context ${PLAN_CONTEXT_ID} not found.`,
            };
        }

        if (params.id !== context.data.id) {
            return {
                success: false,
                error: `Plan ID mismatch. Expected ${params.id}, got ${context.data.id}`,
            };
        }

        context.data.description = params.description;
        context.data.result = params.result;

        ContextHelper.updateContextData(context, context.data);
        return {
            success: true,
        };
    },
});


const ResolvePlanInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to resolve."),
    status: z.enum(["resolved", "rejected"]).describe("The status of the plan."),
    result: z.string().describe("The final result of the plan."),
});


export const ResolveOrRejectPlanTool = createTool({
    id: RESOLVE_OR_REJECT_PLAN_ID,
    name: RESOLVE_OR_REJECT_PLAN_ID,
    description: "Resolve or Reject a plan",
    inputSchema: ResolvePlanInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the plan was resolved successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof ResolvePlanInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);
        planData.status = params.status;
        planData.result = params.result;
        ContextHelper.updateContextData(context, planData);
        return {
            success: true,
        };
    },
});



const PendingStepInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to update."),
    stepId: z.number().describe("The ID of the step to update."),
});

export const PendingStepTool = createTool({
    id: PENDING_STEP_ID,
    name: PENDING_STEP_ID,
    description: "Pending a step",
    inputSchema: PendingStepInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the step was pending successfully."),
        error: z.string().optional().describe("The error message if the step was not pending successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof PendingStepInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);
        if (planData.pendingSteps.length >= planData.maxPendingSteps) {
            return {
                success: false,
                error: "Max pending steps reached",
            };
        }
        planData.pendingSteps.push(params.stepId);
        ContextHelper.updateContextData(context, planData);
        return {
            success: true,
        };
    },
});

const UpdatePendingStepProcessInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to update."),
    stepId: z.number().describe("The ID of the step to update."),
    process: z.string().describe("The process of the step."),
});

export const UpdatePendingStepProcessTool = createTool({
    id: UPDATE_PENDING_STEP_PROCESS_ID,
    name: UPDATE_PENDING_STEP_PROCESS_ID,
    description: "Update a pending step",
    inputSchema: UpdatePendingStepProcessInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the step was updated successfully."),
        error: z.string().optional().describe("The error message if the step was not updated successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof UpdatePendingStepProcessInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);
        if (!planData.pendingSteps.includes(params.stepId)) {
            return {
                success: false,
                error: `Step ${params.stepId} is not pending`,
            };
        }
        if (params.process) {
            // we need to find the step using compare with the id 
            const step = planData.steps.find((step: z.infer<typeof StepSchema>) => step.id === params.stepId);
            if (!step) {
                return {
                    success: false,
                    error: `Step ${params.stepId} not found`,
                };
            }
            step.process = params.process;
        }
        ContextHelper.updateContextData(context, planData);
        return {
            success: true,
        };
    },
});


const UpdatePendingStepResultInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to update."),
    stepId: z.number().describe("The ID of the step to update."),
    result: z.string().describe("The result of the step."),
});

export const UpdatePendingStepResultTool = createTool({
    id: UPDATE_PENDING_STEP_RESULT_ID,
    name: UPDATE_PENDING_STEP_RESULT_ID,
    description: "Update a pending step",
    inputSchema: UpdatePendingStepResultInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the step was updated successfully."),
        error: z.string().optional().describe("The error message if the step was not updated successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof UpdatePendingStepResultInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);
        if (!planData.pendingSteps.includes(params.stepId)) {
            return {
                success: false,
                error: `Step ${params.stepId} is not pending`,
            };
        }

        const step = planData.steps.find((step: z.infer<typeof StepSchema>) => step.id === params.stepId);
        if (!step) {
            return {
                success: false,
                error: `Step ${params.stepId} not found`,
            };
        }
        step.result = params.result;
        ContextHelper.updateContextData(context, planData);
        return {
            success: true,
        };
    },
});


const ResolvedStepInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to update."),
    stepId: z.number().describe("The ID of the step to update."),
});

export const ResolvedStepTool = createTool({
    id: RESOLVED_STEP_ID,
    name: RESOLVED_STEP_ID,
    description: "Resolved a step",
    inputSchema: ResolvedStepInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the step was resolved successfully."),
        error: z.string().optional().describe("The error message if the step was not resolved successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof ResolvedStepInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);

        if (!planData.pendingSteps.includes(params.stepId)) {
            return {
                success: false,
                error: `Step ${params.stepId} is not pending`,
            };
        }
        planData.resolvedSteps.push(params.stepId);
        ContextHelper.updateContextData(context, planData);
        return {
            success: true,
        };
    },
});


const RejectedStepInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to update."),
    stepId: z.number().describe("The ID of the step to update."),
});

export const RejectedStepTool = createTool({
    id: REJECTED_STEP_ID,
    name: REJECTED_STEP_ID,
    description: "Rejected a step",
    inputSchema: RejectedStepInputSchema,
    outputSchema: z.object({
        success: z.boolean().describe("Whether the step was rejected successfully."),
        error: z.string().optional().describe("The error message if the step was not rejected successfully."),
    }),
    async: false,
    execute: async (params: z.infer<typeof RejectedStepInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);
        if (!planData.pendingSteps.includes(params.stepId)) {
            return {
                success: false,
                error: `Step ${params.stepId} is not pending`,
            };
        }
        planData.rejectedSteps.push(params.stepId);
        ContextHelper.updateContextData(context, planData);
        return {
            success: true,
        };
    },
});


const LoadStepToolInputSchema = z.object({
    planId: z.string().describe("The ID of the plan to load."),
    stepId: z.number().describe("The ID of the step to load."),
});


export const LoadStepTool = createTool({
    id: LOAD_STEP_ID,
    name: LOAD_STEP_ID,
    description: "Load a step",
    inputSchema: LoadStepToolInputSchema,
    outputSchema: StepSchema,
    async: false,
    execute: async (params: z.infer<typeof LoadStepToolInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, PLAN_CONTEXT_ID);
        let planData = context.dataSchema.parse(context.data);
        const step = planData.steps.find((step: z.infer<typeof StepSchema>) => step.id === params.stepId);
        if (!step) {
            return {
                success: false,
                error: `Step ${params.stepId} not found`,
            };
        }
        return step;
    },
});