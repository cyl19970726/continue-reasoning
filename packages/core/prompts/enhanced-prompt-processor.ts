import { IPromptProcessor, MessageType, ChatHistoryConfig, IEnhancedPromptProcessor } from '../interfaces/index.js';
import { BasePromptProcessor } from './index.js';
import { EnhancedThinkingExtractorResult } from '../interfaces/index.js';
import { XmlExtractor } from '../utils/xml-extractor.js';
import { logger } from '../utils/logger.js';

/**
 * Enhanced Prompt Processor with structured thinking support
 * Purely focused on enhanced thinking mode with analysis, plan, and reasoning
 * Does not support standard mode - use StandardPromptProcessor for that
 */
export class EnhancedPromptProcessor 
    extends BasePromptProcessor<EnhancedThinkingExtractorResult> 
    implements IEnhancedPromptProcessor<EnhancedThinkingExtractorResult> {
    
    thinkingMode: 'enhanced' | 'custom' = 'enhanced';
    private xmlExtractor: XmlExtractor;
    
    constructor(systemPrompt: string = '', chatHistoryConfig?: Partial<ChatHistoryConfig>) {
        super('enhanced', chatHistoryConfig);
        this.systemPrompt = systemPrompt;
        this.xmlExtractor = new XmlExtractor({
            caseSensitive: false,
            preserveWhitespace: false,
            allowEmptyContent: true,
            fallbackToRegex: true
        });
    }
    
    setThinkingMode(mode: 'enhanced' | 'custom'): void {
        this.thinkingMode = mode;
        logger.info(`EnhancedPromptProcessor: Thinking mode set to ${mode}`);
    }
    
    /**
     * Main text extractor that processes AI response based on thinking mode
     */
    textExtractor(responseText: string): EnhancedThinkingExtractorResult {
        switch (this.thinkingMode) {
            case 'enhanced':
                return this.extractEnhancedMode(responseText);
            case 'custom':
                return this.extractCustomMode(responseText);
            default:
                throw new Error(`Unsupported thinking mode: ${this.thinkingMode}`);
        }
    }
    
    /**
     * Extract structured thinking components (enhanced mode)
     */
    extractStructuredThinking(responseText: string): {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    } {
        const thinkingResult = this.xmlExtractor.extract(responseText, 'think');
        if (!thinkingResult.success) {
            return {};
        }
        
        const thinkingContent = thinkingResult.content;
        return {
            analysis: this.xmlExtractor.extract(thinkingContent, 'analysis').content || undefined,
            plan: this.xmlExtractor.extract(thinkingContent, 'plan').content || undefined,
            reasoning: this.xmlExtractor.extract(thinkingContent, 'reasoning').content || undefined
        };
    }
    
    /**
     * Extract interactive content with typed stop signal
     */
    extractInteractiveContent(responseText: string): {
        response?: string;
        stopSignal?: boolean;
    } {
        const interactiveResult = this.xmlExtractor.extract(responseText, 'interactive');
        if (!interactiveResult.success) {
            return {};
        }
        
        const interactiveContent = interactiveResult.content;
        const response = this.xmlExtractor.extract(interactiveContent, 'response').content || undefined;
        
        // Extract stop signal with type support
        const stopSignalResult = this.xmlExtractor.extractWithType(interactiveContent, 'stop_signal');
        const stopSignal = stopSignalResult.success ? 
            (stopSignalResult.type === 'boolean' ? stopSignalResult.value : 
             stopSignalResult.content.toLowerCase() === 'true') : 
            undefined;
        
        return {
            response,
            stopSignal
        };
    }
    
    /**
     * Render thinking content to prompt
     */
    renderThinkingToPrompt(thinking: {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    }, stepIndex: number): void {
        if (thinking.analysis) {
            this.chatHistoryManager.addMessage({
                role: 'agent',
                type: MessageType.ANALYSIS,
                step: stepIndex,
                content: thinking.analysis
            });
        }
        if (thinking.plan) {
            this.chatHistoryManager.addMessage({
                role: 'agent',
                type: MessageType.PLAN,
                step: stepIndex,
                content: thinking.plan
            });
        }
        if (thinking.reasoning) {
            this.chatHistoryManager.addMessage({
                role: 'agent',  
                type: MessageType.REASONING,
                step: stepIndex,
                content: thinking.reasoning
            });
        }
    }
    
    /**
     * Render interactive content to prompt
     */
    renderInteractiveToPrompt(interactive: {
        response?: string;
        stopSignal?: boolean;
    }, stepIndex: number): void {
        if (interactive.response) {
            this.chatHistoryManager.addMessage({
                role: 'agent',
                type: MessageType.RESPONSE,
                step: stepIndex,
                content: interactive.response
            });
        }
        
        if (interactive.stopSignal !== undefined) {
            this.setStopSignal(interactive.stopSignal);
        }
    }
    
    /**
     * Render extractor result to prompt
     */
    renderExtractorResultToPrompt(extractorResult: EnhancedThinkingExtractorResult, stepIndex: number): void {
        // Render structured thinking
        const thinking = {
            analysis: extractorResult.analysis,
            plan: extractorResult.plan,
            reasoning: extractorResult.reasoning
        };
        this.renderThinkingToPrompt(thinking, stepIndex);
        
        // Render interactive content
        const interactive = {
            response: extractorResult.response,
            stopSignal: extractorResult.stopSignal
        };
        this.renderInteractiveToPrompt(interactive, stepIndex);
        
        // Handle stop signal
        if (extractorResult.stopSignal !== undefined) {
            this.setStopSignal(extractorResult.stopSignal);
        }
    }
    
    /**
     * Extract content in enhanced mode (structured thinking)
     */
    private extractEnhancedMode(responseText: string): EnhancedThinkingExtractorResult {
        const thinking = this.extractStructuredThinking(responseText);
        const interactive = this.extractInteractiveContent(responseText);
        
        return {
            analysis: thinking.analysis,
            plan: thinking.plan,
            reasoning: thinking.reasoning,
            response: interactive.response,
            stopSignal: interactive.stopSignal
        };
    }
    
    /**
     * Extract content in custom mode (extensible for future use)
     */
    private extractCustomMode(responseText: string): EnhancedThinkingExtractorResult {
        logger.warn('EnhancedPromptProcessor: Custom mode not yet implemented, falling back to enhanced mode');
        return this.extractEnhancedMode(responseText);
    }
} 