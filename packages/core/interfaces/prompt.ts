import { logger } from '../utils/logger';
import { ChatMessage, AgentStatus, MessageType } from './base';
import { IContextManager } from './context';

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
    toolCallResults?: Array<{
        name: string;
        call_id: string;
        params: any;
        status: 'pending' | 'succeed' | 'failed';
        result?: any;
        message?: string;
        executionTime?: number; // milliseconds
    }>;
}

/**
 * PromptProcessor abstract base interface
 * Used to manage Agent's prompt generation, history and step processing
 */
export interface IPromptProcessor<TExtractorResult extends ExtractorResult> {
    // Basic properties
    systemPrompt: string;
    currentPrompt: string;
    chatHistory: ChatMessage[];
    stopSignal: boolean | null;
    
    // Tool call control
    enableToolCallsForStep: (stepIndex: number) => boolean;
    setEnableToolCallsForStep(enableToolCallsForStep: (stepIndex: number) => boolean): void;
    
    // Core abstract methods
    textExtractor(responseText: string): TExtractorResult;
    renderExtractorResultToPrompt(extractorResult: TExtractorResult, stepIndex: number): void;
    renderChatMessageToPrompt(messages: ChatMessage[]): void;
    renderToolCallToPrompt(toolResults: AgentStep['toolCallResults'], stepIndex: number): void;
    formatPrompt(stepIndex: number): string | Promise<string>;
    
