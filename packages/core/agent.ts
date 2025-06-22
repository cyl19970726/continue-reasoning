import { AnyTool, IContextManager, IAgent, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolCallResult, IRAGEnabledContext, asRAGEnabledContext, AgentStatus, AgentStep, StandardExtractorResult, ChatMessage, ToolSet, AgentStorage, AgentCallbacks, MessageType, BasePromptProcessor, ExtractorResult } from "./interfaces";
import { SystemToolNames, HackernewsContext, DeepWikiContext, FireCrawlContext } from "./contexts/index";
import { ITaskQueue, TaskQueue } from "./taskQueue";
import dotenv from "dotenv";
import { PlanContext } from "./contexts/plan";
import { MCPContext } from "./contexts/mcp";
import { WebSearchContext } from "./contexts/web-search";
import { OpenAIWrapper } from "./models/openai";
import { AnthropicWrapper } from "./models/anthropic";
import { GeminiWrapper } from "./models/gemini";
import { SupportedModel, getModelProvider, OPENAI_MODELS } from "./models";
import path from "path";
import { LogLevel, Logger } from "./utils/logger";
import { ToolSetContext } from "./contexts/toolset";
import { logger } from "./utils/logger";
import { ContextManager } from "./context";
import { createEnhancedPromptProcessor, createStandardPromptProcessor } from "./prompts/prompt-processor-factory";
import { AgentEventManager } from "./events/agent-event-manager";
import { getSystemPromptForMode } from "./prompts/system-prompt";

dotenv.config();

const SYSTEM_CONTEXTS = [
    MCPContext,
    ToolSetContext,
]

const DEFAULT_CONTEXTS = [
    // Planning context (计划和组织)
    PlanContext,

    // Execution and utility contexts (执行和工具)
    WebSearchContext,
    MCPContext,
    ToolSetContext,
    HackernewsContext,
    DeepWikiContext,
    FireCrawlContext,
]

const DEFAULT_AGENT_OPTIONS: AgentOptions = {
    model: OPENAI_MODELS.GPT_4O,
    enableParallelToolCalls: false,
    temperature: 0.7,
    taskConcurency: 5,
    promptOptimization: {
        mode: "minimal",
        customSystemPrompt: "",
        maxTokens: 100000,
    },
    // 新增 PromptProcessor 选项
    promptProcessorOptions: {
        type: 'standard',
        enableToolCallsForFirstStep: false,
        maxHistoryLength: 50
    },
}

export interface AgentOptions {
    model?: SupportedModel; // 指定具体模型，默认使用 GPT-4o
    enableParallelToolCalls?: boolean;
    temperature?: number;
    taskConcurency?: number;
    mcpConfigPath?: string; // Path to MCP config file
    executionMode?: 'auto' | 'manual' | 'supervised'; // Agent执行模式：auto(无approval) | manual(有approval) | supervised(有监督)
    promptOptimization?: {
        mode: 'minimal' | 'standard' | 'detailed' | 'custom';
        customSystemPrompt?: string;
        maxTokens?: number;
    };
    // 新增 PromptProcessor 选项
    promptProcessorOptions?: {
        type: 'standard' | 'enhanced';
        enableToolCallsForFirstStep?: boolean;
        maxHistoryLength?: number;
    };
}

export class BaseAgent implements IAgent {
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    contextManager: IContextManager;
    llm: ILLM;
    taskQueue: ITaskQueue;
    enableParallelToolCalls: boolean;
    toolSets: ToolSet[] = [];
    mcpConfigPath: string;
    executionMode: 'auto' | 'manual' | 'supervised' = 'manual'; // Agent执行模式，默认为manual

    isRunning: boolean;
    shouldStop: boolean;
    currentState: AgentStatus = 'idle'; // 添加状态跟踪
    currentStep: number = 0; // 添加步骤跟踪
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

    // 新增 PromptProcessor 相关属性
    promptProcessor: BasePromptProcessor<any>;

    // 🆕 事件管理器
    private eventManager?: AgentEventManager;

    // 🆕 会话感知能力
    private sessionId?: string;
    callbacks?: AgentCallbacks;

    constructor(
        id: string,
        name: string,
        description: string,
        maxSteps: number,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions,
        contexts?: IContext<any>[],
    ) {

        this.agentStorage.agentId = id;
        agentOptions = agentOptions || DEFAULT_AGENT_OPTIONS;
        this.contexts = contexts || DEFAULT_CONTEXTS;

        // 设置日志级别 - 确保在其他操作之前执行
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

        // 简化的模型配置：直接使用模型
        const selectedModel: SupportedModel = agentOptions?.model || OPENAI_MODELS.GPT_4O;
        const provider = getModelProvider(selectedModel);

        // Initialize correct LLM based on provider
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
        } else {
            throw new Error(`Unsupported LLM provider: ${provider}`);
        }

