import { promises } from "dns";
import { z } from "zod";
import { render } from "./utils";
import { IEventBus } from "./events/eventBus";
import { SupportedModel } from "./models";
import { InteractiveMessage, MessageHandler, SubscriptionConfig, InteractiveCapabilities } from "./events/types";

// 从 agent.ts 导入类型定义
export type LLMProvider = 'openai' | 'anthropic' | 'google';
export type AgentState = 'idle' | 'running' | 'stopping' | 'error';

// 从 taskQueue.ts 导入接口
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

// 思考系统的 Prompt 上下文结构
export interface PromptCtx {
    workflow: string;    // 工作流程描述
    status: string;      // 当前状态信息
    guideline: string;   // 指导原则
    examples: string;    // 使用示例
}

// Prompt 拼接策略
export type PromptAssemblyStrategy = 
    | 'grouped'         // 按类型分组：所有workflow放一起，所有status放一起，etc.
    | 'priority'        // 按优先级排序，完整保留每个context的结构
    | 'context_first'   // 保持每个context的完整性，按context分组
    | 'minimal'         // 只保留关键信息，精简输出
    | 'custom';         // 自定义拼接逻辑

export interface IContextManager{
    contexts: AnyRAGEnableContext[];
    registerContext<T extends z.ZodObject<any>>(context: IRAGEnabledContext<T> ): void;
    findContextById: (id: string) => AnyRAGEnableContext;
    renderPrompt: () => string | Promise<string>;
    contextList: () => AnyRAGEnableContext[];
    
    /**
     * 集中管理所有Context的MCP服务器安装
     * 遍历所有Context，调用它们的install方法，并处理安装结果
     * 
     * @param agent 代理实例，将传递给每个Context的install方法
     * @returns 安装结果的摘要信息
     */
    installAllContexts: (agent: IAgent) => Promise<{
        totalContexts: number,
        installedCount: number,
        failedCount: number,
        skippedCount: number,
        details: Array<{
            contextId: string,
            status: 'installed' | 'failed' | 'skipped',
            error?: string,
            mcpServersCount?: number
        }>
    }>;

    /**
     * 渲染结构化的 PromptCtx
     * 收集所有 Context 的 PromptCtx 并按照指定策略进行拼接
     * 
     * @param strategy 拼接策略
     * @returns 拼接后的结构化提示内容
     */
    renderStructuredPrompt?: (strategy?: PromptAssemblyStrategy) => Promise<PromptCtx> | PromptCtx;

    /**
     * 设置 prompt 拼接策略
     * 
     * @param strategy 新的拼接策略
     */
    setPromptAssemblyStrategy?: (strategy: PromptAssemblyStrategy) => void;

    /**
     * 获取当前的 prompt 拼接策略
     */
    getPromptAssemblyStrategy?: () => PromptAssemblyStrategy;
}

export interface IContext<T extends z.ZodObject<any>>{
    id: string;
    /**
     * A concise description of this context's purpose, functionality, boundaries and usage scenarios.
     * 
     * This description appears in the system prompt's <context name="..."> block header,
     * helping the LLM understand the purpose and capabilities of this context.
     * 
     * Guidelines for writing good descriptions:
     * - Start with an action verb (Manages, Tracks, Stores, Enables, etc.)
     * - Clearly state the primary functionality and data managed by this context
     * - Explain when and how the context should be used
     * - Keep it under 1-2 sentences for clarity
     * 
     * Examples:
     * - "Tracks all tool call requests and their results. Used to coordinate which tools the agent can call, 
     *    their async/sync status, and to correlate tool calls with their results."
     * - "Stores and manages multi-step plans, including their steps, statuses, and results. Used for 
     *    orchestrating complex workflows, tracking progress, and ensuring all steps are executed and resolved in order."
     */
    description: string;
    dataSchema: T;
    data: z.infer<T>;

