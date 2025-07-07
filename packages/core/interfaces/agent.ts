import { SupportedModel } from "../models";
import { logger } from "../utils/logger";
import { IContextManager } from './context';
import { ITaskQueue, ToolSet, AnyTool, ToolCallDefinition, ToolCallParams, ToolExecutionResult } from './tool';
import { AgentStep } from './prompt';
import { AgentStatus, ChatMessage } from './base';
import { BasePromptProcessor } from './base-prompt-processor';

/**
 * Agent storage type - Basic information for session persistence
 */
export type AgentStorage = {
    // Basic information
    sessionId: string;
    agentId: string;
    userId?: string;
    
    // Execution state
    currentStep: number;
    agentSteps: AgentStep<any>[];

    // Context information
    contexts?: IRAGEnabledContext<any>[];
    
    // Token usage statistics
    totalTokensUsed: number;
    
    // Session metadata
    sessionStartTime: number;
    lastActiveTime: number;
};

export interface AgentCallbacks {
    // Session management
    onSessionStart?: (sessionId: string) => void;
    onSessionEnd?: (sessionId: string) => void;
    onAgentStep?: (step: AgentStep<any>) => void;
    onStateStorage?: (state: AgentStorage) => void;
    loadAgentStorage: (sessionId: string) => Promise<AgentStorage | null>;
    
    // Tool execution callbacks (actual tool execution, not LLM tool calls)
    onToolCallStart?: (toolCall: ToolCallParams) => void;
    onToolCallDone?: (toolCall: ToolCallParams) => void;
    onToolExecutionStart?:(toolCall: ToolCallParams) => void;
    onToolExecutionEnd?: (result: ToolExecutionResult) => void;
    
    // LLM content callbacks
    onLLMTextDelta?: (stepIndex: number,chunkIndex: number, delta: string) => void;
    onLLMTextDone?: (stepIndex: number,chunkIndex: number, text: string) => void;  
    
    onError?: (error:any) => void;
}

/**
 * 🤖 Agent Interface - Core Task Processor
 * Responsibility: Task understanding, tool calling, thinking and reasoning
 */
export interface IAgent{
    // Basic properties
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    
    // Core components
    contextManager: IContextManager;
    llm: ILLM; 
    taskQueue: ITaskQueue;
    
    // 🆕 PromptProcessor - now uses base interface for flexibility
    promptProcessor: BasePromptProcessor<any>;
    
    // Tools and configuration
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
    
    // Context collection
    contexts: IRAGEnabledContext<any>[];

    // callbacks
    callbacks?: AgentCallbacks;

    setCallBacks(callbacks:AgentCallbacks): void;

    // Core lifecycle methods
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

    // Tool set management
    listToolSets(): ToolSet[];
    addToolSet(toolSet: ToolSet): void;
    activateToolSets(toolSetNames: string[]): void;
    deactivateToolSets(toolSetNames: string[]): void;
    getActiveTools(): AnyTool[];
    
    // 🆕 PromptProcessor management methods
    getPromptProcessor(): BasePromptProcessor<any>;
    setPromptProcessor(processor: BasePromptProcessor<any>): void;
    resetPromptProcessor(): void;
    setEnableToolCallsForStep(enableFn: (stepIndex: number) => boolean): void;
    getPromptProcessorStats(): {
        totalMessages: number;
        currentStep: number;
        hasFinalAnswer: boolean;
        finalAnswer: string | null;
    };
    
    // 🆕 Lifecycle hooks (for subclass extension)
    changeState(newState: AgentStatus, reason?: string): Promise<void>;
    beforeStart?(): Promise<void>;
    afterStop?(): Promise<void>;
}

/**
 * Basic LLM event types for non-streaming responses
 */
export interface LLMEvent {
    type: 'start' | 'text' | 'tool_call' | 'complete' | 'error';
    // For 'text' event
    text?: string;
    // For 'tool_call' event
    toolCall?: {
        id: string;
        name: string;
        arguments: any;
    };
    // For 'error' event
    error?: Error;
}

/**
 * Streaming-specific LLM event types
 * Extends basic events with delta/incremental updates
 */
export interface LLMStreamEvent {
    type: 'stream_start' | 'text_delta' | 'tool_call_start' | 'tool_call_delta' | 'tool_call_complete' | 'stream_end' | 'error' | 'ping' | 'content_block_start' | 'content_block_stop' | 'chunk';
    
    // For text_delta events
    text?: string;
    
