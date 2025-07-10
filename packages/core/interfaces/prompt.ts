import { logger } from '../utils/logger.js';
import { ChatMessage, AgentStatus, MessageType } from './base.js';
import { IContextManager } from './context.js';
import { ToolExecutionResult } from './tool.js';

/**
 * Base extractor result interface
 */
export interface ExtractorResult {
    stopSignal?: boolean;
}

/**
 * Standard extractor result with thinking and stop signal
 */
export interface StandardExtractorResult extends ExtractorResult {
    thinking?: string;      // Thinking content
    stopSignal?: boolean;   // Stop signal to end execution
    response?: string;      // Response content
}

/**
 * Enhanced thinking extractor result with structured content
 * Pure enhanced thinking interface without standard mode compatibility
 */
export interface EnhancedThinkingExtractorResult extends ExtractorResult {
    // Structured thinking content
    analysis?: string;        // Analysis content
    plan?: string;           // Plan content  
    reasoning?: string;      // Reasoning content
    
    // Interactive content
    response?: string;       // Interactive response with user
    stopSignal?: boolean;    // Stop signal to end execution
}

/**
 * Recursive extractor result - supports nested structures with type extraction
 */
export interface RecursiveExtractorResult extends ExtractorResult {
    [key: string]: any | {
        text?: string;
        type?: string;       // Type attribute from XML
        value?: any;         // Parsed typed value
        [nestedKey: string]: any;
    };
}

/**
 * Enhanced thinking extractor result with full recursive structure
 */
export interface EnhancedThinkingRecursiveResult extends RecursiveExtractorResult {
    think?: {
        text?: string;
        analysis?: { text?: string };
        plan?: { text?: string };
        reasoning?: { text?: string };
    };
    interactive?: {
        text?: string;
        response?: { text?: string };
        stop_signal?: { 
            text?: string; 
            type?: string; 
            value?: boolean; 
        };
    };
    stopSignal?: boolean; // Inherited from base interface
}

/**
 * Custom extractor result (extensible for future use)
 */
export interface CustomExtractorResult extends RecursiveExtractorResult {
    // Reserved for custom implementations
    [customKey: string]: any;
}

/**
 * Agent step type for PromptProcessor step processing
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
    toolExecutionResults?: ToolExecutionResult[];
}

/**
 * PromptProcessor abstract base interface
 * Used to manage Agent's prompt generation, history and step processing
 */
export interface IPromptProcessor<TExtractorResult extends ExtractorResult> {
    // Basic properties
    systemPrompt: string;
    currentPrompt: string;
    stopSignal: boolean | null;
    
    // Tool call control
    enableToolCallsForStep: (stepIndex: number) => boolean;
    setEnableToolCallsForStep(enableToolCallsForStep: (stepIndex: number) => boolean): void;
    
    // Core abstract methods
    textExtractor(responseText: string): TExtractorResult;
    renderExtractorResultToPrompt(extractorResult: TExtractorResult, stepIndex: number): void;
    renderChatMessageToPrompt(messages: ChatMessage[]): void;
    renderToolCallToPrompt(toolResults: AgentStep['toolExecutionResults'], stepIndex: number): void;
    formatPrompt(stepIndex: number): string | Promise<string>;
    
    // Context management
    getChatHistory(): ChatMessage[];
    getChatHistoryManager(): IChatHistoryManager;

    // Reset PromptProcessor
    resetPromptProcessor(): void; 

    // Stop signal management (replaces final answer methods)
    resetStopSignal(): void;
    setStopSignal(stopSignal: boolean): void;
    getStopSignal(): boolean | null;
    
    // Step result processing
    processStepResult(step: AgentStep): void;

    /**
     * Get step prompts with optional range filtering
     * @param stepRange Optional step range { start: number, end: number }
     * @returns Array of step prompts
     */
    getStepPrompts(stepRange?: { start: number; end: number }): string[];

    /**
     * Update system prompt
     * @param newSystemPrompt New system prompt
     */
    updateSystemPrompt(newSystemPrompt: string): void;
}

/**
 * Enhanced PromptProcessor interface
 * Focused purely on enhanced thinking mode with structured content
 */
export interface IEnhancedPromptProcessor<TExtractorResult extends ExtractorResult> 
    extends IPromptProcessor<TExtractorResult> {
    
    // Thinking mode control (enhanced or custom only)
    thinkingMode: 'enhanced' | 'custom';
    setThinkingMode(mode: 'enhanced' | 'custom'): void;
    
    // Structured content extraction
    extractStructuredThinking(responseText: string): {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    };
    
    extractInteractiveContent(responseText: string): {
        response?: string;
        stopSignal?: boolean;
    };
    
    // Segmented rendering support
    renderThinkingToPrompt(thinking: {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    }, stepIndex: number): void;
    
    renderInteractiveToPrompt(interactive: {
        response?: string;
        stopSignal?: boolean;
    }, stepIndex: number): void;
}

/**
 * Chat history configuration interface
 * Controls how many steps to keep for each message type
 */
export interface ChatHistoryConfig {
    [MessageType.MESSAGE]: number;        // Keep last n steps for regular messages
    [MessageType.TOOL_CALL]: number;      // Keep last n steps for tool calls  
    [MessageType.ERROR]: number;          // Keep last n steps for errors
    [MessageType.THINKING]: number;       // Keep last n steps for thinking messages
    [MessageType.ANALYSIS]: number;       // Keep last n steps for analysis messages
    [MessageType.PLAN]: number;           // Keep last n steps for plan messages
    [MessageType.REASONING]: number;      // Keep last n steps for reasoning messages
    [MessageType.INTERACTIVE]: number;    // Keep last n steps for interactive messages
    [MessageType.RESPONSE]: number;       // Keep last n steps for response messages
    [MessageType.STOP_SIGNAL]: number;    // Keep last n steps for stop signal messages
}

/**
 * Chat history manager interface
 * Manages chat history storage, filtering, and exclusion
 */
export interface IChatHistoryManager {
    // Configuration methods
    setConfig(config: Partial<ChatHistoryConfig>): void;
    getConfig(): ChatHistoryConfig;
    updateTypeConfig(messageType: MessageType, keepSteps: number): void;
    
    // Message management methods
    addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): void;
    addCompleteMessage(message: ChatMessage): void;
    getChatHistory(): ChatMessage[];
    clearChatHistory(): void;
    
    // Exclusion methods
    excludeChatHistory(id: string): void;
    excludeChatHistoryBatch(ids: string[]): void;
    
    // Filtering methods
    getFilteredChatHistory(currentStep: number): ChatMessage[];
}

/**
 * Prompt context structure for thinking system
 */
export interface PromptCtx {
    workflow: string;    // Workflow description
    status: string;      // Current status information
    guideline: string;   // Guidelines
    examples: string;    // Usage examples
}

/**
 * Prompt assembly strategy
 */
export type PromptAssemblyStrategy = 
    | 'grouped'         // Group by type: all workflow together, all status together, etc.
    | 'priority'        // Sort by priority, fully preserve each context structure
    | 'context_first'   // Maintain each context's integrity, group by context
    | 'minimal'         // Keep only key information, simplified output
    | 'custom';         // Custom assembly logic 