import { AnyTool, IContextManager, IAgent, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolExecutionResult, IRAGEnabledContext, asRAGEnabledContext, AgentStatus, AgentStep, ChatMessage, ToolSet, AgentStorage, AgentCallbacks, MessageType, BasePromptProcessor } from "./interfaces/index.js";
import { ToolExecutor } from "./tool-executor.js";
import { DeepWikiContext, FireCrawlContext } from "./contexts/index.js";
import { ITaskQueue, TaskQueue } from "./taskQueue.js";
import dotenv from "dotenv";
import { PlanContext } from "./contexts/plan.js";
import { MCPContext } from "./contexts/mcp.js";
import { WebSearchContext } from "./contexts/web-search.js";
import { OpenAIWrapper } from "./models/openai.js";
import { AnthropicWrapper } from "./models/anthropic.js";
import { GeminiWrapper } from "./models/gemini.js";
import { SupportedModel, getModelProvider, OPENAI_MODELS } from "./models/index.js";
import path from "path";
import { LogLevel, Logger } from "./utils/logger.js";
import { ToolSetContext } from "./contexts/toolset.js";
import { logger } from "./utils/logger.js";
import { ContextManager } from "./context.js";
import { getSystemPromptForMode } from "./prompts/system-prompt.js";
import { OpenAIChatWrapper } from "./models/openai-chat.js";

dotenv.config();

export const DEFAULT_CONTEXTS = [
    // Planning context
    PlanContext,

    // Execution and utility contexts
    WebSearchContext,
    MCPContext,
    ToolSetContext,
    DeepWikiContext,
    FireCrawlContext,
]

const DEFAULT_AGENT_OPTIONS: AgentOptions = {
    model: OPENAI_MODELS.GPT_4O,
    enableParallelToolCalls: false,
    temperature: 0.7,
    taskConcurency: 5,
    enableParallelToolExecution: false,
    toolExecutionPriority: 5,
    promptOptimization: {
        mode: "minimal",
        customSystemPrompt: "",
        maxTokens: 100000,
    },
}

export interface AgentOptions {
    model?: SupportedModel;
    enableParallelToolCalls?: boolean;
    temperature?: number;
    taskConcurency?: number;
    mcpConfigPath?: string;
    executionMode?: 'auto' | 'manual' | 'supervised';
    enableParallelToolExecution?: boolean;
    toolExecutionPriority?: number;
    promptOptimization?: {
        mode: 'minimal' | 'standard' | 'detailed' | 'custom';
        customSystemPrompt?: string;
        maxTokens?: number;
    };
}

/**
 * 当前步骤数据接口 - 扩展AgentStep，包含执行时所需的额外字段
 */
interface CurrentStepData extends AgentStep {
    toolExecutionPromises: Array<Promise<void>>;
    isComplete: boolean;
}

/**
 * 抽象基类 - 包含所有通用的 Agent 逻辑
 */
export abstract class BaseAgent implements IAgent {
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    contextManager: IContextManager;
    llm: ILLM;
    taskQueue: ITaskQueue;
    enableParallelToolCalls: boolean;
    enableParallelToolExecution: boolean = false;
    toolExecutionPriority: number = 5;
    toolSets: ToolSet[] = [];
    mcpConfigPath: string;
    executionMode: 'auto' | 'manual' | 'supervised' = 'manual';
    toolExecutor: ToolExecutor;

    isRunning: boolean;
    shouldStop: boolean;
    currentState: AgentStatus = 'idle';
    currentStep: number = 0;
    agentStorage: AgentStorage = {
        sessionId: '',
        agentId: '',
        currentStep: 0,
        contexts: [],
        agentSteps: [],
        totalTokensUsed: 0,
        sessionStartTime: 0,
        lastActiveTime: 0,
    };

    contexts: IRAGEnabledContext<any>[] = [];
    promptProcessor: BasePromptProcessor<any>;

    // 会话感知能力
    private sessionId?: string;
    callbacks?: AgentCallbacks;
    
    // 当前正在处理的步骤数据
    protected currentStepData: CurrentStepData | null = null;

