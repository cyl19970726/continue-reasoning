import { BasePromptProcessor, IContextManager, ChatHistoryConfig } from '../interfaces/index.js';
import { StandardPromptProcessor } from './standard-prompt-processor.js';
import { EnhancedPromptProcessor } from './enhanced-prompt-processor.js';
import { logger } from '../utils/logger.js';

/**
 * Prompt processor types
 */
export type PromptProcessorType = 'standard' | 'enhanced';

/**
 * Prompt processor configuration interface
 */
export interface PromptProcessorConfig {
    type: PromptProcessorType;
    systemPrompt: string;
    contextManager?: IContextManager;
    chatHistoryConfig?: Partial<ChatHistoryConfig>;
    options?: {
        thinkingMode?: 'enhanced' | 'custom'; // Only for EnhancedPromptProcessor
        [key: string]: any;
    };
}

/**
 * Factory configuration for custom prompt processors
 */
export interface FactoryConfig {
    defaultType: PromptProcessorType;
    customProcessors?: Map<string, () => BasePromptProcessor<any>>;
}

/**
 * Create a prompt processor based on configuration
 */
export function createPromptProcessor(config: PromptProcessorConfig): BasePromptProcessor<any> {
    const { type, systemPrompt, contextManager, chatHistoryConfig, options } = config;
    
    let processor: BasePromptProcessor<any>;
    
    switch (type) {
        case 'standard':
            processor = new StandardPromptProcessor(systemPrompt, chatHistoryConfig);
            break;
            
        case 'enhanced':
            processor = new EnhancedPromptProcessor(systemPrompt, chatHistoryConfig);
            if (options?.thinkingMode) {
                (processor as EnhancedPromptProcessor).setThinkingMode(options.thinkingMode);
            }
            break;
            
        default:
            throw new Error(`Unknown prompt processor type: ${type}`);
    }
    
    // Set context manager if provided
    if (contextManager) {
        processor.setContextManager(contextManager);
    }
    
    logger.info(`Created ${type} prompt processor`);
    return processor;
}

/**
 * Create a standard prompt processor (backward compatibility)
 */
export function createStandardPromptProcessor(
    systemPrompt: string,
    contextManager?: IContextManager,
    chatHistoryConfig?: Partial<ChatHistoryConfig>
): StandardPromptProcessor {
    const processor = new StandardPromptProcessor(systemPrompt, chatHistoryConfig);
    if (contextManager) {
        processor.setContextManager(contextManager);
    }
    return processor;
}

/**
 * Create an enhanced prompt processor
 */
export function createEnhancedPromptProcessor(
    systemPrompt: string,
    contextManager?: IContextManager,
    thinkingMode: 'enhanced' | 'custom' = 'enhanced',
    chatHistoryConfig?: Partial<ChatHistoryConfig>
): EnhancedPromptProcessor {
    const processor = new EnhancedPromptProcessor(systemPrompt, chatHistoryConfig);
    if (contextManager) {
        processor.setContextManager(contextManager);
    }
    processor.setThinkingMode(thinkingMode);
    return processor;
}

/**
 * Prompt processor factory with configuration
 */
export class PromptProcessorFactory {
    private config: FactoryConfig;
    
    constructor(config: FactoryConfig) {
        this.config = config;
    }
    
    create(type?: PromptProcessorType, systemPrompt?: string, contextManager?: IContextManager, chatHistoryConfig?: Partial<ChatHistoryConfig>): BasePromptProcessor<any> {
        const processorType = type || this.config.defaultType;
        
        return createPromptProcessor({
            type: processorType,
            systemPrompt: systemPrompt || '',
            contextManager,
            chatHistoryConfig
        });
    }
    
    createStandard(systemPrompt: string, contextManager?: IContextManager, chatHistoryConfig?: Partial<ChatHistoryConfig>): StandardPromptProcessor {
        return createStandardPromptProcessor(systemPrompt, contextManager, chatHistoryConfig);
    }
    
    createEnhanced(
        systemPrompt: string, 
        contextManager?: IContextManager,
        thinkingMode: 'enhanced' | 'custom' = 'enhanced',
        chatHistoryConfig?: Partial<ChatHistoryConfig>
    ): EnhancedPromptProcessor {
        return createEnhancedPromptProcessor(systemPrompt, contextManager, thinkingMode, chatHistoryConfig);
    }
}

/**
 * Default factory instance
 */
export const defaultPromptProcessorFactory = new PromptProcessorFactory({
    defaultType: 'standard'
}); 