    /**
     * 思考系统的 Prompt 上下文结构
     * 包含工作流程、状态、指导原则和示例，用于结构化的 prompt 生成
     */
    promptCtx?: PromptCtx;

    /**
     * MCP服务器配置，直接在Context中定义，而不是从配置文件加载。
     * 每个Context可以关联一个或多个MCP服务器，这些服务器的工具将自动注入到Context的toolSet中。
     * 
     * 配置示例:
     * ```
     * mcpServers: [
     *   {
     *     name: "mcp-server-name",
     *     type: "stdio",
     *     command: "npx",
     *     args: ["-y", "mcp-package"],
     *     env: { "API_KEY": "your-key" }
     *   },
     *   {
     *     name: "another-server",
     *     type: "sse",
     *     url: "https://mcp-server-url.com"
     *   }
     * ]
     * ```
     */
    mcpServers?: {
        name: string;
        type?: "stdio" | "sse" | "streamableHttp";
        // stdio specific
        command?: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        // sse/http specific
        url?: string;
        // General options
        autoActivate?: boolean;
    }[];
    
    /**
     * Called during agent setup after context registration.
     * Provides an opportunity for the context to initialize resources,
     * connect to MCP servers, and configure its toolsets.
     * 
     * @param agent The agent instance this context is registered with
     */
    install?: (agent: IAgent) => Promise<void>;

    setData(data: Partial<z.infer<T>>): void;
    getData(): z.infer<T>;

    /**
     * Returns the tool set(s) associated with this context.
     * 
     * A context can now return either:
     * 1. A single ToolSet
     * 2. Multiple ToolSets as an array
     * 
     * When multiple tool sets are returned:
     * - They should be logically related to the context
     * - Each should serve a distinct purpose within the context's domain
     * - The renderPrompt method should explain when to use each tool set
     * 
     * Example of a context with multiple tool sets:
     * - A DatabaseContext might return [QueryToolSet, SchemaToolSet, AdminToolSet]
     * - An MCP integration context might return tool sets organized by categories
     */
    toolSet: () => ToolSet | ToolSet[];
    
    /**
     * Optional method to handle tool call results.
     * Allows the context to react to tool execution results.
     * 
     * @param toolCallResult The result of a tool execution
     */
    onToolCall?: (toolCallResult: ToolCallResult) => void;
    
    /**
     * Generates the prompt content for this context.
     * 
     * The method can return either:
     * 1. A traditional string (legacy format) for backward compatibility
     * 2. A PromptCtx structure for the thinking system
     * 
     * When returning PromptCtx, the structure should contain:
     * - workflow: Step-by-step process description
     * - status: Current state and dynamic information
     * - guideline: Rules, best practices, and constraints
     * - examples: Usage examples and common scenarios
     * 
     * The ContextManager will handle assembling these into a cohesive prompt
     * using different assembly strategies (grouped by type, priority-based, etc.)
     * 
     * @returns A string or PromptCtx structure containing the formatted prompt content
     */
    renderPrompt: () => string | PromptCtx | Promise<string | PromptCtx>;
}

// 支持RAG功能的Context接口
export interface IRAGEnabledContext <T extends z.ZodObject<any>> extends IContext<T> {
    // 关联此Context的RAG实例集合
    rags?: Record<string, IRAG>;
    
    // 注册RAG实例
    registerRAG?: (ragId: string, rag: IRAG)=> void;
    
    // 使用Context相关条件查询RAG
    queryContextRAG?: (ragId: string, query: string, options?: QueryOptions)=> Promise<RAGResult[]>;
    
    // 在renderPrompt时加载相关RAG数据
    loadRAGForPrompt?: ()=>Promise<string>;
}

type AnyRAGEnableContext = IRAGEnabledContext<any>;
type AnyContext = IContext<any>;

