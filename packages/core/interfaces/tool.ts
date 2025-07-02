import { z } from 'zod';

/**
 * Tool interface supporting create a new agent and invoke this agent and also integrate the mcp-client
 */
export interface ITool<Args extends z.AnyZodObject, Result extends z.ZodType<any>, Agent extends any>{
    id?: string;
    callId?: string;
    type: string;
    name: string;
    description: string;
    params: Args;
    async: boolean;
    execute: (params: z.infer<Args>, agent?: Agent) => Promise<z.infer<Result>> | z.infer<Result>;
    toCallParams: () => ToolCallDefinition;
}
export type AnyTool = ITool<any, any, any>;

/**
 * ToolSet.description best practices:
 * - Clearly state the usage scenario or purpose for this tool set (e.g., "For multi-step plan management").
 * - Briefly list the main tools included (e.g., "Includes tools for creating, updating, executing, and querying plans").
 * - Optionally mention the source (e.g., "Local tool set", "MCP-Server: github-mcp").
 * - Avoid generic descriptions like "tool collection" or "local tools"; make it clear to both LLMs and users what this tool set is for and what it can do.
 */
export interface ToolSet {
    name: string;              
    description: string;       
    tools: AnyTool[];          
    active: boolean;           
    source?: string;           
}

/**
 * Tool call definition schemas
 */
export const ToolCallDefinitionSchema = z.object({
    type: z.literal("function"),
    name: z.string(),
    description: z.string(),
    paramSchema: z.instanceof(z.ZodObject),
    async: z.boolean().optional(),
    strict: z.boolean().default(true),
    resultSchema: z.any(),
    resultDescription: z.string().optional()
});

export type ToolCallDefinition = z.infer<typeof ToolCallDefinitionSchema>;

export const ToolCallParamsSchema = z.object({
    type: z.literal("function"),
    name: z.string().describe("name uses to mark which function to be called"),
    call_id: z.string().describe("call_id uses to correlated the ToolCallParams and the ToolExecutionResult"),
    parameters: z.any()
}).describe("ToolCallParams define to call ");
export type ToolCallParams = z.infer<typeof ToolCallParamsSchema>;

/**
 * Tool call execution result interface, used for PromptProcessor
 */
export interface ToolExecutionResult {
    name: string;
    call_id: string;
    params?: any;
    status: 'pending' | 'succeed' | 'failed';
    result?: any;
    message?: string;
    executionTime?: number;
}

/**
 * Task queue related interfaces
 */
export interface ITask{
    id: string;
    execute: () => Promise<any>;
    priority: number;
    type: 'processStep' | 'toolCall' | 'custom';
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    createdAt: number;
}

export interface ITaskQueue{
    tasks: ITask[];     
    runningTasks: Set<string>;
    concurrency: number;
    isRunning: boolean;
    addTask<T>(taskFn: () => Promise<T>, priority: number, type?: 'processStep' | 'toolCall' | 'custom', id?: string): Promise<T>;
    taskCount(): number;
    runningTaskCount(): number;
    taskStatus(id: string): {id: string, status: string, type?: string} | 'not found';
    run(): Promise<void>;
    addProcessStepTask<T>(taskFn: () => Promise<T>, priority?: number, id?: string): Promise<T>;
    addToolCallTask<T>(taskFn: () => Promise<T>, priority?: number, id?: string): Promise<T>;
    getTasksByType(type: 'processStep' | 'toolCall' | 'custom'): ITask[];
    clearTasks(type?: 'processStep' | 'toolCall' | 'custom'): number;
} 