    constructor(
        id: string,
        name: string,
        description: string,
        maxSteps: number,
        promptProcessor: BasePromptProcessor<any>,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions,
        contexts?: IContext<any>[],
    ) {
        this.agentStorage.agentId = id;
        agentOptions = agentOptions || DEFAULT_AGENT_OPTIONS;
        this.contexts = contexts || DEFAULT_CONTEXTS;

        // 设置日志级别
        if (logLevel !== undefined) {
            logger.info(`Setting log level to: ${LogLevel[logLevel]}`);
            Logger.setLevel(logLevel);
        }

        this.id = id;
        this.name = name;
        this.description = description;
        this.contextManager = new ContextManager(id, name, agentOptions?.promptOptimization);
        this.toolSets = [];
        this.executionMode = agentOptions?.executionMode || 'manual';
        logger.info(`Agent initialized with execution mode: ${this.executionMode}`);

        // LLM configuration options
        const temperature = agentOptions?.temperature || 0.7;
        const maxTokens = agentOptions?.promptOptimization?.maxTokens || 2048;
        this.enableParallelToolCalls = agentOptions?.enableParallelToolCalls ?? false;
        this.enableParallelToolExecution = agentOptions?.enableParallelToolExecution ?? false;
        this.toolExecutionPriority = agentOptions?.toolExecutionPriority ?? 5;

        // 初始化 LLM
        const selectedModel: SupportedModel = agentOptions?.model || OPENAI_MODELS.GPT_4O;
        const provider = getModelProvider(selectedModel);
        logger.info(`getModelProvider model: ${selectedModel}, provider: ${provider}`);

        if (provider === 'openai') {
            this.llm = new OpenAIWrapper(selectedModel, false, temperature, maxTokens);
            (this.llm as any).modelName = selectedModel;
            logger.info(`Using OpenAI model: ${selectedModel}`);
        } else if (provider === 'anthropic') {
            this.llm = new AnthropicWrapper(selectedModel, false, temperature, maxTokens);
            (this.llm as any).modelName = selectedModel;
            logger.info(`Using Anthropic model: ${selectedModel}`);
        } else if (provider === 'google') {
            this.llm = new GeminiWrapper(selectedModel, false, temperature, maxTokens);
            (this.llm as any).modelName = selectedModel;
            logger.info(`Using Google model: ${selectedModel}`);
        } else if (provider === 'deepseek') {
            this.llm = new OpenAIChatWrapper(selectedModel, false, temperature, maxTokens);
            (this.llm as any).modelName = selectedModel;
            logger.info(`Using DeepSeek model: ${selectedModel}`);
        } else {
            throw new Error(`Unsupported LLM provider: ${provider}`);
        }

        // Set LLM parallel tool calling
        if (this.llm.setParallelToolCall) {
            this.llm.setParallelToolCall(this.enableParallelToolCalls);
        } else {
            this.llm.parallelToolCall = this.enableParallelToolCalls;
        }

        // Set the provided PromptProcessor
        this.promptProcessor = promptProcessor;
        this.promptProcessor.setContextManager(this.contextManager);

        // Set MCP config path
        this.mcpConfigPath = agentOptions?.mcpConfigPath || path.join(process.cwd(), 'config', 'mcp.json');
        logger.info(`MCP config path: ${this.mcpConfigPath}`);

        let taskConcurency = agentOptions?.taskConcurency ? agentOptions?.taskConcurency : 5;
        this.taskQueue = new TaskQueue(taskConcurency);
        
        // 初始化 ToolExecutor
        this.toolExecutor = new ToolExecutor(this.taskQueue, {
            maxConcurrency: taskConcurency,
            defaultPriority: this.toolExecutionPriority,
            enableParallelExecution: this.enableParallelToolExecution
        });
        
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }

    public getBaseSystemPrompt(tools: AnyTool[]): string {
        let systemPrompt = getSystemPromptForMode(this.promptProcessor.type)
        let toolsPrompt =  tools.length > 0 ? 
        `
## Tool Usage Guidelines
- Call tools when you need to perform actions or gather information
- Always explain what you're doing and why
- Analyze tool results thoroughly before proceeding
- If a tool call fails, try alternative approaches or inform the user
- Available Tools:
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}` : '';

        return systemPrompt + toolsPrompt
    }

