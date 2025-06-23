import { BasePromptProcessor, MessageType, ChatHistoryConfig } from '../interfaces';
import { StandardExtractorResult } from '../interfaces';
import { XmlExtractor } from '../utils/xml-extractor';

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
        const response = this.extractResponse(responseText);
        
        return {
            thinking,
            response,
            stopSignal: !!response // If response exists, signal to stop
        };
    }
    
    /**
     * Render extractor result to chat history
     */
    renderExtractorResultToPrompt(extractorResult: StandardExtractorResult, stepIndex: number): void {
        // Render thinking content
        if (extractorResult.thinking) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.THINKING,
                content: `<think>${extractorResult.thinking}</think>`,
                timestamp: new Date().toISOString()
            });
        }
        
        // Render response content
        if (extractorResult.response) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.MESSAGE,
                content: `<final_answer>${extractorResult.response}</final_answer>`,
                timestamp: new Date().toISOString()
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
} 