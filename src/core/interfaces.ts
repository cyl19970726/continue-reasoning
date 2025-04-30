import { promises } from "dns";
import { z } from "zod";
import { render } from "./utils";



export interface IContextManager{
    contexts: AnyContext[];
    registerContext<T extends z.ZodObject<any>>(context: IContext<T>): void;
    findContextById: (id: string) => AnyContext;
    renderPrompt: () => string;
    contexList: () => AnyContext[];
}

// Context代表一部分处理逻辑
// 所以有一部分 热数据 需要 存储在 context 中
// 另外一部分 冷数据 需要 存储在 memory 中
// 同时需要 有一个 loadMemory Tool 来告知哪部分冷数据可以通过什么方法拿出来

// 多个计划放在一个 PlanContext里，那么需要在 PlanContext 里维护一个 PlanMemoryList 来追踪多个计划
export interface IContext<T extends z.ZodObject<any>>{
    id: string;
    description: string;
    dataSchema: T;
    data: z.infer<T>;

    setData(data: Partial<z.infer<T>>): void;
    getData(): z.infer<T>;

    toolList: () => ITool<any,any,any>[];
    
    renderPrompt: () => string;
}
type AnyContext = IContext<any>;


export interface Container<T> {
    id: string;
    name: string;
    description: string;
    storage: T;
}

export type MemoryData<T> = {
    id: string;
    description: string;
    data: T;
};


export interface IMemoryManager{
    id: string;
    name: string;
    description: string;
    createContainer<T>(name: string, description: string): Container<T>;
    getContainer<T>(id: string): Container<T>;
    listContainer(): Container<any>[];
    deleteContainer(id: string): void;
    // return the memoryId which used to mark the memoryData
    saveMemory<T>(memory: MemoryData<T>, containerId: string): string;
    loadMemory<T>(id: string, containerId: string): MemoryData<T>;
    deleteMemory(id: string, containerId: string): void;
    renderPrompt(): string;
}


export interface IClient<InputSchema extends z.ZodObject<any>,OutputSchema extends z.ZodObject<any>>{
    id: string;
    description: string;
    input:{
        subscribe: (sendfn: ClientSendFnType) => void;
    }
    // if the llm response include the output handlers, wrap the output handers as the task and put it into taskqueue
    output:{
        paramsSchema: OutputSchema;
        responseTool?: ITool<InputSchema,OutputSchema,IAgent>;
        dealResponseResult?: (response: z.infer<OutputSchema>, context: AnyContext) => void;// after calling the tool to generate the output, we also need to put the output in the Context or at the Memory 
    }
}



// our tool design to support create a new agent and invoke this agent and also intergate the mcp-client 
export interface ITool<Args extends z.AnyZodObject, Result extends z.AnyZodObject, Agent extends IAgent>{
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
export type AnyTool = ITool<any,any,any>;

export interface Swarms{
    id: string;
    name: string;
    description: string;
    agents: IAgent[];
}

export type ClientSendFnType = (clientInfo: {clientId: string, userId: string}, incomingMessages: Message) => void;
export interface IAgent{
    id: string;
    description: string;
    contextManager: IContextManager;
    memoryManager: IMemoryManager;
    clients: IClient<any,any>[];
    tool: AnyTool[];
    llm: ILLM; 
    maxSteps: number;

    setup(): void;
    start(maxSteps: number): void;
    stop(): void;
    clientSendfn: ClientSendFnType;
}

// First define the schemas for tool calls
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
    call_id: z.string().describe("call_id uses to correlated the ToolCallParams and the ToolCallResult"),
    parameters: z.any()
}).describe("ToolCallParams define to call ");
export type ToolCallParams = z.infer<typeof ToolCallParamsSchema>;

export const ToolCallResultSchema = z.object({
    type: z.literal("function"),
    name: z.string().describe("name uses to mark which function to be called"),
    call_id: z.string().describe("call_id uses to correlated the ToolCallParams and the ToolCallResult"),
    result: z.object({})
});
export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;


export const LLMModel = z.enum(['openai', 'anthropic', 'google']);
// the llm need to support the mainstream llm model like openai, anthropic, google, etc. and also support the streaming output 
export interface ILLM{
    model:  z.infer<typeof LLMModel>;
    streaming: boolean;
    parallelToolCall: boolean;
    temperature: number;
    maxTokens: number;
    setParallelToolCall?: (enabled: boolean) => void;
    streamCall: (messages: string, tools: ToolCallDefinition[]) => Promise<{text: string, toolCalls: ToolCallParams[]}>;
    call: (messages: string, tools: ToolCallDefinition[]) => Promise<{text: string, toolCalls: ToolCallParams[]}>;
}

export const MessageSchema = z.object({
    role: z.string(),
    text: z.string(),
    timestamp: z.string().describe("timestamp uses to mark the timestamp of the message"),
});
export type Message = z.infer<typeof MessageSchema>;