import { promises } from "dns";
import { z } from "zod";
import { render } from "./utils";
import { IEventBus } from "./events/eventBus";
import { SupportedModel } from "./models";

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
     * Generates the prompt content for this context, which will be included in the system prompt.
     * The returned string will be wrapped inside <context name="...">...</context> tags by the ContextManager.
     * 
     * PROMPT METHODOLOGY:
     * 
     * 1. STRUCTURE
     *    Organize your prompt with a consistent structure:
     *    - Header: Clear section title with context name/ID
     *    - Summary: Brief overview of current state (1-2 lines)
     *    - Main Content: Key information organized in logical sections
     *    - Instructions: Clear guidance on how to use this context
     *    - Tool Set Guidance: For contexts with multiple tool sets, explain when to use each one
     * 
     * 2. FORMATTING
     *    - Use section dividers like "--- Section Name ---"
     *    - Use bullet points (•) for lists of related items
     *    - Use numbered lists (1. 2. 3.) for sequential instructions or steps
     *    - For complex data, use structured formats (tables, key-value pairs)
     *    - Highlight important information with UPPERCASE or *asterisks*
     * 
     * 3. CONTENT GUIDELINES
     *    - Start with the most important information
     *    - Include current state, history when relevant, and available actions
     *    - Show examples for complex operations
     *    - For tools, explain WHEN to use them, not just HOW
     *    - Include constraints, limitations, and important rules
     *    - Use clear, concise language focused on agent actions
     * 
     * 4. MULTI-TOOLSET GUIDANCE
     *    - When a context has multiple tool sets, clearly explain each set's purpose
     *    - Provide decision guidelines for choosing the appropriate tool set
     *    - Group related tools together and explain their relationships
     *    - Use examples to illustrate typical workflows across tool sets
     *    - Explain any sequence dependencies between tool sets
     * 
     * 5. CONTEXT-SPECIFIC PATTERNS
     *    - Tool-related contexts: Show available tools, their status, recent usage
     *    - Plan/workflow contexts: Show steps, progress, dependencies
     *    - Data contexts: Summarize available data, recency, relevance
     *    - Interaction contexts: Show relevant history, current query, response guidelines
     *    - Integration contexts: Explain external system capabilities, limitations, and when to use them
     * 
     * EXAMPLES:
     * 
     * 1. Context with Multiple Tool Sets:
     * ```
     * --- Hacker News Integration Context ---
     * 
     * Current State: Connected to Hacker News API, 3 recent searches for AI topics
     * 
     * Available Tool Sets:
     * 
     * 1. BASIC STORY TOOLS
     *    • For retrieving and searching content directly
     *    • Use for initial exploration and specific story retrieval
     *    • Tools: get_stories, get_story_info, search_stories
     * 
     * 2. USER TOOLS
     *    • For accessing user information and submissions
     *    • Use when tracking specific authors or companies
     *    • Tools: get_user_info, get_user_submissions
     * 
     * 3. AI CONTENT TOOLS
     *    • For specialized AI content discovery and analysis
     *    • Use when specifically targeting AI news and trends
     *    • Tools: find_ai_stories, analyze_ai_trends
     * 
     * Usage Decision Guide:
     * - For general browsing → Use Basic Story Tools
     * - For following specific experts → Use User Tools
     * - For focused AI research → Use AI Content Tools first, then other tools for details
     * ```
     * 
     * 2. Tool Context Example:
     * ```
     * --- Tool Call Context ---
     * Available tools: 5 tools ready, 3 async operations in progress
     * 
     * Current Tool State:
     * • Active calls: 3 pending async calls (call_ids: tool-123, tool-456, tool-789)
     * • Recent results: "web_search" completed at 2023-05-01T15:30:00Z
     * 
     * Tool Execution Rules:
     * 1. Check for existing calls before creating duplicates
     * 2. Use sync tools (bash, cli-response) for immediate responses
     * 3. Use async tools (web-search, file-analysis) for background tasks
     * 
     * Important: Wait for async tool results before making dependent calls
     * ```
     * 
     * TESTING TASKS:
     * To evaluate the effectiveness of your prompts, test if the LLM can:
     * 1. Follow context-specific rules consistently (e.g., use sync vs async tools correctly)
     * 2. Understand the current state and act appropriately (e.g., continue a plan from current step)
     * 3. Correlate information across contexts (e.g., use plan context with execution context)
     * 4. Avoid repetitive or redundant actions (e.g., not creating duplicate requests)
     * 5. Prioritize tasks correctly based on context information
     * 6. Switch between contexts appropriately (e.g., from planning to execution)
     * 7. Select the appropriate tool set for the current task (for contexts with multiple tool sets)
     * 
     * Example tests:
     * - Create a multi-step plan and check if steps are executed in the correct order
     * - Submit an ambiguous user query and verify the agent asks for clarification
     * - Call an async tool and verify the agent properly waits for the result
     * - Create multiple overlapping tasks and check if the agent manages them correctly
     * 
     * @returns A string or Promise<string> containing the formatted prompt content
     */
    renderPrompt: () => string | Promise<String>;
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
export interface IAgent{
    // 基本属性
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    
    // 核心组件
    contextManager: IContextManager;
    memoryManager: IMemoryManager;
    clients: IClient<any,any>[];
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
    start(maxSteps: number): Promise<void>;
    stop(): void;
    
    // 客户端交互
    clientSendfn: ClientSendFnType;

    // 工具集管理
    listToolSets(): ToolSet[];
    addToolSet(toolSet: ToolSet): void;
    activateToolSets(toolSetNames: string[]): void;
    deactivateToolSets(toolSetNames: string[]): void;
    getActiveTools(): AnyTool[];
    
    // 执行模式管理
    getExecutionMode(): 'auto' | 'manual' | 'supervised';
    setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void>;
    
    // 用户交互方法
    processUserInput(input: string, sessionId: string): Promise<void>;
    requestApproval(request: any): Promise<any>;
    requestUserInput(request: any): Promise<any>;
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

// 新增：交互中心接口，管理Agent和InteractiveLayer之间的协作
export interface IInteractionHub {
    eventBus: IEventBus;
    
    // 注册组件
    registerAgent(agent: IAgent): void;
    registerInteractiveLayer(layer: any): void; // 使用any避免循环依赖
    
    // 启动和停止
    start(): Promise<void>;
    stop(): Promise<void>;
    
    // 获取注册的组件
    getAgents(): IAgent[];
    getInteractiveLayers(): any[];
    
    // 事件路由（可选，用于复杂的多对多场景）
    routeEvent?(event: any, targetType: 'agent' | 'interactive_layer', targetId?: string): Promise<void>;
}

// 简化的用户输入处理工具接口
export interface IUserInputTool extends ITool<any, any, IAgent> {
    handleUserMessage(message: string, sessionId: string): Promise<any>;
}