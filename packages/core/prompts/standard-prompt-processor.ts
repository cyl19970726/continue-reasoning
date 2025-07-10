import { IPromptProcessor, MessageType, ChatHistoryConfig } from '../interfaces/index.js';
import { BasePromptProcessor } from './index.js';
import { StandardExtractorResult } from '../interfaces/index.js';
import { XmlExtractor } from '../utils/xml-extractor.js';

/**
 * Standard Prompt Processor for basic thinking and final answer workflow
 * Handles StandardExtractorResult with thinking, response, and stopSignal
 */
export class StandardPromptProcessor 
    extends BasePromptProcessor<StandardExtractorResult> {
    
    private xmlExtractor: XmlExtractor;
    
    constructor(systemPrompt: string = '', chatHistoryConfig?: Partial<ChatHistoryConfig>) {
        super('standard', chatHistoryConfig);
        this.systemPrompt = systemPrompt;
        this.xmlExtractor = new XmlExtractor({
            caseSensitive: false,
            preserveWhitespace: false,
            allowEmptyContent: true,
            fallbackToRegex: true
        });
    }
    
    /**
     * Extract thinking, response and stop signal from AI response
     */
    textExtractor(responseText: string): StandardExtractorResult {
        const thinking = this.extractThinking(responseText);
        // const response = this.extractResponse(responseText);
        const interactive = this.extractInteractiveContent(responseText);
        
        return {
            thinking,
            response: interactive.response,
            stopSignal: interactive.stopSignal // If response exists, signal to stop
        };
    }
    
    /**
     * Render extractor result to chat history
     */
    renderExtractorResultToPrompt(extractorResult: StandardExtractorResult, stepIndex: number): void {
        // Render thinking content
        if (extractorResult.thinking) {
            this.chatHistoryManager.addMessage({
                role: 'agent',
                step: stepIndex,
                type: MessageType.THINKING,
                content: `<think>${extractorResult.thinking}</think>`
            });
        }
        
        // Render response content
        if (extractorResult.response) {
            this.chatHistoryManager.addMessage({
                role: 'agent',
                step: stepIndex,
                type: MessageType.RESPONSE,
                content: `<response>${extractorResult.response}</response>`
            });
        }
        
        // Handle stop signal
        if (extractorResult.stopSignal !== undefined) {
            this.setStopSignal(extractorResult.stopSignal);
        }
    }

    

    /**
     * Extract thinking content from response
     */
    private extractThinking(text: string): string | undefined {
        const thinkResult = this.xmlExtractor.extract(text, 'think');
        if (thinkResult.success && thinkResult.content) {
            return thinkResult.content;
        }

        const thinkingResult = this.xmlExtractor.extract(text, 'thinking');
        if (thinkingResult.success && thinkingResult.content) {
            return thinkingResult.content;
        }

        return undefined;
    }
    
    /**
     * Extract response/final answer from response
     */
    private extractResponse(text: string): string | undefined {
        const finalAnswerResult = this.xmlExtractor.extract(text, 'final_answer');
        if (finalAnswerResult.success && finalAnswerResult.content) {
            return finalAnswerResult.content;
        }

        const responseResult = this.xmlExtractor.extract(text, 'response');
        if (responseResult.success && responseResult.content) {
            return responseResult.content;
        }

        return undefined;
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
    
} 