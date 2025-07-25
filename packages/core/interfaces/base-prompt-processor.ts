import { ExtractorResult } from "./prompt.js";
import { ChatMessage } from "./base.js";
import { ChatHistoryConfig } from "./prompt.js";
import { ChatHistoryManager } from "../prompts/chat-history-manager.js";
import { IContextManager } from "./context.js";
import { IChatHistoryManager } from "./prompt.js";
import { IPromptProcessor } from "./prompt.js";
import { AgentStep } from "./prompt.js";
import { logger } from "../utils/logger.js";
import { PromptCtx } from "./prompt.js";
import { MessageType } from "./base.js";

/**
 * PromptProcessor abstract base
 * Provides basic implementation, subclasses need to implement abstract methods
 */
export abstract class BasePromptProcessor<TExtractorResult extends ExtractorResult> 
    implements IPromptProcessor<TExtractorResult> {
    type: 'standard' | 'enhanced';
    systemPrompt: string = '';
    currentPrompt: string = '';
    stopSignal: boolean | null = null;

    constructor(type: 'standard' | 'enhanced', chatHistoryConfig?: Partial<ChatHistoryConfig>) {
        this.type = type;
        this.chatHistoryManager = new ChatHistoryManager(chatHistoryConfig);
    }

    enableToolCallsForStep: (stepIndex: number) => boolean = () => true;
    
    // Enhanced base functionality
    stepPrompts: string[] = [];
    protected contextManager?: IContextManager;
    protected chatHistoryManager: IChatHistoryManager;

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
            // If message already has id and timestamp, add it directly
            if (message.id && message.timestamp) {
                // For messages that already exist (like from external sources)
                this.chatHistoryManager.addCompleteMessage(message);
            } else {
                // For new messages, use addMessage to generate id and timestamp
                this.chatHistoryManager.addMessage({
                    role: message.role,
                    type: message.type || MessageType.MESSAGE,
                    step: message.step,
                    content: message.content,
                    flag: message.flag
                });
            }
        });
    }
        
    /**
     * Render tool call results to prompt
     */

    renderToolCallToPrompt(toolResults: AgentStep['toolExecutionResults'], stepIndex: number): void {
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
    
            this.chatHistoryManager.addMessage({
                role: 'agent',
                step: stepIndex,
                type: MessageType.TOOL_CALL,
                content: toolResultsText
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
        
        if (step.toolExecutionResults) {
            this.renderToolCallToPrompt(step.toolExecutionResults, step.stepIndex);
        }
    }

    updateSystemPrompt(newSystemPrompt: string): void {
        this.systemPrompt = newSystemPrompt;
    }

    getChatHistory(): ChatMessage[] {
        return this.chatHistoryManager.getChatHistory();
    }

    getChatHistoryManager(): IChatHistoryManager {
        return this.chatHistoryManager;
    }

    resetPromptProcessor(): void {
        this.chatHistoryManager.clearChatHistory();
        this.stopSignal = null;
        this.currentPrompt = '';
        this.stepPrompts = [];
    }

    /**
     * Set chat history configuration
     */
    setChatHistoryConfig(config: Partial<ChatHistoryConfig>): void {
        this.chatHistoryManager.setConfig(config);
    }
    
    /**
     * Get current chat history configuration
     */
    getChatHistoryConfig(): ChatHistoryConfig {
        return this.chatHistoryManager.getConfig();
    }
    
    /**
     * Update configuration for specific message type
     */
    updateChatHistoryTypeConfig(messageType: MessageType, keepSteps: number): void {
        this.chatHistoryManager.updateTypeConfig(messageType, keepSteps);
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
     * Format final prompt with simplified structure
     * System prompt is now fully managed by Agent.getBaseSystemPrompt()
     */
      async formatPrompt(stepIndex: number): Promise<string> {
        let prompt = '';
        
        // 1. Add system prompt (now contains everything)
        if (this.systemPrompt) {
            prompt += `${this.systemPrompt}\n\n`;
        }
        
        // 2. ExecutionHistory (ChatHistory List) - Now with filtering
        const chatHistory = this.chatHistoryManager.getChatHistory();
        if (chatHistory.length > 0) {
            // Get filtered chat history
            const filteredHistory = this.chatHistoryManager.getFilteredChatHistory(stepIndex);

            if (filteredHistory.length > 0) {
                prompt += `
# ChatHistory Context\n

## Context Management with excludeChatHistory

You have access to the excludeChatHistory tool to manage your ChatHistory context. Use this tool to:

- Remove redundant, repetitive, outdated, irrelevant messages that add noise.

**Example usage:**
When you notice multiple similar error messages or outdated implementation attempts, use:
excludeChatHistory({ messageIds: ["id1", "id2", "id3"], reason: "Outdated implementation attempts" })
                
## ChatHistory Context
                `;




                filteredHistory.forEach(message => {
                    prompt += `
<chat_history>
id: ${message.id}
role: ${message.role}
step: ${message.step}
type: ${message.type}
content: ${message.content}
timestamp: ${message.timestamp}
</chat_history>
`;
                });
            }
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

    /**
     * Exclude a chat message by ID
     */
    excludeChatHistory(id: string): void {
        this.chatHistoryManager.excludeChatHistory(id);
    }

    /**
     * Exclude multiple chat messages by IDs
     */
    excludeChatHistoryBatch(ids: string[]): void {
        this.chatHistoryManager.excludeChatHistoryBatch(ids);
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
        this.chatHistoryManager.addMessage({
            role: 'agent',
            step: stepIndex,
            type: MessageType.ERROR,
            content: `<error>${error}</error>`
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
                relatedMessages: this.chatHistoryManager.getChatHistory().filter(msg => msg.step === stepIndex)
            };
        }

        return data;
    }

    protected formatPromptSummaryAsMarkdown(includeMetadata?: boolean): string {
        let content = `# Prompt Processing Summary\n\n`;
        
        if (includeMetadata) {
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Total Steps:** ${this.stepPrompts.length}\n`;
            content += `**Total Messages:** ${this.chatHistoryManager.getChatHistory().length}\n`;
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
            totalMessages: this.chatHistoryManager.getChatHistory().length,
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
