import { AnyTool, IContextManager, IMemoryManager, IAgent, IClient, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolCallResult, IRAGEnabledContext, asRAGEnabledContext } from "./interfaces";
import { SystemToolNames, HackernewsContext, DeepWikiContext, FireCrawlContext } from "./contexts/index";
import { ITaskQueue, ITask, TaskQueue } from "./taskQueue";
import { z } from "zod";
import { Message,ToolSet } from "./interfaces";
import dotenv from "dotenv";
import { error, time } from "console";
import { PlanContext } from "./contexts/plan";
import { MCPContext, MCPContextId, AddStdioMcpServer, AddSseOrHttpMcpServer } from "./contexts/mcp";
import { WebSearchContext } from "./contexts/web-search";
import { OpenAIWrapper } from "./models/openai";
import { AnthropicWrapper } from "./models/anthropic";
import { GeminiWrapper } from "./models/gemini";
import { SupportedModel, getModelProvider, OPENAI_MODELS } from "./models";
import path from "path";
import { LogLevel, Logger } from "./utils/logger";
import { ToolSetContext } from "./contexts/toolset";
import { logger } from "./utils/logger";
import { IEventBus } from "./events/eventBus";
import { Agent } from "http";
import { ContextManager } from "./context";
// 导入 PromptProcessor 相关类型和实现
import { 
    StandardExtractorResult, 
    ChatMessage, 
    AgentStep, 
    ToolExecutionResult
} from "./interfaces";
import { ProductionPromptProcessor, createProductionPromptProcessor } from "./prompt-processor";
// 🆕 导入事件管理器
import { AgentEventManager } from "./events/agent-event-manager";

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
        enableToolCallsForFirstStep?: boolean;
        maxHistoryLength?: number;
    };
}