    // 抽象方法 - 由子类实现具体的步骤处理逻辑
    protected abstract processStep(
        userInput: string,
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }>;

    /**
     * 执行单个工具调用（不等待完成，立即返回Promise）
     * ToolExecutor已经在内部使用TaskQueue进行异步并行执行
     */
    protected async executeToolCall(toolCall: import('./interfaces/tool.js').ToolCallParams, _stepIndex: number): Promise<void> {
        // 找到对应的工具
        const tool = this.getActiveTools().find(t => t.name === toolCall.name);
        if (!tool) {
            return Promise.reject(new Error(`Tool not found: ${toolCall.name}`));
        }
        
        // 发送工具调用开始回调
        this.callbacks?.onToolExecutionStart?.(toolCall);
        
        // 直接返回ToolExecutor的Promise，使用.then处理结果
        // ToolExecutor内部会使用TaskQueue异步执行，立即返回Promise
        return this.toolExecutor.executeToolCall(
            toolCall,
            tool,
            this,
            this.callbacks,
            this.toolExecutionPriority
        ).then(result => {
            logger.debug(`[Agent] 工具 ${toolCall.name} 执行完成`);
            
            // 添加结果到当前步骤
            if (this.currentStepData) {
                if (!this.currentStepData.toolExecutionResults) {
                    this.currentStepData.toolExecutionResults = [];
                }
                this.currentStepData.toolExecutionResults.push(result);
            }
            
            // 发送工具执行结束回调
            this.callbacks?.onToolExecutionEnd?.(result);
        }).catch(error => {
            logger.error(`[Agent] 工具执行失败:`, error);
            
            const errorResult = {
                call_id: toolCall.call_id,
                name: toolCall.name,
                status: 'failed' as const,
                error: error instanceof Error ? error.message : String(error),
                result: null,
                message: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
                executionTime: 0
            };
            
            if (this.currentStepData) {
                if (!this.currentStepData.toolExecutionResults) {
                    this.currentStepData.toolExecutionResults = [];
                }
                this.currentStepData.toolExecutionResults.push(errorResult);
            }
            
            this.callbacks?.onToolExecutionEnd?.(errorResult);
            // 不要重新抛出错误，让Promise正常resolve
        });
    }

    async setup(): Promise<void> {
        // Register all contexts with the context manager
        this.contexts.forEach((context) => {
            logger.info(`Registering context: ${context.id}`);
            this.contextManager.registerContext(asRAGEnabledContext(context));
        });

        // Add tools from contexts
        this.contextManager.contexts.forEach((context) => {
            if (context && context.toolSet) {
                const toolSet = context.toolSet();
                if (toolSet) {
                    if (Array.isArray(toolSet)) {
                        this.toolSets.push(...toolSet);
                    } else {
                        this.toolSets.push(toolSet);
                    }
                }
            } else if (context) {
                logger.warn(`Context ${context.id} is missing the toolList method.`);
            } else {
                logger.error('Encountered an undefined context during setup.');
            }
        });

        // 使用ContextManager集中安装所有Context的MCP服务器
        const installResults = await this.contextManager.installAllContexts(this);
        logger.info(`MCP服务器安装结果: 总数=${installResults.totalContexts}, 成功=${installResults.installedCount}, 失败=${installResults.failedCount}, 跳过=${installResults.skippedCount}`);
        
        if (installResults.failedCount > 0) {
            const failedContexts = installResults.details
                .filter(detail => detail.status === 'failed')
                .map(detail => `${detail.contextId}: ${detail.error}`);
            logger.warn(`以下Context的MCP服务器安装失败:\n${failedContexts.join('\n')}`);
        }

        // 在 setup 完成后，更新 PromptProcessor 的 system prompt，包含所有工具信息
        const allTools = this.getActiveTools();
        logger.debug(`[PromptProcessor] Active tools: ${allTools.map(t => t.name).join(', ')}`);
        const updatedSystemPrompt = this.getBaseSystemPrompt(allTools);
        this.promptProcessor.updateSystemPrompt(updatedSystemPrompt);
        logger.debug(`[PromptProcessor] Updated system prompt with ${allTools.length} tools`);
    }