// Helper function to convert any IContext to IRAGEnabledContext
export function asRAGEnabledContext<T extends z.ZodObject<any>>(context: IContext<T>): IRAGEnabledContext<T> {
    // Check if context is null or undefined first
    if (!context) {
        throw new Error('Context is null or undefined');
    }
    
    // If it's already a RAG-enabled context, return it as is
    if ('rags' in context && context.rags) {
        return context as IRAGEnabledContext<T>;
    }
    
    // Otherwise, add the RAG properties with default implementations
    const ragContext = context as IRAGEnabledContext<T>;
    ragContext.rags = {};
    
    // Add default implementations for RAG methods
    ragContext.registerRAG = (ragId: string, rag: IRAG) => {
        if (!ragContext.rags) ragContext.rags = {};
        ragContext.rags[ragId] = rag;
    };
    
    ragContext.queryContextRAG = async (ragId: string, query: string, options?: QueryOptions) => {
        if (!ragContext.rags || !ragContext.rags[ragId]) {
            throw new Error(`RAG with ID ${ragId} not found in context ${ragContext.id}`);
        }
        return await ragContext.rags[ragId].query(query, options);
    };
    
    ragContext.loadRAGForPrompt = async () => {
        return ''; // Default empty implementation
    };
    
    return ragContext;
}

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

// RAG相关类型定义
export type VectorStoreType = 'chroma' | 'pinecone' | 'qdrant' | 'weaviate' | 'milvus';
export type EmbeddingModelType = 'openai' | 'cohere' | 'anthropic' | 'google' | 'local';

export interface VectorStoreConfig {
    url?: string;
    apiKey?: string;
    collectionName?: string;
    namespace?: string;
    environment?: string;
    index?: string;
    [key: string]: any;
}

export interface EmbeddingConfig {
    modelName?: string;
    apiKey?: string;
    dimensions?: number;
    batchSize?: number;
    [key: string]: any;
}

export interface IndexConfig {
    dimension: number;
    metric?: 'cosine' | 'euclidean' | 'dot';
    indexType?: string;
    [key: string]: any;
}

export interface ChunkingStrategy {
    method: 'fixed' | 'paragraph' | 'semantic';
    size?: number;
    overlap?: number;
    [key: string]: any;
}

export interface QueryOptions {
    limit?: number;
    similarity_threshold?: number;
    includeEmbeddings?: boolean;
    includeMetadata?: boolean;
}

export interface RAGFilter {
    metadata?: Record<string, any>;
    dateRange?: {start: Date, end: Date};
    custom?: Record<string, any>;
}

export interface RAGMetadata {
    source: string;             // 例如，'twitter', 'xiaohongshu', 'plan'
    category: string;           // 例如，'web3', 'marketing', 'reasoning'
    created: Date;
    lastUpdated?: Date;
    userId?: string;            // 用户特定数据
    tags?: string[];            // 灵活标签
    [key: string]: any;         // 允许额外自定义元数据
}

export interface RAGDocument {
    id?: string;                // 可选，系统可以自动生成
    content: string;            // 实际文本内容
    metadata: RAGMetadata;      // 灵活的元数据用于过滤
    embedding?: number[];       // 可选的预计算嵌入向量
}

export interface RAGResult {
    id: string;
    content: string;
    score: number;
    metadata: RAGMetadata;
    embedding?: number[];
}

// RAG核心接口
export interface IRAG {
    id: string;
    name: string;
    description: string;
    
    // 核心操作
    query(query: string, options?: QueryOptions): Promise<RAGResult[]>;
    upsert(documents: RAGDocument[]): Promise<string[]>;
    delete(ids: string[]): Promise<boolean>;
    
    // 过滤和元数据操作
    queryWithFilter(query: string, filter: RAGFilter, options?: QueryOptions): Promise<RAGResult[]>;
}

// RAG构建器接口
export interface IRAGBuilder {
    setVectorStore(type: VectorStoreType, config: VectorStoreConfig): IRAGBuilder;
    setEmbeddingModel(model: EmbeddingModelType, config?: EmbeddingConfig): IRAGBuilder;
    setIndexConfig(config: IndexConfig): IRAGBuilder;
    setChunkingStrategy(strategy: ChunkingStrategy): IRAGBuilder;
    build(): IRAG;
}

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

