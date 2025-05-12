import { promises } from "dns";
import { z } from "zod";
import { render } from "./utils";



export interface IContextManager{
    contexts: AnyRAGEnableContext[];
    registerContext<T extends z.ZodObject<any>>(context: IRAGEnabledContext<T> ): void;
    findContextById: (id: string) => AnyRAGEnableContext;
    renderPrompt: () => string | Promise<string>;
    contextList: () => AnyRAGEnableContext[];
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

    setData(data: Partial<z.infer<T>>): void;
    getData(): z.infer<T>;

    toolSet: () => ToolSet;
    
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
     * 4. CONTEXT-SPECIFIC PATTERNS
     *    - Tool-related contexts: Show available tools, their status, recent usage
     *    - Plan/workflow contexts: Show steps, progress, dependencies
     *    - Data contexts: Summarize available data, recency, relevance
     *    - Interaction contexts: Show relevant history, current query, response guidelines
     * 
     * EXAMPLES:
     * 
     * 1. Tool Context Example:
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
     * 2. Client Context Example:
     * ```
     * --- CLI Interaction Context ---
     * User: admin01 | Latest query: "How to implement OAuth in my app?"
     * 
     * Conversation History (most recent first):
     * 1. [15:45:30] User: "How to implement OAuth in my app?"
     * 2. [15:44:20] Agent: "What kind of application are you building?"
     * 3. [15:43:55] User: "I need help with user authentication"
     * 
     * Response Guidelines:
     * • Answer the query directly using available information
     * • If details are missing, ask clarifying questions
     * • Use code examples for technical implementations
     * • ONLY use cli-response-tool when a direct answer is required
     * ```
     * 
     * 3. Process Context Example:
     * ```
     * --- Plan Context ---
     * Goal: Create a React application with TypeScript
     * Status: IN PROGRESS (2/5 steps completed)
     * 
     * Steps:
     * ✓ 1. Initialize project with Create React App
     * ✓ 2. Configure TypeScript settings
     * ⟳ 3. Create component structure [IN PROGRESS]
     * ⃝ 4. Implement state management
     * ⃝ 5. Set up testing framework
     * 
     * Current Focus:
     * - Complete step 3 (Create component structure)
     * - Prepare for step 4 dependencies
     * 
     * Decision Points:
     * • If user requests a different structure, update plan before proceeding
     * • If step 3 completes, automatically begin step 4
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
    id: string;
    description: string;
    contextManager: IContextManager;
    memoryManager: IMemoryManager;
    clients: IClient<any,any>[];
    toolSets: ToolSet[];
    llm: ILLM; 
    maxSteps: number;

    setup(): void;
    start(maxSteps: number): void;
    stop(): void;
    clientSendfn: ClientSendFnType;

    listToolSets(): ToolSet[];
    activateToolSets(toolSetNames: string[]): void;
    deactivateToolSets(toolSetNames: string[]): void;
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