// Agent状态枚举
export type AgentState = 'idle' | 'running' | 'stopping' | 'error';

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
    eventBus?: IEventBus; // 添加EventBus支持
    executionMode: 'auto' | 'manual' | 'supervised' = 'manual'; // Agent执行模式，默认为manual

    isRunning: boolean;
    shouldStop: boolean;
    currentState: AgentState = 'idle'; // 添加状态跟踪
    currentStep: number = 0; // 添加步骤跟踪

    contexts: IRAGEnabledContext<any>[] = [];

    // 新增 PromptProcessor 相关属性
    promptProcessor: ProductionPromptProcessor;

    // 🆕 事件管理器
    private eventManager?: AgentEventManager;

    constructor(
        id: string, 
        name: string, 
        description: string, 
        maxSteps: number,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions, 
        contexts?: IContext<any>[],
        eventBus?: IEventBus // 添加EventBus参数
    ){

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
        this.eventBus = eventBus; // 设置EventBus
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
        
        // 初始化 PromptProcessor
        this.promptProcessor = createProductionPromptProcessor(
            this.getBaseSystemPrompt([]), // 先传入空工具列表
            this.contextManager,
            {
                enableToolCallsForFirstStep: agentOptions?.promptProcessorOptions?.enableToolCallsForFirstStep,
                xmlExtractorOptions: {
                    caseSensitive: false,
                    preserveWhitespace: false,
                    allowEmptyContent: true,
                    fallbackToRegex: true
                }
            }
        );


        // Set MCP config path
        this.mcpConfigPath = agentOptions?.mcpConfigPath || path.join(process.cwd(), 'config', 'mcp.json');
        logger.info(`MCP config path: ${this.mcpConfigPath}`);

        // 🆕 初始化事件管理器
        if (eventBus) {
            this.eventManager = new AgentEventManager(eventBus, this.id);
        }

        let taskConcurency = agentOptions?.taskConcurency ? agentOptions?.taskConcurency : 5;
        this.taskQueue = new TaskQueue(taskConcurency);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }

    private getBaseSystemPrompt(tools: AnyTool[]): string {
        return `你是一个智能体，能够调用多种工具来完成任务。

重要：你的所有回复必须严格按照以下格式输出，不可偏离：

<think>
在这里进行思考、分析和计划制定。你可以：
- 分析用户的需求
- 制定行动计划用 markdown 的 todo list 格式
- 在必要的时候更新之前制定的行动计划，或者更新行动计划的状态
- 思考需要调用哪些工具
- 分析工具调用结果
- 更新计划状态
避免使用"step"等字样，用"任务"、"阶段"等替代。
</think>

<final_answer>
重要：在任务执行过程中，这里必须保持为空！
只有当你确认所有任务都已完成并且用户的需求得到完全满足时，才在这里给出最终回答。
如果任务还在进行中，请保持此标签为空。
</final_answer>

注意：你是多阶段智能体，会重复调用直到任务完成。每个阶段都包含之前的必要信息，请查看"## Chat History List"了解之前的工作。

可用工具：
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}`;
    }

    // 新增：使用 PromptProcessor 处理步骤
    private async processStepWithPromptProcessor(
        userInput: string,
        stepIndex: number,
        conversationHistory?: Array<{
            id: string;
            role: 'user' | 'agent' | 'system';
            content: string;
            timestamp: number;
            metadata?: Record<string, any>;
        }>
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }> {
        try {
            // 如果是第一步，添加用户输入到历史
            if (stepIndex === 0) {
                
                // 如果有对话历史，也添加进去
                if (conversationHistory && conversationHistory.length > 0) {
                    const historyMessages: ChatMessage[] = conversationHistory.map((msg, index) => ({
                        role: msg.role as 'user' | 'agent' | 'system',
                        step: -1 - index, // 使用负数表示历史消息
                        content: msg.content,
                        timestamp: new Date(msg.timestamp).toISOString()
                    }));
                    this.promptProcessor.renderChatMessageToPrompt(historyMessages);
                }

                const userMessage: ChatMessage = {
                    role: 'user',
                    step: stepIndex,
                    content: userInput,
                    timestamp: new Date().toISOString()
                };
                this.promptProcessor.renderChatMessageToPrompt([userMessage]);
            }

            // 生成 prompt
            const prompt = await this.promptProcessor.formatPrompt(stepIndex);
            logger.debug('Generated prompt', { length: prompt.length });

            // 获取工具定义
            const toolDefs = this.promptProcessor.enableToolCallsForStep(stepIndex) 
                ? this.getActiveTools().map(tool => tool.toCallParams())
                : [];

            logger.info('Tool calls enabled for step', { stepIndex, toolDefs: toolDefs.map(t => t.name) });
            
            // 调用 LLM
            const llmResponse = await this.llm.call(prompt, toolDefs);
            const responseText = llmResponse.text || '';
            logger.info('[PromptProcessor] responseText', { responseText });
            const toolCalls = llmResponse.toolCalls || [];

            // 创建当前步骤
            const currentStep: AgentStep = {
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
                    if (this.eventManager) {
                        await this.eventManager.publishToolExecutionStarted(
                            tool.name,
                            toolCall.call_id || `${tool.name}_${Date.now()}`,
                            toolCall.parameters,
                            stepIndex
                        );
                    }

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
                    if (this.eventManager) {
                        await this.eventManager.publishToolExecutionResult(
                            tool.name,
                            toolCallResult.call_id,
                            true,
                            result,
                            undefined,
                            executionTime,
                            stepIndex
                        );
                    }
                    
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

            // 使用 PromptProcessor 处理步骤结果
            this.promptProcessor.processStepResult(currentStep);

            // 提取结果
            const extractorResult = this.promptProcessor.textExtractor(responseText);
            currentStep.extractorResult = extractorResult;

            // 🆕 发布事件
            if (this.eventManager) {
                // 发布 step 事件
                await this.eventManager.publishAgentStep(currentStep);

                // 发布 thinking 事件
                if (extractorResult.thinking) {
                    await this.eventManager.publishThinking(
                        stepIndex,
                        {
                            analysis: extractorResult.thinking,
                            plan: '',
                            reasoning: extractorResult.thinking,
                            nextAction: ''
                        },
                        toolCalls,
                        responseText
                    );
                }

                // 发布 reply 事件
                if (extractorResult.finalAnswer) {
                    await this.eventManager.publishReply(
                        extractorResult.finalAnswer,
                        'final_answer',
                        {
                            reasoning: extractorResult.thinking,
                            confidence: 85,
                            stepNumber: stepIndex
                        }
                    );
                }
            }

            // 检查是否应该继续
            const finalAnswer = this.promptProcessor.getFinalAnswer();
            const continueProcessing = !finalAnswer;
            
            if (finalAnswer) {
                logger.info('Final answer reached', { finalAnswer });
            }

            return {
                continueProcessing,
                agentStep: currentStep
            };

        } catch (error) {
            logger.error('Error in prompt processor step:', error);
            
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

    async setup(): Promise<void>{
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

        // 订阅ExecutionModeChangeEvent
        if (this.eventBus) {
            this.setupEventHandlers(); // 设置用户输入相关的事件处理器
        }

        // 🆕 在 setup 完成后，更新 PromptProcessor 的 system prompt，包含所有工具信息
        const allTools = this.getActiveTools();
        logger.info(`[PromptProcessor] Active tools: ${allTools.map(t => t.name).join(', ')}`);
        const updatedSystemPrompt = this.getBaseSystemPrompt(allTools);
        this.promptProcessor.updateSystemPrompt(updatedSystemPrompt);
        logger.info(`[PromptProcessor] Updated system prompt with ${allTools.length} tools`);
    }

    // 添加状态变更方法
    private async changeState(newState: AgentState, reason?: string): Promise<void> {
        const oldState = this.currentState;
        this.currentState = newState;
        
        logger.info(`Agent state changed: ${oldState} -> ${newState}${reason ? ` (${reason})` : ''}`);
        
        // 🆕 使用事件管理器发布状态变更事件
        if (this.eventManager) {
            await this.eventManager.publishStateChange(oldState, newState, reason, this.currentStep);
        }
    }

    async startWithUserInput(
        userInput: string, 
        maxSteps: number, 
        options?: {
            savePromptPerStep?: boolean;  // 是否保存步骤prompt文件
            promptSaveDir?: string;       // prompt保存目录
            promptSaveFormat?: 'markdown' | 'json' | 'both';  // 保存格式
            conversationHistory?: Array<{  // 🆕 添加对话历史参数
                id: string;
                role: 'user' | 'agent' | 'system';
                content: string;
                timestamp: number;
                metadata?: Record<string, any>;
            }>;
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

        await this.changeState('running', 'Starting task processing');

        try {
            // 重置状态
            this.currentStep = 0;
            this.shouldStop = false;

            // 🆕 支持对话历史
            if (options?.conversationHistory) {
                logger.info(`Loading conversation history: ${options.conversationHistory.length} messages`);
                // 将对话历史添加到PromptProcessor
                const chatMessages = options.conversationHistory.map(historyItem => ({
                    role: historyItem.role,
                    content: historyItem.content,
                    step: -1, // 使用-1表示历史消息
                    timestamp: new Date(historyItem.timestamp).toISOString()
                }));
                this.promptProcessor.renderChatMessageToPrompt(chatMessages);
            }

            logger.info(`🚀 Starting agent execution with maxSteps: ${maxSteps}`);
            
            // 开始执行步骤循环
            await this.executeStepsLoop(userInput, maxSteps, options);

            // 🆕 在所有步骤完成后，一次性保存所有步骤的prompt
            if (options?.savePromptPerStep && this.promptProcessor) {
                await this.saveAllStepPrompts(options);
            }

            logger.info('✅ Agent execution completed successfully');
            await this.changeState('idle', 'Task processing completed');

        } catch (error) {
            logger.error('❌ Agent execution failed:', error);
            await this.changeState('error', `Execution failed: ${error}`);
            throw error;
        }
    }

    private async executeStepsLoop(userInput: string, maxSteps: number, options?: {
        savePromptPerStep?: boolean;  // 是否保存步骤prompt文件
        promptSaveDir?: string;       // prompt保存目录
        promptSaveFormat?: 'markdown' | 'json' | 'both';  // 保存格式
        conversationHistory?: Array<{
            id: string;
            role: 'user' | 'agent' | 'system';
            content: string;
            timestamp: number;
            metadata?: Record<string, any>;
        }>;
    }): Promise<void> {
        while (this.currentStep < maxSteps && !this.shouldStop) {
            logger.info(`\n🔄 --- Step ${this.currentStep}/${maxSteps} ---`);

            try {
                // 使用PromptProcessor处理此步骤
                const result = await this.processStepWithPromptProcessor(
                    userInput, 
                    this.currentStep,
                    options?.conversationHistory
                );

                // 🆕 使用事件管理器发布步骤完成事件
                if (this.eventManager) {
                    await this.eventManager.publishAgentStep(result.agentStep);
                }

                if (!result.continueProcessing) {
                    logger.info(`✅ Agent decided to stop at step ${this.currentStep}`);
                    break;
                }

            } catch (error) {
                logger.error(`❌ Error in step ${this.currentStep}:`, error);
                
                // 🆕 使用事件管理器发布步骤错误事件
                if (this.eventManager) {
                    await this.eventManager.publishStepError(this.currentStep, new Error(String(error)));
                }
                
                // 如果是第一步就失败，重新抛出错误
                if (this.currentStep === 0) {
                    throw error;
                }
                
                // 否则记录错误但继续下一步
                logger.warn(`⚠️ Continuing to next step after error in step ${this.currentStep}`);
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
     * 设置事件处理器（在 Agent 启动时调用）
     */
    setupEventHandlers(): void {
        if (!this.eventBus) return;

        // 处理用户消息事件
        this.eventBus.subscribe('user_message', async (event: any) => {
            await this.handleUserMessage(event);
        });

        // 处理输入响应事件
        this.eventBus.subscribe('input_response', async (event: any) => {
            await this.handleInputResponse(event);
        });
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
            await this.startWithUserInput(content, this.maxSteps, startOptions);
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
     * 🆕 事件发布能力
     */
    async publishEvent(eventType: string, payload: any, sessionId?: string): Promise<void> {
        // 🆕 优先使用事件管理器
        if (this.eventManager) {
            if (sessionId && sessionId !== this.eventManager.getSessionId()) {
                this.eventManager.updateSessionId(sessionId);
            }
            await this.eventManager.publishCustomEvent(eventType, payload);
            return;
        }

        // 后备方案：直接使用 EventBus
        if (!this.eventBus) {
            throw new Error('EventBus is not available');
        }
        
        await this.eventBus.publish({
            type: eventType,
            source: 'agent',
            sessionId: sessionId || this.eventBus.getActiveSessions()[0] || 'default',
            payload
        });
    }

    /**
     * 🆕 订阅事件
     */
    subscribe(eventType: string, handler: (event: any) => void): string {
        if (!this.eventBus) {
            throw new Error('EventBus is not available');
        }
        
        // 包装handler为MessageHandler（返回Promise<void>）
        const wrappedHandler = async (event: any) => {
            try {
                handler(event);
            } catch (error) {
                logger.error(`Error in event handler for ${eventType}:`, error);
            }
        };
        
        return this.eventBus.subscribe(eventType, wrappedHandler);
    }

    /**
     * 🆕 取消订阅事件
     */
    unsubscribe(subscriptionId: string): void {
        if (!this.eventBus) {
            throw new Error('EventBus is not available');
        }
        
        this.eventBus.unsubscribe(subscriptionId);
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
            await this.startWithUserInput(input, this.maxSteps, startOptions);
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
    public getPromptProcessor(): ProductionPromptProcessor {
        return this.promptProcessor;
    }

    // 新增：重置PromptProcessor
    public resetPromptProcessor(): void {
        this.promptProcessor.resetFinalAnswer();
        this.promptProcessor.chatMessagesHistory = [];
        logger.info('Prompt Processor reset');
    }

    // 新增：获取处理器统计信息
    public getPromptProcessorStats(): {
        totalMessages: number;
        currentStep: number;
        hasFinalAnswer: boolean;
        finalAnswer: string | null;
    } {
        return {
            totalMessages: this.promptProcessor.chatMessagesHistory.length,
            currentStep: this.currentStep,
            hasFinalAnswer: !!this.promptProcessor.getFinalAnswer(),
            finalAnswer: this.promptProcessor.getFinalAnswer()
        };
    }
}