// 增强的内存管理器接口，整合RAG功能
export interface IEnhancedMemoryManager extends IMemoryManager {
    // RAG特定操作
    registerRAG(rag: IRAG): void;
    getRag(id: string): IRAG;
    queryRag(ragId: string, query: string, options?: QueryOptions): Promise<RAGResult[]>;
    
    // 内存分类
    storeReasoning(plan: any): Promise<string>; // 存储计划、问题解决数据
    storeClientData(data: any, source: string, category: string): Promise<string>; // 存储客户端数据
    storeWebContent(content: string, url: string, metadata: RAGMetadata): Promise<string>; // 存储网页内容
    storeUserInteraction(interaction: any): Promise<string>; // 存储用户交互历史
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
        responseTool?: ITool<InputSchema, any, IAgent>;
        dealResponseResult?: (response: z.infer<OutputSchema>, context: AnyContext) => void;// after calling the tool to generate the output, we also need to put the output in the Context or at the Memory 
    }
}



// 标准化的工具执行结果基础格式
export const BaseToolResultSchema = z.object({
    success: z.boolean().describe("Whether the tool execution was successful"),
    message: z.string().optional().describe("Message about the tool execution success or error")
}).describe("Base tool execution result format with success/error fields");

export type BaseToolResult = z.infer<typeof BaseToolResultSchema>;

// our tool design to support create a new agent and invoke this agent and also intergate the mcp-client 
export interface ITool<Args extends z.AnyZodObject, Result extends z.ZodType<BaseToolResult & Record<string, any>>, Agent extends IAgent>{
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
 *
 * Example:
 * description: "This tool set is designed for multi-step plan management, including tools for creating, updating, executing, and querying plans. Suitable for workflow automation and complex task orchestration."
 */
export interface ToolSet {
    name: string;              
    description: string;       
    tools: AnyTool[];          
    active: boolean;           
    source?: string;           
  }

export interface Swarms{
    id: string;
    name: string;
    description: string;
    agents: IAgent[];
}

export type ClientSendFnType = (clientInfo: {clientId: string, userId: string}, incomingMessages: Message) => void;

/**
 * 🎯 HHH-AGI 交互系统架构
 * 
 * 组件关系：
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    IInteractionHub                          │
 * │                    (协调中心)                               │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
 * │  │   IAgent    │  │    Event    │  │  IInteractiveLayer  │  │
 * │  │  (智能体)   │  │     Bus     │  │   (用户交互层)      │  │
 * │  │             │  │  (事件总线)  │  │                     │  │
 * │  └─────────────┘  └─────────────┘  └─────────────────────┘  │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * 职责分工：
 * - IInteractionHub: 系统协调器，管理所有组件生命周期
 * - EventBus: 事件传输层，负责事件路由和分发
 * - IAgent: 智能体，处理任务逻辑和工具执行
 * - IInteractiveLayer: 用户界面层，处理用户输入输出
 */

export interface IInteractionHub {
    eventBus: IEventBus;
    
    // 注册组件
    registerAgent(agent: IAgent): void;
    registerInteractiveLayer(layer: IInteractiveLayer): void;
    
    // 启动和停止
    start(): Promise<void>;
    stop(): Promise<void>;
    
    // 获取注册的组件
    getAgents(): IAgent[];
    getInteractiveLayers(): IInteractiveLayer[];
    
    // 🆕 系统协调功能
    broadcastToAgents(eventType: string, payload: any): Promise<void>;
    broadcastToInteractiveLayers(eventType: string, payload: any): Promise<void>;
    
    // 🆕 组件状态管理
    getSystemStatus(): {
        agents: Array<{ id: string; status: string; isRunning: boolean }>;
        interactiveLayers: Array<{ id: string; capabilities: any }>;
        eventBusStatus: any;
    };
    
