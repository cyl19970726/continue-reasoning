import { z } from "zod";
import { IAgent, IContext, ITool } from "../interfaces/index.js";
import { createTool } from "../utils/index.js";

// 计划步骤的数据结构
const PlanStepSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    dependencies: z.array(z.string()).default([]),
    estimatedTime: z.number().optional(),
    actualTime: z.number().optional(),
    createdAt: z.number(),
    updatedAt: z.number().optional(),
    completedAt: z.number().optional(),
    notes: z.string().optional()
});

// 计划的数据结构
const PlanSchema = z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['draft', 'active', 'completed', 'cancelled']).default('draft'),
    steps: z.array(PlanStepSchema).default([]),
    createdAt: z.number(),
    updatedAt: z.number().optional(),
    completedAt: z.number().optional(),
    tags: z.array(z.string()).default([])
});

// Context 数据 schema
const PlanDataSchema = z.object({
    currentPlan: PlanSchema.optional(),
    planHistory: z.array(PlanSchema).default([]),
    activeStepId: z.string().optional()
});

// 创建计划工具
const CreatePlanInputSchema = z.object({
    title: z.string().describe("Plan title"),
    description: z.string().describe("Plan description"),
    steps: z.array(z.object({
        title: z.string(),
        description: z.string(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional()
    })).describe("Initial plan steps")
});

export const CreatePlanTool = createTool({
    id: "create_plan",
    name: "Create_Plan",
    description: "Create a new plan with steps",
    inputSchema: CreatePlanInputSchema,
    async: false,
    execute: (params: z.infer<typeof CreatePlanInputSchema>, agent?: IAgent) => {
        const now = Date.now();
        const planId = `plan_${now}`;
        
        const steps = params.steps.map((step, index) => ({
            id: `step_${planId}_${index}`,
            title: step.title,
            description: step.description,
            status: 'pending' as const,
            priority: step.priority || 'medium' as const,
            dependencies: [],
            createdAt: now
        }));

        const plan = {
            id: planId,
            title: params.title,
            description: params.description,
            status: 'active' as const,
            steps,
            createdAt: now,
            tags: []
        };

        return {
            success: true,
            plan,
            message: `Created plan "${params.title}" with ${steps.length} steps`
        };
    }
});

// 更新步骤状态工具
const UpdateStepInputSchema = z.object({
    stepId: z.string().describe("Step ID to update"),
    status: z.enum(['pending', 'in_progress', 'completed', 'failed']).describe("New status"),
    notes: z.string().optional().describe("Optional notes about the update")
});

export const UpdateStepTool = createTool({
    id: "update_step",
    name: "Update_Step",
    description: "Update the status of a plan step",
    inputSchema: UpdateStepInputSchema,
    async: false,
    execute: (params: z.infer<typeof UpdateStepInputSchema>, agent?: IAgent) => {
        const now = Date.now();
        
        return {
            success: true,
            stepId: params.stepId,
            newStatus: params.status,
            updatedAt: now,
            notes: params.notes,
            message: `Updated step ${params.stepId} to ${params.status}`
        };
    }
});

// 获取计划状态工具
const GetPlanStatusInputSchema = z.object({
    planId: z.string().optional().describe("Plan ID (optional, uses current plan if not provided)")
});

export const GetPlanStatusTool = createTool({
    id: "get_plan_status",
    name: "Get_Plan_Status",
    description: "Get the current status of a plan and its steps",
    inputSchema: GetPlanStatusInputSchema,
    async: false,
    execute: (params: z.infer<typeof GetPlanStatusInputSchema>, agent?: IAgent) => {
        return {
            success: true,
            planId: params.planId || 'current',
            message: "Plan status retrieved successfully"
        };
    }
});

// 导出 PlanContext
export const PlanContextId = "plan";

export const PlanContext: IContext<typeof PlanDataSchema> = {
    id: PlanContextId,
    description: "Manages multi-step plans, including their steps, statuses, and results. Used for orchestrating complex workflows, tracking progress, and ensuring all steps are executed and resolved in order.",
    dataSchema: PlanDataSchema,
    data: { 
        planHistory: [],
        activeStepId: undefined,
        currentPlan: undefined
    },
    
    setData: function(data: Partial<z.infer<typeof PlanDataSchema>>) {
        this.data = { ...this.data, ...data };
    },
    
    getData: function() {
        return this.data;
    },
    
    toolSet: () => ({
        name: "Plan Management Tools",
        description: "Tools for creating and managing multi-step plans",
        tools: [CreatePlanTool, UpdateStepTool, GetPlanStatusTool],
        active: true,
        source: PlanContextId
    }),
    
    renderPrompt: () => {
        return `Plan Management Context: Provides tools for creating, tracking, and managing multi-step plans. Use these tools to break down complex tasks into manageable steps, track progress, and ensure systematic execution of workflows.

Available tools:
- create_plan: Create a new plan with multiple steps
- update_step: Update the status of individual plan steps
- get_plan_status: Check the current status of plans and steps

Best practices:
- Break complex tasks into clear, actionable steps
- Set appropriate priorities for steps
- Update step statuses as work progresses
- Use dependencies to manage step ordering`;
    }
}; 