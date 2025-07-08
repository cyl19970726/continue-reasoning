import { z } from 'zod';
import { IRAG, QueryOptions, RAGResult } from './memory.js';
import { PromptCtx, PromptAssemblyStrategy } from './prompt.js';
import { ToolSet, ToolExecutionResult } from './tool.js';
import { IAgent } from './agent.js';

export interface IContext<T extends z.ZodObject<any>>{
    id: string;
    /**
     * A concise description of this context's purpose, functionality, boundaries and usage scenarios.
     * 
     * This description appears in the system prompt's <context name="..."> block header,
     * helping the LLM understand the purpose and capabilities of this context.
     */
    description: string;
    dataSchema: T;
    data: z.infer<T>;

    /**
     * MCP server configuration, defined directly in Context rather than loaded from config files.
     * Each Context can associate with one or more MCP servers, and these servers' tools will be automatically injected into the Context's toolSet.
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
     */
    toolSet: () => ToolSet | ToolSet[];
    
    /**
     * Optional method to handle tool call results.
     * Allows the context to react to tool execution results.
     */
    onToolCall?: (toolCallResult: ToolExecutionResult) => void;
    
    /**
     * Generates the prompt content for this context.
     * 
     * The method can return either:
     * 1. A traditional string (legacy format) for backward compatibility
     * 2. A PromptCtx structure for the thinking system
     */
    renderPrompt: () => string | PromptCtx | Promise<string | PromptCtx>;
}

// RAG-enabled Context interface
export interface IRAGEnabledContext <T extends z.ZodObject<any>> extends IContext<T> {
    // RAG instances associated with this Context
    rags?: Record<string, IRAG>;
    
    // Register RAG instance
    registerRAG?: (ragId: string, rag: IRAG)=> void;
    
    // Query RAG using Context-related conditions
    queryContextRAG?: (ragId: string, query: string, options?: QueryOptions)=> Promise<RAGResult[]>;
    
    // Load relevant RAG data when rendering prompt
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

export interface IContextManager{
    contexts: AnyRAGEnableContext[];
    registerContext<T extends z.ZodObject<any>>(context: IRAGEnabledContext<T> ): void;
    findContextById: (id: string) => AnyRAGEnableContext;
    renderPrompt: () => string | Promise<string>;
    contextList: () => AnyRAGEnableContext[];
    
    /**
     * Centrally manage MCP server installation for all Contexts
     * Iterate through all Contexts, call their install methods, and handle installation results
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
     * Render structured PromptCtx
     * Collect all Context's PromptCtx and assemble them according to specified strategy
     */
    renderStructuredPrompt?: (strategy?: PromptAssemblyStrategy) => Promise<PromptCtx> | PromptCtx;

    /**
     * Set prompt assembly strategy
     */
    setPromptAssemblyStrategy?: (strategy: PromptAssemblyStrategy) => void;

    /**
     * Get current prompt assembly strategy
     */
    getPromptAssemblyStrategy?: () => PromptAssemblyStrategy;
} 