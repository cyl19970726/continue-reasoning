import { BasePromptProcessor, IContextManager } from './interfaces';
import { StandardPromptProcessor } from './standard-prompt-processor';
import { EnhancedPromptProcessor } from './enhanced-prompt-processor';
import { logger } from './utils/logger';

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
    const { type, systemPrompt, contextManager, options } = config;
    
    let processor: BasePromptProcessor<any>;
    
    switch (type) {
        case 'standard':
            processor = new StandardPromptProcessor(systemPrompt);
            break;
            
        case 'enhanced':
            processor = new EnhancedPromptProcessor(systemPrompt);
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
    contextManager?: IContextManager
): StandardPromptProcessor {
    const processor = new StandardPromptProcessor(systemPrompt);
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
    thinkingMode: 'enhanced' | 'custom' = 'enhanced'
): EnhancedPromptProcessor {
    const processor = new EnhancedPromptProcessor(systemPrompt);
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
    
    create(type?: PromptProcessorType, systemPrompt?: string, contextManager?: IContextManager): BasePromptProcessor<any> {
        const processorType = type || this.config.defaultType;
        
        return createPromptProcessor({
            type: processorType,
            systemPrompt: systemPrompt || '',
            contextManager
        });
    }
    
    createStandard(systemPrompt: string, contextManager?: IContextManager): StandardPromptProcessor {
        return createStandardPromptProcessor(systemPrompt, contextManager);
    }
    
    createEnhanced(
        systemPrompt: string, 
        contextManager?: IContextManager,
        thinkingMode: 'enhanced' | 'custom' = 'enhanced'
    ): EnhancedPromptProcessor {
        return createEnhancedPromptProcessor(systemPrompt, contextManager, thinkingMode);
    }
}

/**
 * Default factory instance
 */
export const defaultPromptProcessorFactory = new PromptProcessorFactory({
    defaultType: 'standard'
}); 