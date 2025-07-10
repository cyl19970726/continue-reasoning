import { AnyTool, IContextManager, IAgent, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolExecutionResult, IRAGEnabledContext, asRAGEnabledContext, AgentStatus, AgentStep, ChatMessage, ToolSet, AgentStorage, MessageType, BasePromptProcessor } from "./interfaces/index.js";
import { IEventBus, EventBus, EventPublisher } from "./event-bus/index.js";

/**
 * Agent专用的EventPublisher实现
 */
class AgentEventPublisher extends EventPublisher {
    constructor(eventBus: IEventBus, componentName: string) {
        super(eventBus, componentName);
    }
}
import { ToolExecutor } from "./tool-executor.js";
import { DeepWikiContext, FireCrawlContext } from "./contexts/index.js";
import { TaskQueue } from "./taskQueue.js";
import { ITaskQueue } from "./interfaces/tool.js";
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
    
    // Event Bus for event-driven architecture
    eventBus: IEventBus;
    
    // Event Publisher for unified event publishing
    protected eventPublisher: EventPublisher;
    
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
        eventBus?: IEventBus,
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
        this.contextManager = new ContextManager(id, name);
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
        
        // 初始化 EventBus（使用传入的或创建新的）
        this.eventBus = eventBus || new EventBus(1000);
        
        // 初始化 EventPublisher
        this.eventPublisher = new AgentEventPublisher(this.eventBus, `agent.${this.id}`);

        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
        this.currentStep = 0;
        this.currentStepData = null;

        // 初始化 contexts
        this.contextManager.registerContexts(this.contexts);
    }

    public getBaseSystemPrompt(tools: AnyTool[]): string {
        const systemPrompt = getSystemPromptForMode(
            this.promptProcessor.type,
        );
        return systemPrompt;
    }

    // 抽象方法，由子类实现
    protected abstract processStep(
        userInput: string,
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }>;

    // 工具调用执行方法
    protected async executeToolCall(toolCall: import('./interfaces/tool.js').ToolCallParams, _stepIndex: number): Promise<void> {
        const startTime = Date.now();
        
        // 发布工具调用开始事件
        await this.eventPublisher.publishToolExecutionStarted(toolCall, _stepIndex, this.sessionId);

        logger.info(`🔧 [Step ${_stepIndex}] Executing tool: ${toolCall.name}`);

        try {
            // 使用ToolExecutor执行工具调用
            const result = await this.toolExecutor.execute(
                toolCall,
                this
            );

            const endTime = Date.now();
            
            // 发布工具执行完成事件
            this.eventBus.publish({
                type: 'tool.execution.completed',
                timestamp: endTime,
                source: `agent.${this.id}`,
                stepIndex: _stepIndex,
                sessionId: this.sessionId,
                data: {
                    toolCall,
                    result
                }
            });

            logger.info(`✅ [Step ${_stepIndex}] Tool ${toolCall.name} executed successfully in ${endTime - startTime}ms`);
            
            // 处理工具调用结果
            this.processToolCallResult(result);

        } catch (error) {
            const endTime = Date.now();
            
            // 发布工具执行错误事件
            this.eventBus.publish({
                type: 'tool.execution.error',
                timestamp: endTime,
                source: `agent.${this.id}`,
                stepIndex: _stepIndex,
                sessionId: this.sessionId,
                data: {
                    toolCall,
                    error: error instanceof Error ? error.message : String(error),
                    executionTime: endTime - startTime
                }
            });

            logger.error(`❌ [Step ${_stepIndex}] Tool ${toolCall.name} execution failed:`, error);
            throw error;
        }
    }

    async setup(): Promise<void> {
        logger.info(`🔧 Starting agent setup for ${this.name} (ID: ${this.id})`);
        
        // 发布Agent设置开始事件
        this.eventBus.publish({
            type: 'agent.setup.started',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            data: {
                agentId: this.id,
                agentName: this.name
            }
        });

        await this.changeState('initializing', 'Setting up agent');

        // 初始化 Context Manager
        await this.contextManager.setup();
        logger.info(`✅ ContextManager initialized with ${this.contextManager.contextList().length} contexts`);

        // 从 contexts 中提取 toolSets 并添加到 agent
        await this.initializeToolSetsFromContexts();

        // 初始化 Task Queue
        await this.taskQueue.start();
        logger.info(`✅ Task Queue started with concurrency: ${this.taskQueue.getConcurrency()}`);

        // 设置初始系统提示
        const tools = this.getActiveTools();
        const systemPrompt = this.getBaseSystemPrompt(tools);
        this.promptProcessor.updateSystemPrompt(systemPrompt);
        logger.info(`✅ System prompt initialized (${systemPrompt.length} chars)`);

        await this.changeState('idle', 'Agent setup completed');
        
        // 发布Agent设置完成事件
        this.eventBus.publish({
            type: 'agent.setup.completed',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            data: {
                agentId: this.id,
                agentName: this.name
            }
        });

        logger.info(`✅ Agent setup completed for ${this.name}`);
    }

    /**
     * 从 contexts 中提取 toolSet 并添加到 agent
     */
    private async initializeToolSetsFromContexts(): Promise<void> {
        const contexts = this.contextManager.contextList();
        let totalTools = 0;
        
        for (const context of contexts) {
            try {
                // 检查 context 是否有 toolSet 或 toolSetFn 方法
                let toolSet = null;
                
                if (typeof (context as any).toolSetFn === 'function') {
                    toolSet = (context as any).toolSetFn();
                } else if (typeof (context as any).toolSet === 'function') {
                    toolSet = (context as any).toolSet();
                } else if ((context as any).toolSet) {
                    toolSet = (context as any).toolSet;
                }
                
                if (toolSet) {
                    // 如果是数组，遍历添加
                    if (Array.isArray(toolSet)) {
                        for (const ts of toolSet) {
                            this.addToolSet(ts);
                            totalTools += ts.tools?.length || 0;
                        }
                    } else {
                        // 单个 toolSet
                        this.addToolSet(toolSet);
                        totalTools += toolSet.tools?.length || 0;
                    }
                    
                    logger.debug(`✅ Added toolSet from context ${context.id}: ${toolSet.name || 'unnamed'}`);
                }
            } catch (error) {
                logger.error(`❌ Error extracting toolSet from context ${context.id}:`, error);
            }
        }
        
        logger.info(`✅ Initialized ${this.toolSets.length} toolSets with ${totalTools} total tools from ${contexts.length} contexts`);
    }

    async changeState(newState: AgentStatus, reason?: string): Promise<void> {
        const previousState = this.currentState;
        this.currentState = newState;
        
        // 发布状态变化事件
        this.eventBus.publish({
            type: 'agent.state.changed',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            data: {
                agentId: this.id,
                previousState,
                newState,
                reason,
                sessionId: this.sessionId
            }
        });

        logger.info(`🔄 Agent state changed: ${previousState} -> ${newState} ${reason ? `(${reason})` : ''}`);
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
        this.sessionId = sessionId;
        this.maxSteps = maxSteps;
        this.agentStorage.sessionId = sessionId;
        this.agentStorage.sessionStartTime = Date.now();
        this.agentStorage.lastActiveTime = Date.now();

        // 发布会话开始事件
        this.eventBus.publish({
            type: 'session.started',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            sessionId: sessionId,
            data: {
                sessionId,
                agentId: this.id,
                userInput,
                maxSteps
            }
        });

        logger.info(`🎯 Starting new session: ${sessionId} for agent: ${this.id}`);
        logger.info(`📝 User input: "${userInput}"`);
        logger.info(`🔢 Max steps: ${maxSteps}`);

        // 重置步骤计数器
        this.currentStep = 0;
        this.currentStepData = null;

        // 检查是否需要保存到存储
        this.eventBus.publish({
            type: 'storage.save.requested',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            data: {
                sessionId,
                storage: this.agentStorage
            }
        });

        // 重置 promptProcessor
        this.promptProcessor.resetPromptProcessor();
        
        // 设置系统提示 - 这是关键的修复！
        const tools = this.getActiveTools();
        const systemPrompt = this.getBaseSystemPrompt(tools);
        this.promptProcessor.updateSystemPrompt(systemPrompt);
        
        logger.info(`🔧 System prompt updated (${systemPrompt.length} chars)`);

        // 添加用户输入到聊天历史
        this.promptProcessor.chatHistory.push({
            role: 'user',
            type: MessageType.MESSAGE,
            content: userInput,
            step: this.currentStep,
            timestamp: new Date().toISOString()
        });

        await this.changeState('running', 'Starting task processing');

        this.shouldStop = false;

        logger.info(`🚀 Starting agent execution with maxSteps: ${maxSteps}, currentStep: ${this.currentStep}`);

        // 发布会话开始事件
        if (this.eventPublisher) {
            await this.eventPublisher.publishSessionStarted(
                this.sessionId,
                this.id
            );
        }

        try {
            // 开始执行步骤循环
            await this.stepsLoop(userInput, maxSteps, options);
        } catch (error) {
            logger.error('❌ Agent execution failed:', error);
            
            // 发布错误事件
            if (this.eventPublisher) {
                await this.eventPublisher.publishErrorEvent(
                    error instanceof Error ? error : new Error(String(error)),
                    'Agent execution failed'
                );
            }
            
            // 发布会话结束事件
            if (this.eventPublisher) {
                await this.eventPublisher.publishSessionEnded(
                    this.sessionId,
                    this.id
                );
            }
            
            throw error;
        }

        // 在所有步骤完成后，一次性保存所有步骤的prompt
        if (options?.savePromptPerStep && this.promptProcessor) {
            await this.saveAllStepPrompts(options);
        }

        logger.info('✅ Agent execution completed successfully');
        await this.changeState('idle', 'Task processing completed');
        
        // 发布会话结束事件
        if (this.eventPublisher) {
            await this.eventPublisher.publishSessionEnded(
                this.sessionId,
                this.id
            );
        }
    }

    private async stepsLoop(userInput: string, maxSteps: number, _options?: {
        savePromptPerStep?: boolean;
        promptSaveDir?: string;
        promptSaveFormat?: 'markdown' | 'json' | 'both';
    }): Promise<void> {
        let agentSteps: AgentStep[] = [];
        while (this.currentStep < maxSteps && !this.shouldStop) {
            logger.info(`\n🔄 --- Step ${this.currentStep}/${maxSteps} ---`);
            
            // 发布步骤开始事件
            if (this.eventPublisher) {
                await this.eventPublisher.publishStepStarted(
                    this.currentStep,
                    this.sessionId
                );
            }
            
            // 使用PromptProcessor处理此步骤
            try {
                const result = await this.processStep(
                    userInput,
                    this.currentStep,
                );
                agentSteps.push(result.agentStep);

                // 发布Agent步骤完成事件
                this.eventBus.publish({
                    type: 'agent.step.completed',
                    timestamp: Date.now(),
                    source: `agent.${this.id}`,
                    stepIndex: this.currentStep,
                    data: {
                        step: result.agentStep,
                        sessionId: this.sessionId
                    }
                });

                if (!result.continueProcessing) {
                    logger.info(`✅ Agent decided to stop at step ${this.currentStep}`);
                    break;
                }
            } catch (error) {
                logger.error(`❌ Step ${this.currentStep} failed:`, error);
                
                // 发布步骤失败事件
                if (this.eventPublisher) {
                    await this.eventPublisher.publishStepFailed(
                        this.currentStep,
                        this.sessionId,
                        error instanceof Error ? error.message : String(error)
                    );
                }
                
                // 发布通用错误事件
                if (this.eventPublisher) {
                    await this.eventPublisher.publishErrorEvent(
                        error instanceof Error ? error : new Error(String(error)),
                        `Step ${this.currentStep} processing failed`
                    );
                }
                
                // 根据错误类型决定是否继续
                throw error;
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

        // 发布Agent停止事件
        this.eventBus.publish({
            type: 'agent.stopped',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            data: {
                agentId: this.id,
                sessionId: this.sessionId,
                reason: 'User requested stop'
            }
        });

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

    getEventBus(): IEventBus {
        return this.eventBus;
    }

    async loadAgentStorage(state: AgentStorage): Promise<void> {
        state.agentId = this.id;
        this.sessionId = state.sessionId;
        this.currentStep = state.currentStep;
        this.agentStorage = state;

        logger.debug(`Agent ${this.id}: Loaded session state for ${state.sessionId}, currentStep: ${state.currentStep}`);
    }
}