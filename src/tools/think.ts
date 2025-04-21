import { ToolExecutionOptions } from "ai";
import { Tool, SystemContext } from "../type";
import { z } from "zod";
import { PlanAction, ProblemAction } from "../prompt";

export const Solution = z.object({
    description: z.string(),
    result: z.enum(["success", "failed"]),
    reason: z.string(),
})

export const Problem = z.object({
    id: z.number(),
    description: z.string(),
    status: z.enum(["waiting", "pending", "success", "failed"]),
    solution:z.array(Solution),
})

export const PlanStep = z.object({
    id: z.number(),
    description: z.string(),
    dependencies: z.array(z.number()),
    process: z.object({
        content: z.string(),
        problems: z.array(Problem),
    }),
    status: z.enum(["waiting", "pending", "success", "failed"]),
    result: z.string(),
})

export const Plan = z.object({
    id: z.number(),
    goal: z.string(),
    currentStep: z.number(),
    steps: z.array(PlanStep),
})

export const planToolPrompt = `
    ## Instructions
    Plan tool use to create a plan for user's task;
    First, you should understand the user's task and then extract the goal from the task;
    Second, you need to clearly identify your current status - what capabilities and resources you currently have to help you achieve your goals
    Third, you need to design steps to achieve the goal and record the each step execution process at the process property and when the problem occurs, you need to record the problem at the problems property;
    Fourth, you need to record the result of the each step execution at the result property;
`

const ReasoningData = z.object({
    plan: Plan,
    problem: Problem,
})
export type ReasoningContext = SystemContext<typeof ReasoningData>;

export class PlanTool implements Tool<typeof Plan, string>{
    name(): string {
        return PlanAction;
    }
    description(): string{
        return `create the goal and plan for the task and manager the plan.
        ${planToolPrompt}
        `;
    }

    parameters = Plan;
    
    async execute(parameters: z.infer<typeof this.parameters>, options?: ToolExecutionOptions, systemContext?: ReasoningContext): Promise<string>{

        if(systemContext){
            systemContext.data.plan = parameters;
        }else{
            throw new Error("System context is required");
        }
        
        return "";
    }
}


export const problemToolPrompt = `
    ## Instructions
    Problem tool use to define and update the problem;
    First, you need to define the problem with the enough context so that we can deal with the problem as a independent problem;
    Second, find the solution for the problem until the problem is solved and record these solution.
    Third, if the solution finally falied or succeed, please analyze the reason why it failed or succeed.
`
export class ProblemTool implements Tool<typeof Problem, string>{
    name(): string {
        return ProblemAction;
    }
    description(): string{
        
        return `define the problem and manager the solution process.
        ${problemToolPrompt}
        `;
    }

    parameters = Problem;
    
    async execute(parameters: z.infer<typeof this.parameters>, options?: ToolExecutionOptions, systemContext?: ReasoningContext): Promise<string>{

        if(systemContext){
            systemContext.data.problem = parameters;
        }else{
            throw new Error("System context is required");
        }
        
        return "";
    }
}