    // 添加状态变更方法
    async changeState(newState: AgentStatus, reason?: string): Promise<void> {
        const oldState = this.currentState;
        this.currentState = newState;

        logger.debug(`Agent state changed: ${oldState} -> ${newState}${reason ? ` (${reason})` : ''}`);
    }

    async startWithUserInput(
        userInput: string,
        maxSteps: number,
        sessionId: string,
        options?: {
            savePromptPerStep?: boolean;
            promptSaveDir?: string;
            promptSaveFormat?: 'markdown' | 'json' | 'both';
        }
    ): Promise<void> {
        // 验证参数
        if (!userInput?.trim()) {
            throw new Error('User input cannot be empty');
        }

        if (maxSteps <= 0) {
            throw new Error('Max steps must be positive');
        }

        if (this.isRunning) {
            throw new Error('Agent is already running');
        }

        // 会话管理逻辑
        if (this.sessionId) {
            if (this.sessionId !== sessionId) {
                // 存储旧会话
                this.callbacks?.onSessionEnd?.(this.sessionId!);
                this.callbacks?.onStateStorage?.(this.agentStorage);

                // 重置会话
                this.resetPromptProcessor();

                this.sessionId = sessionId;
                let state = await this.callbacks?.loadAgentStorage(sessionId);
                this.loadAgentStorage(state!);
                logger.info(`Agent ${this.id}: Starting new session ${sessionId} at step ${this.currentStep}`);
            } else {
                logger.info(`Agent ${this.id}: Continuing session ${sessionId} from step ${this.currentStep}`);
            }
        } else {
            this.sessionId = sessionId;
            let state = await this.callbacks?.loadAgentStorage(sessionId);
            if (!state) {
                state = {
                    sessionId: sessionId,
                    agentId: this.id,
                    currentStep: 0,
                    agentSteps: [],
                    totalTokensUsed: 0,
                    sessionStartTime: Date.now(),
                    lastActiveTime: Date.now(),
                }
            }
            await this.loadAgentStorage(state);
            logger.info(`Agent ${this.id}: Starting new session ${sessionId} at step ${this.currentStep}`)
        }

        // 添加 userInput 到 PromptProcessor
        this.promptProcessor.renderChatMessageToPrompt(
            [{
                role: 'user',
                step: this.currentStep,
                timestamp: new Date().toISOString(),
                type: MessageType.MESSAGE,
                content: userInput
            }]
        );

        await this.changeState('running', 'Starting task processing');

        this.shouldStop = false;

        logger.info(`🚀 Starting agent execution with maxSteps: ${maxSteps}, currentStep: ${this.currentStep}`);

        // 开始执行步骤循环
        await this.stepsLoop(userInput, maxSteps, options);

        // 在所有步骤完成后，一次性保存所有步骤的prompt
        if (options?.savePromptPerStep && this.promptProcessor) {
            await this.saveAllStepPrompts(options);
        }

        logger.info('✅ Agent execution completed successfully');
        await this.changeState('idle', 'Task processing completed');
    }

    private async stepsLoop(userInput: string, maxSteps: number, _options?: {
        savePromptPerStep?: boolean;
        promptSaveDir?: string;
        promptSaveFormat?: 'markdown' | 'json' | 'both';
    }): Promise<void> {
        let agentSteps: AgentStep[] = [];
        while (this.currentStep < maxSteps && !this.shouldStop) {
            logger.info(`\n🔄 --- Step ${this.currentStep}/${maxSteps} ---`);
            
            // 使用PromptProcessor处理此步骤
            const result = await this.processStep(
                userInput,
                this.currentStep,
            );
            agentSteps.push(result.agentStep);

            // 调用 onAgentStep 回调
            this.callbacks?.onAgentStep?.(result.agentStep);

            if (!result.continueProcessing) {
                logger.info(`✅ Agent decided to stop at step ${this.currentStep}`);
                break;
            }

            this.currentStep++;
        }

        if (this.shouldStop) {
            logger.info('🛑 Agent execution stopped by user request');
        } else if (this.currentStep >= maxSteps) {
            logger.info(`🏁 Agent execution completed after ${maxSteps} steps`);
        }
    }

    stop(): void {
        this.shouldStop = true;
        logger.info("Agent Stop has been called");

        this.changeState('stopping', 'User requested stop').catch(error => {
            logger.error('Error updating state to stopping:', error);
        });
    }

