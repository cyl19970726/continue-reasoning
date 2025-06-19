import { SupportedModel } from "../models";
import { logger } from "../utils/logger";
import { IContextManager } from './context';
import { ITaskQueue, ToolSet, AnyTool, ToolCallDefinition, ToolCallParams, ToolExecutionResult } from './tool';
import { AgentStep } from './prompt';
import { AgentStatus, ChatMessage } from './base';
import { BasePromptProcessor } from './prompt';

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
    onSessionStart?: (sessionId: string) => void;
    onSessionEnd?: (sessionId: string) => void;
    onAgentStep?: (step: AgentStep<any>) => void;
    onStateStorage?: (state: AgentStorage) => void;
    loadAgentStorage: (sessionId: string) => Promise<AgentStorage | null>;
    onToolCall?: (toolCall: ToolCallParams) => void;
    onToolCallResult?: (result: ToolExecutionResult) => void;
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
    
    // Execution mode management
    getExecutionMode(): 'auto' | 'manual' | 'supervised';
    setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void>;
    
    // User interaction methods
    processUserInput(input: string, sessionId: string, conversationHistory?: Array<{
        id: string;
        role: 'user' | 'agent' | 'system';
        content: string;
        timestamp: number;
        metadata?: Record<string, any>;
    }>): Promise<void>;
    
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
    beforeStart?(): Promise<void>;
    afterStop?(): Promise<void>;
}

/**
 * LLM interface supporting mainstream LLM models like openai, anthropic, google, etc. and also support streaming output
 */
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

// Import forward references
import { IRAGEnabledContext } from './context'; 