    // Context management
    getChatHistory(): ChatMessage[];

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
 * PromptProcessor abstract base
 * Provides basic implementation, subclasses need to implement abstract methods
 */
export abstract class BasePromptProcessor<TExtractorResult extends ExtractorResult> 
    implements IPromptProcessor<TExtractorResult> {
    type: 'standard' | 'enhanced';
    systemPrompt: string = '';
    currentPrompt: string = '';
    chatHistory: ChatMessage[] = [];
    stopSignal: boolean | null = null;

    constructor(type: 'standard' | 'enhanced') {
        this.type = type;
    }

    enableToolCallsForStep: (stepIndex: number) => boolean = () => true;
    
    // Enhanced base functionality
    stepPrompts: string[] = [];
    protected contextManager?: IContextManager;

    setEnableToolCallsForStep(enableToolCallsForStep: (stepIndex: number) => boolean): void {
        this.enableToolCallsForStep = enableToolCallsForStep;
    }

    // Abstract methods that subclasses must implement
    abstract textExtractor(responseText: string): TExtractorResult;
    abstract renderExtractorResultToPrompt(extractorResult: TExtractorResult, stepIndex: number): void;
    /**
     * Render chat messages to prompt
     */
    renderChatMessageToPrompt(messages: ChatMessage[]): void {
        messages.forEach(message => {
            if (!message.type) {
                message.type = MessageType.MESSAGE;
            }
            this.chatHistory.push(message);
        });
    }
        
    /**
     * Render tool call results to prompt
     */

    renderToolCallToPrompt(toolResults: AgentStep['toolCallResults'], stepIndex: number): void {
            if (!toolResults || toolResults.length === 0) {
                return;
            }
            
            const toolResultsText = toolResults.map(result => 
                `<tool_call_result name="${result.name}" call_id="${result.call_id}">
    params=${JSON.stringify(result.params)} 
    result=${JSON.stringify(result.result)} 
    status=${result.status} 
    message=${result.message || ''}
    </tool_call_result>`
            ).join('\n');
    
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.TOOL_CALL,
                content: toolResultsText,
                timestamp: new Date().toISOString()
            });
        }
        
    /**
     * Reset stop signal
     */
    setStopSignal(stopSignal: boolean): void {
        this.stopSignal = stopSignal;
    }

    getStopSignal(): boolean | null {
        return this.stopSignal;
    }

    resetStopSignal(): void {
        this.stopSignal = null;
    }

    processStepResult(step: AgentStep): void {
        if (step.extractorResult) {
            this.renderExtractorResultToPrompt(step.extractorResult as TExtractorResult, step.stepIndex);
        }
        
        if (step.toolCallResults) {
            this.renderToolCallToPrompt(step.toolCallResults, step.stepIndex);
        }
    }

    updateSystemPrompt(newSystemPrompt: string): void {
        this.systemPrompt = newSystemPrompt;
    }

    getChatHistory(): ChatMessage[] {
        return this.chatHistory;
    }

    resetPromptProcessor(): void {
        this.chatHistory = [];
        this.stopSignal = null;
        this.currentPrompt = '';
        this.stepPrompts = [];
    }

    /**
     * Set context manager (for dynamic injection)
     */
    setContextManager(contextManager: IContextManager): void {
        this.contextManager = contextManager;
    }

    /**
     * Get current prompt
     */
    getCurrentPrompt(): string {
        return this.currentPrompt;
    }

      /**
     * Format final prompt with context manager integration
     */
      async formatPrompt(stepIndex: number): Promise<string> {
        let prompt = '';
        
        // 1. Add system prompt
        if (this.systemPrompt) {
            prompt += `${this.systemPrompt}\n\n`;
        }
        
        // 2. Add dynamic Context information (using ContextManager)
        if (this.contextManager) {
            try {
                if (this.contextManager.renderStructuredPrompt) {
                    const structuredPrompt = await this.contextManager.renderStructuredPrompt();
                    prompt += this.formatStructuredPrompt(structuredPrompt);
                } else {
                    // Fallback to basic context rendering
                    const contextPrompt = await this.contextManager.renderPrompt();
                    prompt += contextPrompt + '\n\n';
                }
            } catch (error) {
                logger.error('Failed to render context prompt:', error);
            }
        }
        
        // 3. ExecutionHistory (ChatHistory List)
        if (this.chatHistory.length > 0) {
            prompt += '\n## Chat History List\n';
            this.chatHistory.forEach(message => {
                prompt += `
<chat_history>
role: ${message.role}
step: ${message.step}
type: ${message.type}
content: ${message.content}
timestamp: ${message.timestamp}
</chat_history>
`;
            });
        }

        // Add current step indicator
        prompt += `\n## Current Step: ${stepIndex}\n\n`;
        
        
        this.stepPrompts.push(prompt);
        this.currentPrompt = prompt;
        return prompt;
    }

    /**
     * Get specific step prompt
     */
    getPrompt(stepIndex: number): string | Promise<string> {
        if (stepIndex < 0 || stepIndex >= this.stepPrompts.length) {
            throw new Error(`Step index ${stepIndex} is out of range (available: 0-${this.stepPrompts.length - 1})`);
        }
        return this.stepPrompts[stepIndex];
    }

    getStepPrompts(stepRange?: { start: number; end: number }): string[] {
        if (!stepRange) {
            return [...this.stepPrompts];
        }
        
        const { start, end } = stepRange;
        
        if (start < 0 || end < 0) {
            throw new Error('Step range start and end must be non-negative');
        }
        if (start > end) {
            throw new Error('Step range start must be less than or equal to end');
        }
        if (start >= this.stepPrompts.length) {
            throw new Error(`Step range start ${start} is out of range (available: 0-${this.stepPrompts.length - 1})`);
        }

        const adjustedEnd = Math.min(end, this.stepPrompts.length - 1);
        
        return this.stepPrompts.slice(start, adjustedEnd + 1);
    }

    /**
     * Render error to prompt - base implementation
     */
    renderErrorToPrompt(error: string, stepIndex: number): void {
        this.chatHistory.push({
            role: 'agent',
            step: stepIndex,
            type: MessageType.ERROR,
            content: `<error>${error}</error>`,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Save all step prompts - base implementation
     */
    async saveAllStepPrompts(outputDir: string, options: {
        formatType: 'markdown' | 'json' | 'both';
        includeMetadata?: boolean;
    }): Promise<void> {
        const fs = await import('fs');
        const path = await import('path');
        
        try {
            // Ensure output directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Save each step's prompt
            for (let stepIndex = 0; stepIndex < this.stepPrompts.length; stepIndex++) {
                const stepPrompt = this.stepPrompts[stepIndex];
                
                if (options.formatType === 'markdown' || options.formatType === 'both') {
                    const markdownFile = path.join(outputDir, `step-${stepIndex}.md`);
                    const markdownContent = this.formatStepPromptAsMarkdown(stepIndex, stepPrompt, options.includeMetadata);
                    fs.writeFileSync(markdownFile, markdownContent, 'utf-8');
                }
                
                if (options.formatType === 'json' || options.formatType === 'both') {
                    const jsonFile = path.join(outputDir, `step-${stepIndex}.json`);
                    const jsonContent = this.formatStepPromptAsJSON(stepIndex, stepPrompt, options.includeMetadata);
                    fs.writeFileSync(jsonFile, JSON.stringify(jsonContent, null, 2), 'utf-8');
                }
            }

            // Save summary information
            if (options.formatType === 'markdown' || options.formatType === 'both') {
                const summaryFile = path.join(outputDir, 'summary.md');
                const summaryContent = this.formatPromptSummaryAsMarkdown(options.includeMetadata);
                fs.writeFileSync(summaryFile, summaryContent, 'utf-8');
            }
            
            if (options.formatType === 'json' || options.formatType === 'both') {
                const summaryFile = path.join(outputDir, 'summary.json');
                const summaryContent = this.formatPromptSummaryAsJSON(options.includeMetadata);
                fs.writeFileSync(summaryFile, JSON.stringify(summaryContent, null, 2), 'utf-8');
            }

        } catch (error) {
            throw error;
        }
    }

    /**
     * Format structured prompt from ContextManager - base implementation
     */
    protected formatStructuredPrompt(promptCtx: PromptCtx): string {
        let formatted = '';
        
        if (promptCtx.workflow) {
            formatted += promptCtx.workflow + '\n\n';
        }
        
        if (promptCtx.status) {
            formatted += promptCtx.status + '\n\n';
        }
        
        if (promptCtx.guideline) {
            formatted += promptCtx.guideline + '\n\n';
        }
        
        if (promptCtx.examples) {
            formatted += promptCtx.examples + '\n\n';
        }
        
        return formatted;
    }

    // Protected helper methods for saving functionality
    protected formatStepPromptAsMarkdown(stepIndex: number, prompt: string, includeMetadata?: boolean): string {
        let content = `# Step ${stepIndex} Prompt\n\n`;
        
        if (includeMetadata) {
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Step Index:** ${stepIndex}\n`;
            content += `**Prompt Length:** ${prompt.length} characters\n`;
            content += `**Estimated Tokens:** ~${Math.round(prompt.length / 4)}\n\n`;
        }

        content += `## Complete Prompt\n\n`;
        content += `\`\`\`\n${prompt}\n\`\`\`\n\n`;
        return content;
    }

    protected formatStepPromptAsJSON(stepIndex: number, prompt: string, includeMetadata?: boolean): any {
        const data: any = {
            stepIndex,
            prompt,
            promptLength: prompt.length,
            estimatedTokens: Math.round(prompt.length / 4)
        };

        if (includeMetadata) {
            data.metadata = {
                generated: new Date().toISOString(),
                totalSteps: this.stepPrompts.length,
                relatedMessages: this.chatHistory.filter(msg => msg.step === stepIndex)
            };
        }

        return data;
    }

    protected formatPromptSummaryAsMarkdown(includeMetadata?: boolean): string {
        let content = `# Prompt Processing Summary\n\n`;
        
        if (includeMetadata) {
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Total Steps:** ${this.stepPrompts.length}\n`;
            content += `**Total Messages:** ${this.chatHistory.length}\n`;
            content += `**Has Stop Signal:** ${!!this.getStopSignal()}\n\n`;
        }

        // Add length statistics
        if (this.stepPrompts.length > 0) {
            const lengths = this.stepPrompts.map(p => p.length);
            const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
            const maxLength = Math.max(...lengths);
            const minLength = Math.min(...lengths);

            content += `## Prompt Length Statistics\n\n`;
            content += `- **Average Length:** ${Math.round(avgLength)} characters (~${Math.round(avgLength / 4)} tokens)\n`;
            content += `- **Max Length:** ${maxLength} characters (~${Math.round(maxLength / 4)} tokens)\n`;
            content += `- **Min Length:** ${minLength} characters (~${Math.round(minLength / 4)} tokens)\n\n`;

            content += `## Length Progression\n\n`;
            this.stepPrompts.forEach((prompt, index) => {
                const length = prompt.length;
                const tokens = Math.round(length / 4);
                content += `- **Step ${index}:** ${length} chars (${tokens} tokens)\n`;
            });
            content += `\n`;
        }

        return content;
    }

    protected formatPromptSummaryAsJSON(includeMetadata?: boolean): any {
        const data: any = {
            totalSteps: this.stepPrompts.length,
            totalMessages: this.chatHistory.length,
            hasStopSignal: !!this.getStopSignal(),
            promptLengths: this.stepPrompts.map(p => p.length),
            estimatedTokens: this.stepPrompts.map(p => Math.round(p.length / 4))
        };

        if (includeMetadata) {
            data.metadata = {
                generated: new Date().toISOString(),
                systemPromptLength: this.systemPrompt.length,
                averagePromptLength: this.stepPrompts.length > 0 
                    ? Math.round(this.stepPrompts.reduce((a, b) => a + b.length, 0) / this.stepPrompts.length) 
                    : 0
            };
        }

        return data;
    }
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