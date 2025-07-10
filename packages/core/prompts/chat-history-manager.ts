import { IChatHistoryManager, ChatHistoryConfig } from "../interfaces/prompt.js";
import { ChatMessage, MessageType } from "../interfaces/base.js";
import { randomUUID } from "crypto";

/**
 * Default chat history manager implementation
 * Manages chat history storage, filtering, and exclusion
 */
export class ChatHistoryManager implements IChatHistoryManager {
    private config: ChatHistoryConfig;
    private chatHistory: ChatMessage[] = [];
    
    constructor(config?: Partial<ChatHistoryConfig>) {
        // Default configuration - keep reasonable amounts for each type
        this.config = {
            [MessageType.MESSAGE]: 100,        // Keep last 100 steps for messages
            [MessageType.TOOL_CALL]: 5,      // Keep last 10 steps for tool calls
            [MessageType.ERROR]: 5,          // Keep last 20 steps for errors  
            [MessageType.THINKING]: 5,        // Keep last 8 steps for thinking messages
            [MessageType.ANALYSIS]: 5,        // Keep last 8 steps for analysis messages
            [MessageType.PLAN]: 5,            // Keep last 8 steps for plan messages
            [MessageType.REASONING]: 5,       // Keep last 8 steps for reasoning messages
            [MessageType.INTERACTIVE]: 5,     // Keep last 5 steps for interactive messages
            [MessageType.RESPONSE]: 5,       // Keep last 10 steps for response messages
            [MessageType.STOP_SIGNAL]: 0,     // Keep last 3 steps for stop signal messages
            ...config
        };
    }

    setConfig(config: Partial<ChatHistoryConfig>): void {
        this.config = { ...this.config, ...config };
    }

    getConfig(): ChatHistoryConfig {
        return { ...this.config };
    }

    updateTypeConfig(messageType: MessageType, keepSteps: number): void {
        this.config[messageType] = keepSteps;
    }

    // Message management methods
    addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): void {
        const completeMessage: ChatMessage = {
            ...message,
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            type: message.type || MessageType.MESSAGE
        };
        this.chatHistory.push(completeMessage);
    }

    addCompleteMessage(message: ChatMessage): void {
        this.chatHistory.push(message);
    }

    getChatHistory(): ChatMessage[] {
        return [...this.chatHistory];
    }

    clearChatHistory(): void {
        this.chatHistory = [];
    }

    // Exclusion methods
    excludeChatHistory(id: string): void {
        const message = this.chatHistory.find(msg => msg.id === id);
        if (message) {
            message.flag = 'exclude';
        }
    }

    excludeChatHistoryBatch(ids: string[]): void {
        ids.forEach(id => this.excludeChatHistory(id));
    }

    // Filtering methods
    getFilteredChatHistory(currentStep: number): ChatMessage[] {
        // Stage 1: Filter by step count
        const stepFiltered = this.filterStepChatHistory(currentStep);
        // Stage 2: Filter by exclusion flag
        return this.filterExcludeChatHistory(stepFiltered);
    }

    private filterStepChatHistory(currentStep: number): ChatMessage[] {
        return this.chatHistory.filter(message => {
            // Use MESSAGE as default type if not specified
            const messageType = message.type || MessageType.MESSAGE;
            const keepSteps = this.config[messageType];
            
            // Always keep if keepSteps is 0 or negative (means keep all)
            if (keepSteps <= 0) return true;
            
            // Keep if message is within the allowed step range
            const stepDifference = currentStep - message.step;
            return stepDifference <= keepSteps;
        });
    }

    private filterExcludeChatHistory(chatHistory: ChatMessage[]): ChatMessage[] {
        return chatHistory.filter(msg => msg.flag !== 'exclude');
    }
}