    // 事件路由（可选，用于复杂的多对多场景）
    routeEvent?(event: any, targetType: 'agent' | 'interactive_layer', targetId?: string): Promise<void>;
}

/**
 * 🤖 智能体接口 - 核心任务处理器
 * 职责：任务理解、工具调用、思考推理
 */
export interface IAgent{
    // 基本属性
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    
    // 核心组件
    contextManager: IContextManager;
    llm: ILLM; 
    taskQueue: ITaskQueue;
    
    // 工具和配置
    toolSets: ToolSet[];
    enableParallelToolCalls: boolean;
    mcpConfigPath: string;
    
    // 事件和状态管理
    eventBus?: IEventBus;
    executionMode: 'auto' | 'manual' | 'supervised';
    isRunning: boolean;
    shouldStop: boolean;
    currentState: AgentState;
    currentStep: number;
    
    // 上下文集合
    contexts: IRAGEnabledContext<any>[];

    // 核心生命周期方法
    setup(): Promise<void>;
    startWithUserInput(userInput: string, maxSteps: number, options?: {
        savePromptPerStep?: boolean;  // 是否每步保存prompt
        promptSaveDir?: string;       // prompt保存目录
        promptSaveFormat?: 'markdown' | 'json' | 'both';  // 保存格式
    }): Promise<void>;
    stop(): void;
    
    getPrompt(): string | Promise<string>;

    // 工具集管理
    listToolSets(): ToolSet[];
    addToolSet(toolSet: ToolSet): void;
    activateToolSets(toolSetNames: string[]): void;
    deactivateToolSets(toolSetNames: string[]): void;
    getActiveTools(): AnyTool[];
    
    // 执行模式管理
    getExecutionMode(): 'auto' | 'manual' | 'supervised';
    setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void>;
    
    // 🆕 标准化的事件处理接口
    setupEventHandlers(): void;
    handleUserMessage(event: any): Promise<void>;
    handleInputResponse(event: any): Promise<void>;
    subscribeToExecutionModeChanges?(): void;
    
    // 用户交互方法
    processUserInput(input: string, sessionId: string): Promise<void>;
    
    // 🆕 事件发布能力
    publishEvent(eventType: string, payload: any, sessionId?: string): Promise<void>;
    subscribe(eventType: string, handler: (event: any) => void): string;
    unsubscribe(subscriptionId: string): void;
    
    // 🆕 生命周期钩子（供子类扩展）
    beforeStart?(): Promise<void>;
    afterStop?(): Promise<void>;
    onToolCallComplete?(toolResult: ToolCallResult): Promise<void>;
}

/**
 * 🖥️ 交互层接口 - 用户界面处理器  
 * 职责：用户输入处理、界面渲染、交互反馈
 */
export interface IInteractiveLayer {
    id: string;
    
    // 消息处理
    sendMessage(message: InteractiveMessage): Promise<void>;
    receiveMessage(): Promise<InteractiveMessage>;
    
    // 事件订阅
    subscribe(eventType: string | string[], handler: MessageHandler, config?: SubscriptionConfig): string;
    unsubscribe(eventType: string | string[], handler: MessageHandler): void;
    
    // 能力和状态
    getCapabilities(): InteractiveCapabilities;
    start(): Promise<void>;
    stop(): Promise<void>;
    
    // 🆕 增强的交互能力
    setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void>;
    getCurrentSession(): string;
    getActiveEvents(): InteractiveMessage[];
    clearEventHistory(): void;
    
    // 🆕 与 IInteractionHub 的集成
    setInteractionHub?(hub: IInteractionHub): void;
    onAgentStateChange?(agentId: string, state: any): Promise<void>;
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
    model: SupportedModel;
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

// 简化的用户输入处理工具接口
export interface IUserInputTool extends ITool<any, any, IAgent> {
    handleUserMessage(message: string, sessionId: string): Promise<any>;
}

/**
 * Configuration for the agent
 */
export interface Config {
}