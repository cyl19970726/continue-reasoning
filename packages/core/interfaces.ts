import { promises } from "dns";
import { z } from "zod";
import { render } from "./utils";
import { IEventBus } from "./events/eventBus";
import { SupportedModel } from "./models";
import { InteractiveMessage, MessageHandler, SubscriptionConfig, InteractiveCapabilities } from "./events/types";
import Logger, { logger } from "./utils/logger";

// 从 agent.ts 导入类型定义
export type LLMProvider = 'openai' | 'anthropic' | 'google';
export type AgentStatus = 'idle' | 'running' | 'stopping' | 'error';

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
     * - workflow: Process description and methodology
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
 * 🎯 交互中心接口 - 系统协调器
 * 职责：协调多个Agent和InteractiveLayer之间的通信
 */
export interface IInteractionHub {
    eventBus: IEventBus;
    
    // 组件注册
    registerAgent(agent: IAgent): Promise<void>;
    registerInteractiveLayer(layer: IInteractiveLayer): Promise<void>;
    
    // 系统管理
    start(): Promise<void>;
    stop(): Promise<void>;
    
    // 信息查询
    getAgents(): IAgent[];
    getInteractiveLayers(): IInteractiveLayer[];
    getSystemStatus(): any;
    
    // 事件路由
    broadcastToAgents(eventType: string, payload: any): Promise<void>;
    broadcastToInteractiveLayers(eventType: string, payload: any): Promise<void>;
    routeEvent(event: any, targetType: 'agent' | 'interactive_layer', targetId?: string): Promise<void>;
    
    // 健康检查
    checkHealth(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: any;
    };
}