    // Tool set management methods
    addToolSet(toolSet: ToolSet) {
        if (this.toolSets.find(ts => ts.name === toolSet.name)) return;
        this.toolSets.push(toolSet);
    }

    listToolSets() {
        return this.toolSets;
    }

    activateToolSets(names: string[]) {
        for (const name of names) {
            const ts = this.toolSets.find(ts => ts.name === name);
            if (ts && !ts.active) {
                ts.active = true;
            }
        }
    }

    deactivateToolSets(names: string[]) {
        for (const name of names) {
            const ts = this.toolSets.find(ts => ts.name === name);
            if (ts && ts.active) {
                ts.active = false;
            }
        }
    }

    getActiveTools(): AnyTool[] {
        const allTools = this.toolSets.filter(ts => ts.active).flatMap(ts => ts.tools);

        if (this.executionMode === 'auto') {
            return allTools.filter(tool => tool.name !== 'approval_request');
        }

        return allTools;
    }

    protected processToolCallResult(toolCallResult: ToolExecutionResult): void {
        if (!toolCallResult) return;

        const contexts = this.contextManager.contextList();
        for (const context of contexts) {
            try {
                if (context && typeof (context as any).onToolCall === 'function') {
                    (context as any).onToolCall(toolCallResult);
                }
            } catch (error) {
                logger.error(`Error in context ${context.id} onToolCall handler:`, error);
            }
        }
    }

    private async saveAllStepPrompts(options: {
        savePromptPerStep?: boolean;
        promptSaveDir?: string;
        promptSaveFormat?: 'markdown' | 'json' | 'both';
    }): Promise<void> {
        if (!this.promptProcessor) {
            throw new Error('Prompt Processor is not available');
        }

        const saveDir = options.promptSaveDir || './step-prompts';
        const format = options.promptSaveFormat || 'both';

        logger.info(`💾 Saving all ${this.currentStep} step prompts to ${saveDir}...`);

        try {
            await this.promptProcessor.saveAllStepPrompts(saveDir, {
                formatType: format,
                includeMetadata: true
            });

            logger.info(`✅ Successfully saved ${this.currentStep} step prompts to ${saveDir}`);
        } catch (error) {
            logger.error(`❌ Error saving step prompts:`, error);
            throw error;
        }
    }

    public async getPrompt(): Promise<string> {
        return await this.promptProcessor.formatPrompt(this.currentStep);
    }

    public setEnableToolCallsForStep(enableFn: (stepIndex: number) => boolean): void {
        this.promptProcessor.setEnableToolCallsForStep(enableFn);
    }

    public getPromptProcessor(): BasePromptProcessor<any> {
        return this.promptProcessor;
    }

    public setPromptProcessor(processor: BasePromptProcessor<any>): void {
        this.promptProcessor = processor;
        this.promptProcessor.setContextManager(this.contextManager);
        logger.info(`PromptProcessor updated to: ${processor.constructor.name}`);
    }

    public resetPromptProcessor(): void {
        this.promptProcessor.resetPromptProcessor();
    }

    public getPromptProcessorStats(): {
        totalMessages: number;
        currentStep: number;
        hasFinalAnswer: boolean;
        finalAnswer: string | null;
    } {
        const lastResponse = this.promptProcessor.chatHistory
            .filter((msg: ChatMessage) => msg.role === 'agent' && msg.type === MessageType.MESSAGE)
            .pop();
        
        return {
            totalMessages: this.promptProcessor.chatHistory.length,
            currentStep: this.currentStep,
            hasFinalAnswer: !!this.promptProcessor.getStopSignal(),
            finalAnswer: lastResponse?.content || null
        };
    }

    setCallBacks(callbacks: AgentCallbacks): void {
        this.callbacks = callbacks;
        logger.info(`Agent ${this.id}: Session callback set`);
    }

    async loadAgentStorage(state: AgentStorage): Promise<void> {
        state.agentId = this.id;
        this.sessionId = state.sessionId;
        this.currentStep = state.currentStep;
        this.agentStorage = state;

        logger.debug(`Agent ${this.id}: Loaded session state for ${state.sessionId}, currentStep: ${state.currentStep}`);
    }
}