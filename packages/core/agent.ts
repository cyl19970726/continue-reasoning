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
// 新增思考系统导入
import { createThinkingSystem, ThinkingOrchestrator, ProcessResult } from "./thinking";

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
    // 新增思考系统选项
    enableThinkingSystem: false,
    thinkingOptions: {
        maxConversationHistory: 10,
        maxExecutionHistory: 5
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
    // 新增思考系统选项
    enableThinkingSystem?: boolean; // 是否启用思考系统
    thinkingOptions?: {
        maxConversationHistory?: number;
        maxExecutionHistory?: number;
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

    // 新增思考系统相关属性
    thinkingSystem?: ThinkingOrchestrator;
    enableThinking: boolean = false;

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

        // 思考系统配置
        this.enableThinking = agentOptions?.enableThinkingSystem ?? false;

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
        
        // 初始化思考系统
        if (this.enableThinking) {
            this.initializeThinkingSystem(agentOptions?.thinkingOptions);
        }

        // Set MCP config path
        this.mcpConfigPath = agentOptions?.mcpConfigPath || path.join(process.cwd(), 'config', 'mcp.json');
        logger.info(`MCP config path: ${this.mcpConfigPath}`);

        
        let taskConcurency = agentOptions?.taskConcurency ? agentOptions?.taskConcurency : 5;
        this.taskQueue = new TaskQueue(taskConcurency);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }

    // 新增：初始化思考系统
    private initializeThinkingSystem(thinkingOptions?: {
        maxConversationHistory?: number;
        maxExecutionHistory?: number;
    }): void {
        if (!this.llm) {
            throw new Error('LLM must be initialized before thinking system');
        }

        // 直接使用 ILLM 接口，不需要适配器
        this.thinkingSystem = createThinkingSystem(this.llm, {
            contextManager: this.contextManager,
            maxConversationHistory: thinkingOptions?.maxConversationHistory || 10,
            maxExecutionHistory: thinkingOptions?.maxExecutionHistory || 5
        });

        logger.info('Thinking system initialized');
    }

    // 新增：使用思考系统处理步骤
    private async processStepWithThinking(
        userInput: string,
        conversationHistory?: Array<{
            id: string;
            role: 'user' | 'agent' | 'system';
            content: string;
            timestamp: number;
            metadata?: Record<string, any>;
      }>): Promise<boolean> {
        if (!this.thinkingSystem) {
            throw new Error('Thinking system is not initialized');
        }

        try {
            const sessionId = `agent-session-${this.id}`;

            // 获取活跃工具的定义
            const toolDefinitions = this.getActiveTools().map(tool => {
               return tool.toCallParams();
            });

            // 使用思考系统处理这一步
            // 注意：如果是第一步，使用processUserInput；否则使用continueReasoning
            const result: ProcessResult = this.currentStep === 0 
                ? await this.thinkingSystem.processUserInput(userInput, sessionId, toolDefinitions, conversationHistory)
                : await this.thinkingSystem.continueReasoning(sessionId, toolDefinitions);

            logger.info(`Thinking step ${result.stepNumber} completed`);
            logger.info('Thinking Content:', result.thinking);
            logger.info('Response message:', result.response?.message);

            // 发布 thinking 事件（只有当有思考内容时）
            if (this.eventBus && result.thinking) {
                await this.eventBus.publish({
                    type: 'agent_thinking',
                    source: 'agent',
                    sessionId: sessionId,
                    payload: {
                        stepNumber: result.stepNumber,
                        thinking: {
                            analysis: result.thinking.analysis,
                            plan: result.thinking.plan,
                            reasoning: result.thinking.reasoning,
                            nextAction: result.thinking.nextAction
                        },
                        toolCalls: result.toolCalls,
                        rawThinking: result.rawText
                    }
                });
            }

            // 发布 reply 事件（只有当有 response message 且不为空时）
            if (this.eventBus && result.response && result.response.message && result.response.message.trim()) {
                await this.eventBus.publish({
                    type: 'agent_reply',
                    source: 'agent',
                    sessionId: sessionId,
                    payload: {
                        content: result.response.message,
                        replyType: 'text',
                        metadata: {
                            reasoning: result.thinking?.reasoning,
                            confidence: 85 // 可以基于thinking质量计算
                        }
                    }
                });
            }

            // 执行工具调用
            let shouldContinue = true;
            if (result.toolCalls.length > 0) {
                const toolResults = await this.executeThinkingToolCalls(result.toolCalls);
                await this.thinkingSystem.processToolResults(result.stepNumber, toolResults);
                
                // 检查是否有 agent_stop 工具调用
                const hasStopCall = result.toolCalls.some(call => 
                    call.name === 'agent_stop'
                );
                
                if (hasStopCall) {
                    shouldContinue = false;
                }
            }

            return shouldContinue;

        } catch (error) {
            logger.error('Error in thinking system step:', error);
            throw error;
        }
    }


    // 新增：执行思考系统的工具调用
    private async executeThinkingToolCalls(toolCalls: any[]): Promise<any[]> {
        const results: any[] = [];
        const allTools = this.getActiveTools();

        for (const toolCall of toolCalls) {
            // 处理不同的工具调用结构
            let toolName: string;
            let parameters: any;
            
            if (toolCall.function && toolCall.function.name) {
                // 传统结构：{ function: { name: "...", arguments: "..." } }
                toolName = toolCall.function.name;
                parameters = JSON.parse(toolCall.function.arguments);
            } else if (toolCall.name) {
                // 思考系统结构：{ name: "...", parameters: {...} }
                toolName = toolCall.name;
                parameters = toolCall.parameters;
            } else {
                logger.error(`Invalid tool call structure:`, toolCall);
                results.push({
                    success: false,
                    error: `Invalid tool call structure`
                });
                continue;
            }
            
            const tool = allTools.find(t => t.name === toolName);
            if (!tool) {
                logger.error(`Tool ${toolName} not found`);
                results.push({
                    success: false,
                    error: `Tool ${toolName} not found`
                });
                continue;
            }

            try {
                const result = await tool.execute(parameters, this);
                results.push(result);
                
                // 调用processToolCallResult以便其他系统能响应
                this.processToolCallResult(result as ToolCallResult);

            } catch (error) {
                logger.error(`Error executing tool ${toolName}:`, error);
                results.push({
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        return results;
    }

    // 新增：获取思考系统统计信息
    public getThinkingStats(): any {
        if (!this.thinkingSystem) {
            return { error: 'Thinking system not enabled' };
        }
        return this.thinkingSystem.getExecutionStats();
    }

    // 新增：导出思考会话
    public exportThinkingSession(): string | null {
        if (!this.thinkingSystem) {
            return null;
        }
        return this.thinkingSystem.exportSession();
    }

    // 新增：导入思考会话
    public importThinkingSession(sessionData: string): boolean {
        if (!this.thinkingSystem) {
            return false;
        }
        try {
            this.thinkingSystem.importSession(sessionData);
            return true;
        } catch (error) {
            logger.error('Failed to import thinking session:', error);
            return false;
        }
    }

    // 新增：重置思考系统
    public resetThinkingSystem(): void {
        if (this.thinkingSystem) {
            this.thinkingSystem.reset();
            logger.info('Thinking system reset');
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
    }

    // 添加状态变更方法
    private async changeState(newState: AgentState, reason?: string): Promise<void> {
        const oldState = this.currentState;
        this.currentState = newState;
        
        logger.info(`Agent state changed: ${oldState} -> ${newState}${reason ? ` (${reason})` : ''}`);
        
        // 发布状态变更事件
        if (this.eventBus) {
            await this.eventBus.publish({
                type: 'agent_state_change',
                source: 'agent',
                sessionId: 'agent-session',
                payload: {
                    fromState: oldState,
                    toState: newState,
                    reason,
                    currentStep: this.currentStep
                }
            });
        }
    }

    async startWithUserInput(
        userInput: string, 
        maxSteps: number, 
        options?: {
            savePromptPerStep?: boolean;  // 是否每步保存prompt
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
        if (this.isRunning) {
            logger.warn('Agent is already running');
            return;
        }

        try {
            await this.changeState('running', 'User requested start');
            this.isRunning = true;
            this.shouldStop = false;
            this.currentStep = 0;

            logger.info(`==========Agent Starting: Max Steps ${maxSteps} ==========`);
            logger.info(`Thinking system enabled: ${this.enableThinking}`);
            
            // 如果启用了每步保存prompt，记录设置
            if (options?.savePromptPerStep && this.enableThinking) {
                logger.info(`Prompt saving enabled: ${options.promptSaveFormat || 'markdown'} format to ${options.promptSaveDir || './step-prompts'}`);
            }

            // 将主要的执行逻辑放入taskQueue
            await this.taskQueue.addProcessStepTask(async () => {
                return await this.executeStepsLoop(userInput, maxSteps, options);
            }, 10); // 高优先级

        } catch (error) {
            logger.error('Error in agent start:', error);
            await this.changeState('error', `Start error: ${(error as Error).message}`);
        } finally {
            this.isRunning = false;
            if (this.currentState !== 'error') {
                await this.changeState('idle', 'Execution completed');
            }
        }
    }

    // 执行步骤循环
    private async executeStepsLoop(userInput: string, maxSteps: number, options?: {
        savePromptPerStep?: boolean;  // 是否每步保存prompt
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
        while (!this.shouldStop && this.currentStep < maxSteps) {
            logger.info(`==========Agent Current Step: ${this.currentStep} ==========`);
            
            // 发布步骤开始事件
            if (this.eventBus) {
                await this.eventBus.publish({
                    type: 'agent_step',
                    source: 'agent',
                    sessionId: 'agent-session',
                    payload: {
                        stepNumber: this.currentStep,
                        action: 'start'
                    }
                });
            }

            try {
                // 将每个processStep也放入taskQueue异步执行
                await this.taskQueue.addProcessStepTask(async () => {
                    // 根据是否启用思考系统选择不同的处理方法
                    if (this.enableThinking && this.thinkingSystem) {
                        const continueThinking = await this.processStepWithThinking(userInput,options?.conversationHistory);
                        if (!continueThinking) {
                            logger.info("The Thinking System is not able to continue reasoning, so the agent will stop");
                            this.stop();
                        }
                    } else {
                        throw new Error('Thinking system is not enabled');
                    }
                }, 5); // 中等优先级

                // 发布步骤完成事件
                if (this.eventBus) {
                    await this.eventBus.publish({
                        type: 'agent_step',
                        source: 'agent',
                        sessionId: 'agent-session',
                        payload: {
                            stepNumber: this.currentStep,
                            action: 'complete'
                        }
                    });
                }

                // 🆕 每步保存 prompt（如果启用）
                if (options?.savePromptPerStep && this.enableThinking && this.thinkingSystem) {
                    try {
                        await this.saveStepPrompt(this.currentStep, options);
                        logger.debug(`Prompt saved for step ${this.currentStep}`);
                    } catch (error) {
                        logger.error(`Failed to save prompt for step ${this.currentStep}:`, error);
                        // 不中断执行，只记录错误
                    }
                }

                this.currentStep++;

            } catch (error) {
                logger.error(`Error in step ${this.currentStep}:`, error);
                
                // 发布步骤错误事件
                if (this.eventBus) {
                    await this.eventBus.publish({
                        type: 'agent_step',
                        source: 'agent',
                        sessionId: 'agent-session',
                        payload: {
                            stepNumber: this.currentStep,
                            action: 'error',
                            error: (error as Error).message
                        }
                    });
                }
                
                throw error; // 重新抛出错误
            }

            if (this.shouldStop) {
                logger.info("Agent Stop Signal has been sent");
                break;
            }
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
        if (this.enableThinking && this.thinkingSystem) {
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
        const startOptions: any = {};
        if (conversationHistory && conversationHistory.length > 0) {
            logger.info(`Processing user input with conversation history: ${conversationHistory.length} messages`);
            startOptions.conversationHistory = conversationHistory;
        }
        
        // 使用思考系统处理输入
        if (this.enableThinking && this.thinkingSystem) {
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
        
        // 如果有EventBus，发布状态变更事件
        if (this.eventBus) {
            await this.eventBus.publish({
                type: 'agent_state_change',
                source: 'agent',
                sessionId: this.eventBus.getActiveSessions()[0] || 'default',
                payload: {
                    fromState: 'idle',
                    toState: 'idle',
                    reason: `Execution mode changed to ${mode}`,
                    currentStep: this.currentStep
                }
            });
        }
    }

    /**
     * 保存单步的 prompt（私有方法）
     */
    private async saveStepPrompt(stepNumber: number, options: {
        savePromptPerStep?: boolean;
        promptSaveDir?: string;
        promptSaveFormat?: 'markdown' | 'json' | 'both';
    }): Promise<void> {
        if (!this.thinkingSystem) {
            throw new Error('Thinking system not available');
        }

        const saveDir = options.promptSaveDir || './step-prompts';
        const format = options.promptSaveFormat || 'markdown';
        
        // 确保目录存在
        const fs = await import('fs');
        const path = await import('path');
        
        if (!fs.existsSync(saveDir)) {
            fs.mkdirSync(saveDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const stepPadded = stepNumber.toString().padStart(3, '0');
        
        try {
            if (format === 'markdown' || format === 'both') {
                const markdownFile = path.join(saveDir, `step-${stepPadded}-${timestamp}.md`);
                await this.thinkingSystem.savePromptHistory(markdownFile, {
                    formatType: 'markdown',
                    includeMetadata: true,
                    stepRange: { start: stepNumber, end: stepNumber }
                });
            }

            if (format === 'json' || format === 'both') {
                const jsonFile = path.join(saveDir, `step-${stepPadded}-${timestamp}.json`);
                await this.thinkingSystem.savePromptHistory(jsonFile, {
                    formatType: 'json',
                    includeMetadata: true,
                    stepRange: { start: stepNumber, end: stepNumber }
                });
            }
        } catch (error) {
            logger.error(`Error saving step ${stepNumber} prompt:`, error);
            throw error;
        }
    }

    public async getPrompt(): Promise<string> {
        if (!this.thinkingSystem) {
            throw new Error('Thinking system is not available. Enable thinking system first.');
        }
        
        return this.thinkingSystem.getCurrentPrompt();
    }

    /**
     * 新增：启用思考系统
     */
    public enableThinkingSystem(options?: {
        maxConversationHistory?: number;
        maxExecutionHistory?: number;
    }): boolean {
        if (this.enableThinking) {
            logger.warn('Thinking system is already enabled');
            return true;
        }

        try {
            this.enableThinking = true;
            this.initializeThinkingSystem(options);
            logger.info('Thinking system enabled successfully');
            return true;
        } catch (error) {
            logger.error('Failed to enable thinking system:', error);
            this.enableThinking = false;
            return false;
        }
    }

    /**
     * 新增：禁用思考系统
     */
    public disableThinkingSystem(): void {
        this.enableThinking = false;
        this.thinkingSystem = undefined;
        logger.info('Thinking system disabled');
    }

    /**
     * 新增：检查思考系统是否启用
     */
    public isThinkingEnabled(): boolean {
        return this.enableThinking && !!this.thinkingSystem;
    }
}

