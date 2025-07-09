import { StreamAgent } from "./stream-agent.js";
import { AsyncAgent } from "./async-agent.js";
import { EventBus, IEventBus } from "./event-bus/index.js";
import { logger } from "./utils/logger.js";

/**
 * Agent创建模式
 */
export enum AgentMode {
    STREAMING = 'streaming',
    ASYNC = 'async',
    AUTO = 'auto'  // 自动检测LLM能力选择
}

/**
 * Agent工厂配置
 */
export interface AgentFactoryConfig {
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    promptProcessor: any;
    logLevel: any;
    agentOptions: any;
    contexts: any;
    llm: any;
    mode?: AgentMode;  // 默认AUTO
    eventBus?: IEventBus;  // 可选，如果不提供会创建新的
}

/**
 * Agent工厂类 - 根据LLM类型和模式选择合适的Agent实现
 */
export class AgentFactory {
    private static defaultEventBus: IEventBus | null = null;

    /**
     * 创建Agent实例
     */
    static createAgent(config: AgentFactoryConfig): StreamAgent | AsyncAgent {
        const {
            id,
            name,
            description,
            maxSteps,
            promptProcessor,
            logLevel,
            agentOptions,
            contexts,
            llm,
            mode = AgentMode.AUTO,
            eventBus
        } = config;

        // 获取或创建事件总线
        const effectiveEventBus = eventBus || this.getDefaultEventBus();

        // 根据模式决定创建哪种Agent
        const selectedMode = this.determineAgentMode(mode, llm);

        logger.info(`Creating Agent with mode: ${selectedMode}`, {
            id,
            hasCallStream: typeof llm.callStream === 'function',
            hasCallAsync: typeof llm.callAsync === 'function',
            requestedMode: mode,
            selectedMode
        });

        if (selectedMode === AgentMode.STREAMING) {
            return new StreamAgent(
                id,
                name,
                description,
                maxSteps,
                promptProcessor,
                logLevel,
                agentOptions,
                contexts,
                effectiveEventBus
            );
        } else {
            return new AsyncAgent(
                id,
                name,
                description,
                maxSteps,
                promptProcessor,
                logLevel,
                agentOptions,
                contexts,
                effectiveEventBus
            );
        }
    }

    /**
     * 检查LLM能力并返回推荐的Agent模式
     */
    static checkLLMCapabilities(llm: any): {
        supportsStreaming: boolean;
        supportsAsync: boolean;
        recommendedMode: AgentMode;
        reasons: string[];
    } {
        const supportsStreaming = typeof llm.callStream === 'function';
        const supportsAsync = typeof llm.callAsync === 'function';
        const reasons: string[] = [];

        let recommendedMode: AgentMode;

        if (supportsStreaming && supportsAsync) {
            // 两种都支持，默认推荐流式（更好的用户体验）
            recommendedMode = AgentMode.STREAMING;
            reasons.push('LLM supports both streaming and async modes');
            reasons.push('Streaming mode recommended for better user experience');
        } else if (supportsStreaming) {
            recommendedMode = AgentMode.STREAMING;
            reasons.push('LLM only supports streaming mode');
        } else if (supportsAsync) {
            recommendedMode = AgentMode.ASYNC;
            reasons.push('LLM only supports async mode');
        } else {
            throw new Error('LLM must support either callStream or callAsync method');
        }

        return {
            supportsStreaming,
            supportsAsync,
            recommendedMode,
            reasons
        };
    }

    /**
     * 确定最终使用的Agent模式
     */
    private static determineAgentMode(requestedMode: AgentMode, llm: any): AgentMode {
        const capabilities = this.checkLLMCapabilities(llm);

        switch (requestedMode) {
            case AgentMode.STREAMING:
                if (!capabilities.supportsStreaming) {
                    throw new Error('Requested streaming mode but LLM does not support callStream');
                }
                return AgentMode.STREAMING;

            case AgentMode.ASYNC:
                if (!capabilities.supportsAsync) {
                    throw new Error('Requested async mode but LLM does not support callAsync');
                }
                return AgentMode.ASYNC;

            case AgentMode.AUTO:
                return capabilities.recommendedMode;

            default:
                throw new Error(`Unknown agent mode: ${requestedMode}`);
        }
    }

    /**
     * 获取默认事件总线（单例模式）
     */
    private static getDefaultEventBus(): IEventBus {
        if (!this.defaultEventBus) {
            this.defaultEventBus = new EventBus();
            logger.info('Created default EventBus for AgentFactory');
        }
        return this.defaultEventBus;
    }

    /**
     * 重置默认事件总线（主要用于测试）
     */
    static resetDefaultEventBus(): void {
        this.defaultEventBus = null;
    }

    /**
     * 创建StreamAgent的便利方法
     */
    static createStreamAgent(config: Omit<AgentFactoryConfig, 'mode'>): StreamAgent {
        const agent = this.createAgent({ ...config, mode: AgentMode.STREAMING });
        if (!(agent instanceof StreamAgent)) {
            throw new Error('Failed to create StreamAgent - LLM may not support streaming');
        }
        return agent;
    }

    /**
     * 创建AsyncAgent的便利方法
     */
    static createAsyncAgent(config: Omit<AgentFactoryConfig, 'mode'>): AsyncAgent {
        const agent = this.createAgent({ ...config, mode: AgentMode.ASYNC });
        if (!(agent instanceof AsyncAgent)) {
            throw new Error('Failed to create AsyncAgent - LLM may not support async');
        }
        return agent;
    }

    /**
     * 创建自动选择的Agent（推荐使用）
     */
    static createAutoAgent(config: Omit<AgentFactoryConfig, 'mode'>): StreamAgent | AsyncAgent {
        return this.createAgent({ ...config, mode: AgentMode.AUTO });
    }
} 