export type AgentCallbacks = {
    onSessionStart?: (sessionId: string) => void;
    onSessionEnd?: (sessionId: string) => void;
    onAgentStep?: (step: AgentStep<any>) => void;
    onStateStorage?: (state: AgentStorage) => void;
    loadAgentStorage: (sessionId: string) => Promise<AgentStorage | null>;
    onToolCall?: (toolCall: ToolCallParams) => void;
    onToolCallResult?: (result: ToolExecutionResult) => void;
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

    executionMode: 'auto' | 'manual' | 'supervised';
    isRunning: boolean;
    shouldStop: boolean;
    currentState: AgentStatus;
    currentStep: number;

    // agentStorage
    agentStorage: AgentStorage;
    
    // 上下文集合
    contexts: IRAGEnabledContext<any>[];

    // callbacks
    callbacks?: AgentCallbacks;

    setCallBacks(callbacks:AgentCallbacks): void;

    // 核心生命周期方法
    setup(): Promise<void>;
    startWithUserInput(
        userInput: string, 
        maxSteps: number, 
        sessionId?: string,
        options?: {
            savePromptPerStep?: boolean;
            promptSaveDir?: string;
            promptSaveFormat?: 'markdown' | 'json' | 'both';
        }
    ): Promise<void>;
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
    
    // 用户交互方法
    processUserInput(input: string, sessionId: string, conversationHistory?: Array<{
        id: string;
        role: 'user' | 'agent' | 'system';
        content: string;
        timestamp: number;
        metadata?: Record<string, any>;
    }>): Promise<void>;
    
    // 🆕 生命周期钩子（供子类扩展）
    beforeStart?(): Promise<void>;
    afterStop?(): Promise<void>;
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

// ===== Claude Code 专用接口扩展 =====

/**
 * Claude Code 风格的界面配置
 * 借鉴 ModularCLIClient 的配置驱动模式
 */
export interface ClaudeCodeUIConfig {
  // 布局配置
  layout: {
    showContextPanel: boolean;
    contextPanelWidth: number;
    inputAreaHeight: number;
    statusBarVisible: boolean;
    splitViewMode: 'horizontal' | 'vertical' | 'auto';
  };
  
  // 主题配置 (借鉴 DisplayConfig)
  theme: {
    mode: 'dark' | 'light' | 'auto';
    primaryColor: string;
    accentColor: string;
    enableAnimations: boolean;
  };
  
  // vim模式配置 (借鉴 EditorConfig)
  vim: {
    enabled: boolean;
    currentMode: 'normal' | 'insert' | 'command';
    showModeInStatus: boolean;
    keyBindings: Record<string, string>;
  };
  
  // 状态栏配置
  statusBar: {
    showExecutionMode: boolean;
    showContextInfo: boolean;
    showShortcuts: boolean;
    customMessages: string[];
    position: 'top' | 'bottom';
  };
  
  // 输入处理配置 (借鉴 InputProcessorConfig)
  input: {
    enableAutoComplete: boolean;
    enablePasteDetection: boolean;
    enableMultilineMode: boolean;
    historySize: number;
  };
}

/**
 * Claude Code 特有的界面状态
 */
export interface ClaudeCodeState {
  // 当前输入状态
  inputMode: 'normal' | 'vim_normal' | 'vim_insert' | 'vim_command';
  
  // 上下文信息
  contextInfo: {
    usagePercent: number;
    autoCompactThreshold: number;
    activeMemorySize: string;
    totalMessages: number;
  };
  
  // 界面显示状态
  uiState: {
    contextPanelVisible: boolean;
    commandPaletteVisible: boolean;
    historyPanelVisible: boolean;
    isProcessing: boolean;
  };
  
  // 自动接受编辑设置
  autoAcceptEdits: boolean;
  
  // 快捷键状态
  shortcuts: {
    enabled: boolean;
    customBindings: Record<string, string>;
  };
}

/**
 * Claude Code 专用的管理器接口
 * 借鉴 ModularCLIClient 的管理器分离模式
 */
export interface IClaudeCodeUIManager {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  
  // UI 状态管理
  updateUIConfig(config: Partial<ClaudeCodeUIConfig>): void;
  getUIConfig(): ClaudeCodeUIConfig;
  
  updateState(state: Partial<ClaudeCodeState>): void;
  getCurrentState(): ClaudeCodeState;
  
  // 组件控制
  showContextPanel(show: boolean): void;
  showCommandPalette(show: boolean): void;
  updateContextInfo(info: Partial<ClaudeCodeState['contextInfo']>): void;
}

export interface IClaudeCodeVimManager {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  
  // vim模式控制
  setVimMode(enabled: boolean): void;
  switchVimMode(mode: 'normal' | 'insert' | 'command'): void;
  getCurrentVimMode(): 'normal' | 'insert' | 'command';
  
  // 键盘处理
  handleVimKeypress(key: string, event: KeyboardEvent): boolean;
  getVimStatusText(): string;
}

export interface IClaudeCodeStatusManager {
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
  
  // 状态栏控制
  updateStatusMessage(message: string): void;
  setAutoAcceptEdits(enabled: boolean): void;
  updateExecutionMode(mode: 'auto' | 'manual' | 'supervised'): void;
  
  // 快捷键显示
  getAvailableShortcuts(): Array<{
    key: string;
    description: string;
    action: string;
  }>;
  
  // 上下文信息
  updateContextUsage(percent: number): void;
  updateMemoryInfo(info: string): void;
}

/**
 * 🎨 Claude Code 风格的交互层接口
 * 扩展标准 IInteractiveLayer，添加现代化UI特性
 * 借鉴 ModularCLIClient 的架构模式
 */
export interface IClaudeCodeLayer extends IInteractiveLayer {
  // 管理器访问 (借鉴 ModularCLIClient 的管理器访问模式)
  getUIManager(): IClaudeCodeUIManager;
  getVimManager(): IClaudeCodeVimManager;
  getStatusManager(): IClaudeCodeStatusManager;
  
  // Claude Code 特有方法
  getUIConfig(): ClaudeCodeUIConfig;
  updateUIConfig(config: Partial<ClaudeCodeUIConfig>): void;
  
  getCurrentState(): ClaudeCodeState;
  updateState(state: Partial<ClaudeCodeState>): void;
  
  // vim模式控制
  setVimMode(enabled: boolean): void;
  switchVimMode(mode: 'normal' | 'insert' | 'command'): void;
  
  // 界面元素控制
  showContextPanel(show: boolean): void;
  showCommandPalette(show: boolean): void;
  updateContextInfo(info: Partial<ClaudeCodeState['contextInfo']>): void;
  
  // 状态栏控制
  updateStatusMessage(message: string): void;
  setAutoAcceptEdits(enabled: boolean): void;
  
  // 快捷键和操作提示
  getAvailableShortcuts(): Array<{
    key: string;
    description: string;
    action: string;
  }>;
  
  // 主题控制
  setTheme(theme: 'dark' | 'light' | 'auto'): void;
  
  // 🆕 配置管理 (借鉴 ModularCLIClient)
  configure(config: ClaudeCodeLayerConfig): void;
  getConfig(): ClaudeCodeLayerConfig;
  
  // 🆕 生命周期管理
  restart(): Promise<void>;
  getStatus(): {
    isInitialized: boolean;
    isRunning: boolean;
    managersStatus: Record<string, boolean>;
  };
}

/**
 * Claude Code Layer 的配置接口
 * 借鉴 ModularCLIClient 的配置结构
 */
export interface ClaudeCodeLayerConfig {
  ui?: Partial<ClaudeCodeUIConfig>;
  vim?: {
    enabled?: boolean;
    keyBindings?: Record<string, string>;
  };
  statusBar?: {
    enabled?: boolean;
    showShortcuts?: boolean;
  };
  general?: {
    enableDebugMode?: boolean;
    logLevel?: 'debug' | 'info' | 'warn' | 'error';
    autoSave?: boolean;
  };
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

// ===== PromptProcessor 相关接口定义 =====

/**
 * 聊天消息类型，用于 PromptProcessor 的历史管理
 * @param role 消息角色
 * @param type 消息类型
 *      error: 错误消息
 *      message: 普通消息 包括用户输入的消息
 *      toolCall: 工具调用消息
 *      toolCallResult: 工具调用结果消息
 *      thinking: 思考消息 extractorResult 的 thinking 字段
 *      finalAnswer: 最终答案消息 extractorResult 的 finalAnswer 字段,代表用户回复的消息
 * @param step 因为当前的系统是multi-step的，所以step 越小代表该Message越老，step 越大代表该Message越新
 * @param content 消息内容
 * @param timestamp 消息时间戳
 */
export interface ChatMessage {
    role: 'user' | 'agent' | 'system';
    type?: 'error' | 'message' | 'toolCallResult' | 'thinking' | 'finalAnswer' ;
    step: number;
    content: string;
    timestamp: string;
}

/**
 * Agent 步骤类型，用于 PromptProcessor 的步骤处理
 */
export interface AgentStep<T extends StandardExtractorResult = StandardExtractorResult> {
    stepIndex: number;
    rawText?: string;
    extractorResult?: T;
    error?: string;
    toolCalls?: Array<{
        name: string;
        call_id: string;
        params: any;
    }>;
    toolCallResults?: Array<{
        name: string;
        call_id: string;
        params: any;
        status: 'pending' | 'succeed' | 'failed';
        result?: any;
        message?: string;
        executionTime?: number; // 毫秒
    }>;
}

/**
 * PromptProcessor 的提取器结果基础接口
 */
export interface ExtractorResult {
    finalAnswer?: string;
}

/**
 * 标准提取器结果，包含思考和最终答案
 */
export interface StandardExtractorResult extends ExtractorResult {
    thinking?: string;
    finalAnswer?: string;
}

/**
 * PromptProcessor 抽象基类接口
 * 用于管理 Agent 的 prompt 生成、历史记录和步骤处理
 */
export interface IPromptProcessor<TExtractorResult extends ExtractorResult> {
    // 基础属性
    systemPrompt: string;
    currentPrompt: string;
    chatHistory: ChatMessage[];
    finalAnswer: string | null;
    
    // 工具调用控制
    enableToolCallsForStep: (stepIndex: number) => boolean;
    setEnableToolCallsForStep(enableToolCallsForStep: (stepIndex: number) => boolean): void;
    
    // 核心抽象方法
    textExtractor(responseText: string): TExtractorResult;
    renderExtractorResultToPrompt(extractorResult: TExtractorResult, stepIndex: number): void;
    renderChatMessageToPrompt(messages: ChatMessage[]): void;
    renderToolCallToPrompt(toolResults: AgentStep['toolCallResults'], stepIndex: number): void;
    formatPrompt(stepIndex: number): string | Promise<string>;
    
    // 上下文管理
    getChatHistory(): ChatMessage[];

    // 重置PromptProcessor
    resetPromptProcessor(): void; 

    // 最终答案管理
    resetFinalAnswer(): void;
    setFinalAnswer(finalAnswer: string): void;
    getFinalAnswer(): string | null;
    
    // 步骤结果处理
    processStepResult(step: AgentStep): void;

    /**
     * 获取步骤 prompts，支持范围过滤
     * @param stepRange 可选的步骤范围 { start: number, end: number }
     * @returns 步骤 prompts 数组
     */
    getStepPrompts(stepRange?: { start: number; end: number }): string[];

    /**
     * 更新 system prompt
     * @param newSystemPrompt 新的 system prompt
     */
    updateSystemPrompt(newSystemPrompt: string): void;
}

/**
 * PromptProcessor 抽象基类
 * 提供基础实现，子类需要实现抽象方法
 */
export abstract class BasePromptProcessor<TExtractorResult extends ExtractorResult> 
    implements IPromptProcessor<TExtractorResult> {
    
    systemPrompt: string = '';
    currentPrompt: string = '';
    chatHistory: ChatMessage[] = [];
    finalAnswer: string | null = null;
    enableToolCallsForStep: (stepIndex: number) => boolean = () => true;

    setEnableToolCallsForStep(enableToolCallsForStep: (stepIndex: number) => boolean): void {
        this.enableToolCallsForStep = enableToolCallsForStep;
    }

    abstract textExtractor(responseText: string): TExtractorResult;
    abstract renderExtractorResultToPrompt(extractorResult: TExtractorResult, stepIndex: number): void;
    abstract renderChatMessageToPrompt(messages: ChatMessage[]): void;
    abstract renderToolCallToPrompt(toolResults: AgentStep['toolCallResults'], stepIndex: number): void;
    abstract formatPrompt(stepIndex: number): string | Promise<string>;

    /**
     * 获取指定步骤的 prompt
     * @param stepIndex 步骤索引
     * @returns 指定步骤的 prompt 字符串
     */
    abstract getPrompt(stepIndex: number): string | Promise<string>;

    /**
     * 获取步骤 prompts，支持范围过滤
     * @param stepRange 可选的步骤范围 { start: number, end: number }
     * @returns 步骤 prompts 数组
     */
    abstract getStepPrompts(stepRange?: { start: number; end: number }): string[];

    resetFinalAnswer(): void {
        this.finalAnswer = null;
    }
    
    setFinalAnswer(finalAnswer: string): void {
        this.finalAnswer = finalAnswer;
    }
    
    getFinalAnswer(): string | null {
        return this.finalAnswer;
    }

    processStepResult(step: AgentStep): void {
        const extractorResult = this.textExtractor(step.rawText || '');
        if (extractorResult) {
            this.renderExtractorResultToPrompt(extractorResult, step.stepIndex);
            if (extractorResult.finalAnswer) {
                this.setFinalAnswer(extractorResult.finalAnswer);
            }
        }
        this.renderToolCallToPrompt(step.toolCallResults || [], step.stepIndex);
    }

    /**
     * 更新 system prompt
     * @param newSystemPrompt 新的 system prompt
     */
    updateSystemPrompt(newSystemPrompt: string): void {
        this.systemPrompt = newSystemPrompt;
    }

    getChatHistory(): ChatMessage[] {
        return this.chatHistory;
    }

    // reset除了systemPrompt之外的属性
    resetPromptProcessor(): void {
        this.chatHistory = [];
        this.finalAnswer = null;
        this.enableToolCallsForStep = () => true;
        this.currentPrompt = '';
    }
}

/**
 * 工具调用执行结果接口，用于 PromptProcessor
 */
export interface ToolExecutionResult {
    name: string;
    call_id: string;
    params: any;
    status: 'pending' | 'succeed' | 'failed';
    result?: any;
    message?: string;
}

// 🆕 会话状态管理相关接口

/**
 * 聊天上下文 - 重命名自 chatMessagesHistory，支持智能压缩
 */
export interface ChatContext {
  // 完整历史记录（用于分析和压缩）
  fullHistory: ChatMessage[];
  
  // 优化后的上下文（实际用于 prompt 生成）
  optimizedContext: ChatMessage[];
  
  // 压缩摘要
  historySummaries: ContextSummary[];
  
  // 元数据
  totalMessages: number;
  compressionRatio: number;
  lastOptimizedAt: number;
}

/**
 * 上下文摘要结构
 */
export interface ContextSummary {
  stepRange: { start: number; end: number };
  messageCount: number;
  summary: string;
  keyTopics: string[];
  importantDecisions: string[];
  toolUsageSummary: Record<string, number>;
  timestamp: number;
}

/**
 * 压缩策略函数接口
 */
export interface CompressionStrategy {
  // 判断是否需要压缩
  shouldCompress(chatContext: ChatContext): boolean;
  
  // 执行压缩
  compress(chatContext: ChatContext): Promise<ChatContext>;
  
  // 压缩配置
  config: {
    maxFullHistorySize: number;
    maxOptimizedContextSize: number;
    recentStepsWindow: number;
    summaryBatchSize: number;
    preserveImportantSteps: boolean;
  };
}

export type AgentStorage = {
    // 基础信息
  sessionId: string;
  agentId: string;
  userId?: string;
  
  // 执行状态
  currentStep: number;
  agentSteps: AgentStep<any>[];

  // 上下文信息
  contexts?: IRAGEnabledContext<any>[];
  
  // 智能压缩的聊天上下文
  chatContext?: ChatContext;
  
  // Token 使用统计
  totalTokensUsed: number;
  
  // 会话元数据
  sessionStartTime: number;
  lastActiveTime: number;
}

/**
 * 会话管理器回调接口 - 用于解耦
 */
export interface ISessionManagerCallbacks {
    onSessionStart?: (sessionId: string) => void;
    onSessionEnd?: (sessionId: string) => void;
    onAgentStep?: (step: AgentStep<any>) => void;
    onToolCall?: (toolCall: ToolCallParams) => void;
    onToolCallResult?: (result: ToolExecutionResult) => void;
}

/**
 * 简化的会话管理器接口 - 只负责状态存储，使用回调解耦
 */
export interface ISessionManager {
    // 关联的Agent
    agent: IAgent;
    
    // 设置回调
    setCallbacks(callbacks: ISessionManagerCallbacks): void;
    
    // 核心消息处理
    sendMessageToAgent(message: string, maxSteps: number, sessionId: string): Promise<string>;
    
    // 核心状态管理
    loadSession(sessionId: string): Promise<AgentStorage | null>;
    saveSession(sessionId: string, state: AgentStorage): Promise<void>;
    
    // 简单的生命周期
    createSession(userId?: string, agentId?: string): string;
    archiveSession(sessionId: string): Promise<void>;
    
    // 获取会话列表
    getActiveSessions(): string[];
    getSessionCount(): number;
}

/**
 * 客户端接口 - 使用依赖注入模式
 */
export interface IClient {
    name: string;
    currentSessionId?: string;
    
    // 依赖注入的会话管理器
    sessionManager?: ISessionManager;
    
    // 设置会话管理器
    setSessionManager(sessionManager: ISessionManager): void;
    
    // 处理Agent的回调事件
    handleAgentStep(step: AgentStep<any>): void;
    handleToolCall(toolCall: ToolCallParams): void;
    handleToolCallResult(result: ToolExecutionResult): void;

    // 简化的方法签名 - 不需要传递sessionManager参数
    sendMessageToAgent(message: string): Promise<void>;
    newSession(): void;
}