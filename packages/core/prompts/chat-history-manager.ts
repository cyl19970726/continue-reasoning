import { IChatHistoryManager, ChatHistoryConfig } from "../interfaces/prompt";
import { ChatMessage, MessageType } from "../interfaces/base";

/**
 * Default chat history manager implementation
 * Filters chat history based on message type and step count configuration
 */
export class ChatHistoryManager implements IChatHistoryManager {
    private config: ChatHistoryConfig;
    
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
            [MessageType.STOP_SIGNAL]: 2,     // Keep last 3 steps for stop signal messages
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

    filterChatHistory(chatHistory: ChatMessage[], currentStep: number): ChatMessage[] {
        return chatHistory.filter(message => {
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
}