import { SupportedModel } from "../models/index.js";
import { logger } from "../utils/logger.js";
import { IContextManager } from './context.js';
import { ITaskQueue, ToolSet, AnyTool, ToolCallDefinition, ToolCallParams, ToolExecutionResult } from './tool.js';
import { AgentStep } from './prompt.js';
import { AgentStatus, ChatMessage } from './base.js';
import { BasePromptProcessor } from './base-prompt-processor.js';

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

// AgentCallbacks removed - replaced by Event Bus architecture

/**
 * 🤖 Agent Interface - Core Task Processor
 * Responsibility: Task understanding, tool calling, thinking and reasoning
 * 
 * 🆕 Uses EventBus for decoupled communication with Client
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

    // Event Bus for event-driven architecture
    eventBus: import('../event-bus/index.js').IEventBus;

    getEventBus(): import('../event-bus/index.js').IEventBus;

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
import { IRAGEnabledContext } from './context.js'; 