        // Set LLM parallel tool calling
        if (this.llm.setParallelToolCall) {
            this.llm.setParallelToolCall(this.enableParallelToolCalls);
        } else {
            // Directly set the property if method isn't available
            this.llm.parallelToolCall = this.enableParallelToolCalls;
        }

        // 🆕 初始化 PromptProcessor - 使用工厂模式，默认为 Standard
        this.promptProcessor = agentOptions?.promptProcessorOptions?.type === 'enhanced' 
            ? createEnhancedPromptProcessor(
                this.getBaseSystemPrompt([], 'enhanced'),
                this.contextManager
            )
            : createStandardPromptProcessor(
                this.getBaseSystemPrompt([], 'standard'),
                this.contextManager
            );

        // Set MCP config path
        this.mcpConfigPath = agentOptions?.mcpConfigPath || path.join(process.cwd(), 'config', 'mcp.json');
        logger.info(`MCP config path: ${this.mcpConfigPath}`);

        let taskConcurency = agentOptions?.taskConcurency ? agentOptions?.taskConcurency : 5;
        this.taskQueue = new TaskQueue(taskConcurency);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }

    protected getBaseSystemPrompt(tools: AnyTool[], promptProcessorType: 'standard' | 'enhanced' = 'standard'): string {
        let systemPrompt = getSystemPromptForMode(promptProcessorType)
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

    // 新增：使用 PromptProcessor 处理步骤
    private async processStepWithPromptProcessor(
        userInput: string,
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }> {
        try {

            // 生成 prompt
            const prompt = await this.promptProcessor.formatPrompt(stepIndex);
            logger.debug('Generated prompt', { length: prompt.length });

            // 获取工具定义
            const toolDefs = this.promptProcessor.enableToolCallsForStep(stepIndex)
                ? this.getActiveTools().map(tool => tool.toCallParams())
                : [];

            logger.debug('Tool calls enabled for step', { stepIndex, toolDefs: toolDefs.map(t => t.name) });

            // 调用 LLM
            const llmResponse = await this.llm.call(prompt, toolDefs);
            const responseText = llmResponse.text || '';
            logger.debug('[PromptProcessor] responseText', { responseText });
            const toolCalls = llmResponse.toolCalls || [];

            // 创建当前步骤
            const currentStep: AgentStep<any> = {
                stepIndex: stepIndex,
                rawText: responseText,
                toolCalls: toolCalls.map(call => ({
                    name: call.name,
                    call_id: call.call_id,
                    params: call.parameters
                })),
                toolCallResults: []
            };

            // 执行工具调用
            const toolResults: Array<{
                name: string;
                call_id: string;
                params: any;
                status: 'pending' | 'succeed' | 'failed';
                result?: any;
                message?: string;
                executionTime?: number;
            }> = [];

            for (const toolCall of toolCalls) {
                const tool = this.getActiveTools().find(t => t.name === toolCall.name);

                if (!tool) {
                    const errorResult = {
                        name: toolCall.name,
                        call_id: toolCall.call_id || `${toolCall.name}_${Date.now()}`,
                        params: toolCall.parameters,
                        status: 'failed' as const,
                        message: `Tool ${toolCall.name} not found`,
                        executionTime: 0
                    };
                    toolResults.push(errorResult);

                    // 🆕 发布工具执行结果事件
                    if (this.eventManager) {
                        await this.eventManager.publishToolExecutionResult(
                            toolCall.name,
                            errorResult.call_id,
                            false,
                            undefined,
                            errorResult.message,
                            0,
                            stepIndex
                        );
                    }
                    continue;
                }

                try {
                    // 🆕 发布工具执行开始事件
                    this.callbacks?.onToolCall?.(toolCall);

                    const startTime = Date.now();
                    const result = await tool.execute(toolCall.parameters, this);
                    const executionTime = Date.now() - startTime;

                    const toolCallResult = {
                        name: tool.name,
                        call_id: toolCall.call_id || `${tool.name}_${Date.now()}`,
                        params: toolCall.parameters,
                        status: 'succeed' as const,
                        result: result,
                        executionTime
                    };
                    toolResults.push(toolCallResult);

                    // 🆕 发布工具执行结果事件
                    this.callbacks?.onToolCallResult?.(toolCallResult);

                    // 调用 processToolCallResult 以便其他系统能响应
                    this.processToolCallResult(result as ToolCallResult);

                } catch (error) {
                    const executionTime = Date.now();
                    const errorResult = {
                        name: tool.name,
                        call_id: toolCall.call_id || `${tool.name}_${Date.now()}`,
                        params: toolCall.parameters,
                        status: 'failed' as const,
                        message: error instanceof Error ? error.message : String(error),
                        executionTime: 0
                    };
                    toolResults.push(errorResult);

                    // 🆕 发布工具执行结果事件
                    if (this.eventManager) {
                        await this.eventManager.publishToolExecutionResult(
                            tool.name,
                            errorResult.call_id,
                            false,
                            undefined,
                            errorResult.message,
                            executionTime,
                            stepIndex
                        );
                    }
                }
            }

            // 完善步骤信息
            currentStep.toolCallResults = toolResults.map(tr => ({
                name: tr.name,
                call_id: tr.call_id,
                params: tr.params,
                status: tr.status,
                result: tr.result,
                message: tr.message,
                executionTime: tr.executionTime
            }));

            // 提取结果
            const extractorResult = this.promptProcessor.textExtractor(responseText);
            logger.debug('[[[extractorResult]]]', { extractorResult });
            currentStep.extractorResult = extractorResult;

            // 使用 PromptProcessor 处理步骤结果
            this.promptProcessor.processStepResult(currentStep);

            // logger.debug('currentStep', { currentStep });
            // 检查是否应该继续
            const continueProcessing = !extractorResult.stopSignal;

            if (extractorResult.stopSignal) {
                logger.info('Stop signal reached', { stopSignal: extractorResult.stopSignal });
            }

            return {
                continueProcessing,
                agentStep: currentStep
            };

        } catch (error) {
            logger.error('Error in prompt processor step:', error);

            // add error to prompt
            this.promptProcessor.renderErrorToPrompt(error instanceof Error ? error.message : String(error), stepIndex);

            // 创建错误步骤
            const errorStep: AgentStep = {
                stepIndex: stepIndex,
                error: error instanceof Error ? error.message : String(error)
            };

            return {
                continueProcessing: false,
                agentStep: errorStep
            };
        }
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
                    // Handle both single ToolSet and array of ToolSets
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
        // 如果有安装失败的，记录详细信息
        if (installResults.failedCount > 0) {
            const failedContexts = installResults.details
                .filter(detail => detail.status === 'failed')
                .map(detail => `${detail.contextId}: ${detail.error}`);
            logger.warn(`以下Context的MCP服务器安装失败:\n${failedContexts.join('\n')}`);
        }

        // 🆕 在 setup 完成后，更新 PromptProcessor 的 system prompt，包含所有工具信息
        const allTools = this.getActiveTools();
        logger.debug(`[PromptProcessor] Active tools: ${allTools.map(t => t.name).join(', ')}`);
        const updatedSystemPrompt = this.getBaseSystemPrompt(allTools, this.promptProcessor.type);
        this.promptProcessor.updateSystemPrompt(updatedSystemPrompt);
        logger.debug(`[PromptProcessor] Updated system prompt with ${allTools.length} tools`);
    }

    // 添加状态变更方法
    private async changeState(newState: AgentStatus, reason?: string): Promise<void> {
        const oldState = this.currentState;
        this.currentState = newState;

        logger.debug(`Agent state changed: ${oldState} -> ${newState}${reason ? ` (${reason})` : ''}`);

        // 🆕 使用事件管理器发布状态变更事件
        if (this.eventManager) {
            await this.eventManager.publishStateChange(oldState, newState, reason, this.currentStep);
        }
    }

    /**
     * 
     * feature:
     *   1. 对同一个会话可以多次调用该方法，会从上一次调用的地方继续执行
     *   2. 如果传入新的SessionId，会重置会话，并且加载新的SessionId的AgentStorage,从之前的状态开始执行
     */
    async startWithUserInput(
        userInput: string,
        maxSteps: number,
        sessionId: string,  // 🆕 可选的 sessionId
        options?: {
            savePromptPerStep?: boolean;  // 是否保存步骤prompt文件
            promptSaveDir?: string;       // prompt保存目录
            promptSaveFormat?: 'markdown' | 'json' | 'both';  // 保存格式
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

        // 🆕 会话管理逻辑
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
                // 仍然存储有状态继续执行  
                logger.info(`Agent ${this.id}: Continuing session ${sessionId} from step ${this.currentStep}`);
            }
        } else {
            // 从 step 0 开始执行
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

        // 🆕 不再重置 currentStep，保持会话连续性
        this.shouldStop = false;

        logger.info(`🚀 Starting agent execution with maxSteps: ${maxSteps}, currentStep: ${this.currentStep}`);

        // 开始执行步骤循环
        await this.executeStepsLoop(userInput, maxSteps, options);

        // 🆕 在所有步骤完成后，一次性保存所有步骤的prompt
        if (options?.savePromptPerStep && this.promptProcessor) {
            await this.saveAllStepPrompts(options);
        }

        logger.info('✅ Agent execution completed successfully');
        await this.changeState('idle', 'Task processing completed');
    }

    private async executeStepsLoop(userInput: string, maxSteps: number, options?: {
        savePromptPerStep?: boolean;  // 是否保存步骤prompt文件
        promptSaveDir?: string;       // prompt保存目录
        promptSaveFormat?: 'markdown' | 'json' | 'both';  // 保存格式
    }): Promise<void> {
        let agentSteps: AgentStep[] = [];
        while (this.currentStep < maxSteps && !this.shouldStop) {
            logger.info(`\n🔄 --- Step ${this.currentStep}/${maxSteps} ---`);
            // 使用PromptProcessor处理此步骤, 内部有错误处理步骤
            const result = await this.processStepWithPromptProcessor(
                userInput,
                this.currentStep,
            );
            agentSteps.push(result.agentStep);

            // 🆕 调用 onAgentStep 回调
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

        // 异步更新状态
        this.changeState('stopping', 'User requested stop').catch(error => {
            logger.error('Error updating state to stopping:', error);
        });
    }
    // New: Add a tool set
    addToolSet(toolSet: ToolSet) {
        if (this.toolSets.find(ts => ts.name === toolSet.name)) return;
        this.toolSets.push(toolSet);
    }

    listToolSets() {
        return this.toolSets;
    }

    // New: Activate specified tool sets (supports multiple)
    activateToolSets(names: string[]) {
        for (const name of names) {
            const ts = this.toolSets.find(ts => ts.name === name);
            if (ts && !ts.active) {
                ts.active = true;
            }
        }
    }

    // New: Deactivate specified tool sets (supports multiple)
    deactivateToolSets(names: string[]) {
        let changed = false;
        for (const name of names) {
            const ts = this.toolSets.find(ts => ts.name === name);
            if (ts && ts.active) {
                ts.active = false;
                changed = true;
            }
        }
    }

    // New: Get all tools from active tool sets, filtered by execution mode
    getActiveTools(): AnyTool[] {
        const allTools = this.toolSets.filter(ts => ts.active).flatMap(ts => ts.tools);

        if (this.executionMode === 'auto') {
            // Auto模式：过滤掉ApprovalRequestTool
            return allTools.filter(tool => tool.name !== 'approval_request');
        }

        return allTools; // Manual模式：包含所有工具
    }

    /**
     * Process a tool call result by notifying relevant contexts
     * This allows contexts to react to tool results and update their state
     * 
     * @param toolCallResult The result from a tool execution
     */
    protected processToolCallResult(toolCallResult: ToolCallResult): void {
        if (!toolCallResult) return;

        // Iterate through all contexts and call onToolCall if it exists
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

    /**
     * 处理用户消息事件
     */
    async handleUserMessage(event: any): Promise<void> {
        // 安全检查：只有在Agent处于idle状态时才处理新的用户消息
        if (this.currentState !== 'idle') {
            logger.debug(`Agent ${this.id} is in ${this.currentState} state, ignoring user message`);
            return;
        }

        // 检查消息是否为空或无效
        if (!event.payload || !event.payload.content || !event.payload.content.trim()) {
            logger.debug(`Agent ${this.id} received empty or invalid user message, ignoring`);
            return;
        }

        const { content, messageType, context, conversationHistory } = event.payload;
        logger.info(`Agent handling user message: "${content}" (type: ${messageType})`);

        // 🆕 构建包含对话历史的选项
        const startOptions: any = {
            savePromptPerStep: true,
            promptSaveDir: './step-prompts',
            promptSaveFormat: 'markdown'
        };

        // 🆕 如果事件中包含对话历史，添加到选项中
        if (conversationHistory && conversationHistory.length > 0) {
            logger.info(`User message event includes conversation history: ${conversationHistory.length} messages`);
            startOptions.conversationHistory = conversationHistory;
        }

        // 如果启用了思考系统，直接使用思考系统处理
        if (this.promptProcessor) {
            await this.startWithUserInput(content, this.maxSteps, this.sessionId || 'default-session', startOptions);
            return;
        }
    }

    /**
     * 处理输入响应事件
     */
    async handleInputResponse(event: any): Promise<void> {
        const { requestId, value } = event.payload;
        logger.info(`Agent handling input response for request ${requestId}: ${value}`);

        // 查找任何具有handleInputResponse方法的context
        const contexts = this.contextManager.contextList();
        for (const context of contexts) {
            if (context && 'handleInputResponse' in context && typeof (context as any).handleInputResponse === 'function') {
                try {
                    await (context as any).handleInputResponse(event);
                    logger.debug(`Input response handled by context: ${context.id}`);
                } catch (error) {
                    logger.error(`Error handling input response in context ${context.id}:`, error);
                }
            }
        }
    }


    /**
     * 🆕 处理用户输入的统一接口
     */
    async processUserInput(input: string, sessionId: string, conversationHistory?: Array<{
        id: string;
        role: 'user' | 'agent' | 'system';
        content: string;
        timestamp: number;
        metadata?: Record<string, any>;
    }>): Promise<void> {
        logger.info(`Agent processing user input: "${input}" in session ${sessionId}`);

        // 调用 beforeStart 钩子（如果子类实现了的话）
        if ('beforeStart' in this && typeof (this as any).beforeStart === 'function') {
            await (this as any).beforeStart();
        }

        // 🆕 构建包含对话历史的选项
        const startOptions: any = {
            savePromptPerStep: true,
            promptSaveDir: './step-prompts',
            promptSaveFormat: 'markdown'
        };
        if (conversationHistory && conversationHistory.length > 0) {
            logger.info(`Processing user input with conversation history: ${conversationHistory.length} messages`);
            startOptions.conversationHistory = conversationHistory;
        }

        // 使用思考系统处理输入
        if (this.promptProcessor) {
            await this.startWithUserInput(input, this.maxSteps, sessionId, startOptions);
        }
    }

    /**
     * 获取当前执行模式
     */
    getExecutionMode(): 'auto' | 'manual' | 'supervised' {
        return this.executionMode;
    }

    /**
     * 设置执行模式（支持异步）
     */
    async setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void> {
        const oldMode = this.executionMode;
        this.executionMode = mode;
        logger.info(`Agent execution mode changed: ${oldMode} -> ${mode}`);

        // 🆕 使用事件管理器发布执行模式变更事件
        if (this.eventManager) {
            await this.eventManager.publishExecutionModeChange(oldMode, mode, 'User requested mode change');
        }
    }

    /**
     * 🆕 一次性保存所有步骤的prompt文件
     */
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

    // 新增：设置工具调用控制
    public setEnableToolCallsForStep(enableFn: (stepIndex: number) => boolean): void {
        this.promptProcessor.setEnableToolCallsForStep(enableFn);
    }

    // 新增：获取PromptProcessor实例
    public getPromptProcessor(): BasePromptProcessor<any> {
        return this.promptProcessor;
    }

    // 🆕 设置PromptProcessor实例
    public setPromptProcessor(processor: BasePromptProcessor<any>): void {
        this.promptProcessor = processor;
        // 确保新的处理器有正确的上下文管理器
        this.promptProcessor.setContextManager(this.contextManager);
        logger.info(`PromptProcessor updated to: ${processor.constructor.name}`);
    }

    // 新增：重置PromptProcessor
    public resetPromptProcessor(): void {
        this.promptProcessor.resetPromptProcessor();
    }

    // 新增：获取处理器统计信息
    public getPromptProcessorStats(): {
        totalMessages: number;
        currentStep: number;
        hasFinalAnswer: boolean;
        finalAnswer: string | null;
    } {
        // Get the last response message from chat history
        const lastResponse = this.promptProcessor.chatHistory
            .filter(msg => msg.role === 'agent' && msg.type === MessageType.MESSAGE)
            .pop();
        
        return {
            totalMessages: this.promptProcessor.chatHistory.length,
            currentStep: this.currentStep,
            hasFinalAnswer: !!this.promptProcessor.getStopSignal(),
            finalAnswer: lastResponse?.content || null
        };
    }

    // 🆕 设置会话回调
    setCallBacks(callbacks: AgentCallbacks): void {
        this.callbacks = callbacks;
        logger.info(`Agent ${this.id}: Session callback set`);
    }

    // 🆕 加载会话状态
    async loadAgentStorage(state: AgentStorage): Promise<void> {
        state.agentId = this.id;
        this.sessionId = state.sessionId;
        this.currentStep = state.currentStep;
        this.agentStorage = state;

        logger.debug(`Agent ${this.id}: Loaded session state for ${state.sessionId}, currentStep: ${state.currentStep}`);
    }
}