    // For tool call events
    toolCall?: {
        id: string;
        name?: string;
        argumentsDelta?: string;  // Incremental JSON fragments
        argumentsComplete?: string;  // Complete JSON string
        parsedArguments?: any;  // Parsed arguments object
    };
    
    // For error events
    error?: Error;
    
    // For content block events (Anthropic)
    contentBlock?: {
        type: string;  // 'text', 'tool_use', etc.
        index: number;
    };
    
    // Provider-specific metadata
    index?: number;  // Content block index
    raw?: any;  // Raw provider event for debugging
    
    // For generic chunk events (when we don't know the specific type)
    chunk?: any;
}

/**
 * Unified callbacks for both streaming and non-streaming LLM calls
 * Uses convenience methods instead of event objects for better ergonomics
 */
export interface LLMCallbacks {
    // Lifecycle callbacks
    onStart?: () => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;

    onChunkStart: (chunkIndex: number, chunkData?: any) => void;
    onChunkComplete: (chunkIndex: number, chunkData?: any) => void;
    
    // Content callbacks
    // Streaming-specific callbacks (only called during streaming)
    onTextDone?: (chunkIndex: number, text: string) => void;  // text done for one chunk
    onTextDelta?: (chunkIndex: number, delta: string) => void;  // Incremental text for one chunk 
    onText?: (text: string) => void; // use for call and stream call (stream call need to collect all the chunk text)

    onToolCallStart?: (chunkIndex: number,toolCall: { id: string; name: string }) => void;
    onToolCallDelta?: (chunkIndex: number,toolCall: { id: string; delta: string }) => void;  // Incremental tool arguments
    onToolCallDone?: (chunkIndex: number,toolCall: { id: string; name: string; arguments: any }) => void;  // both use for call and streamCall
}

/**
 * Extended LLM callbacks that support parallel tool execution
 * Includes additional callbacks for tool execution lifecycle
 */
export interface LLMCallbacksWithToolExecution extends LLMCallbacks {
    // Tool execution callbacks (when parallel execution is enabled)
    onToolExecutionStart?: (toolCall: { id: string; name: string; priority?: number }) => void;
    onToolExecutionComplete?: (result: ToolExecutionResult) => void;
    onToolExecutionError?: (toolCall: { id: string; name: string }, error: Error) => void;
    
    // Batch tool execution callbacks
    onBatchToolExecutionStart?: (toolCalls: { id: string; name: string }[], parallel: boolean) => void;
    onBatchToolExecutionComplete?: (results: ToolExecutionResult[]) => void;
}

/**
 * LLM流式数据块类型
 */
export type LLMStreamChunk = 
  | { type: 'text-delta'; content: string; outputIndex?: number; stepIndex?: number; chunkIndex?: number } 
  | { type: 'text-done'; content: string; stepIndex?: number; chunkIndex?: number } 
  | { type: 'tool-call-start'; toolCall: ToolCallParams; stepIndex?: number }
  | { type: 'tool-call-done'; toolCall: ToolCallParams; result: any; stepIndex?: number }
  | { type: 'tool-call-error'; toolCall: ToolCallParams; error: Error; stepIndex?: number }
  | { type: 'thinking-start'; stepIndex?: number }
  | { type: 'thinking-progress'; thought: string; confidence?: number; stepIndex?: number }
  | { type: 'thinking-complete'; finalThought: string; stepIndex?: number }
  | { type: 'step-start'; stepIndex: number }
  | { type: 'step-complete'; stepIndex: number; result: any }
  | { type: 'error'; errorCode: string; message: string,  stepIndex?: number }

/**
 * LLM interface supporting mainstream LLM models like openai, anthropic, google, etc. and also support streaming output
 * 仅支持新的stream模式
 */
export interface ILLM{
    model: SupportedModel;
    streaming: boolean;
    parallelToolCall: boolean;
    temperature: number;
    maxTokens: number;
    setParallelToolCall?: (enabled: boolean) => void;
    
    // 新的stream方法（必须实现）
    callStream: (messages: string, tools: ToolCallDefinition[], options?: { stepIndex?: number }) => AsyncIterable<LLMStreamChunk>;
    callAsync: (messages: string, tools: ToolCallDefinition[], options?: { stepIndex?: number }) => Promise<{ text: string; toolCalls?: ToolCallParams[] }>;
    
    // 可选的传统调用方法（向后兼容）
    call?: (messages: string, tools: ToolCallDefinition[], options?: { stepIndex?: number }) => Promise<{ text: string; toolCalls?: ToolCallParams[] }>;
}

// Import forward references
import { IRAGEnabledContext } from './context'; 