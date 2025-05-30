import { AnyTool, IContextManager, IMemoryManager, IAgent, IClient, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolCallResult, IRAGEnabledContext, asRAGEnabledContext } from "./interfaces";
import { SystemToolNames, HackernewsContext, DeepWikiContext, FireCrawlContext, UserInputContext, InteractiveContext } from "./contexts/index";
import { ITaskQueue, ITask, TaskQueue } from "./taskQueue";
import { ToolCallContext, ToolCallContextId } from "./contexts/tool";
import { SystemToolContext } from "./contexts/system";
import { ExecuteToolsContext } from "./contexts/execute";
import { z } from "zod";
import { cliClientId, ClientContext,cliResponseToolName } from "./contexts/client";
import { Message,ToolSet } from "./interfaces";
import dotenv from "dotenv";
import { time } from "console";
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
import { createCodingContext } from "./contexts/coding";
import { IEventBus } from "./events/eventBus";
import { Agent } from "http";
import { ContextManager } from "./context";

dotenv.config();

const CODING_CONTEXT = createCodingContext(process.cwd());


const SYSTEM_CONTEXTS = [
    ToolCallContext,
    ClientContext,
    SystemToolContext,
    MCPContext,
    ToolSetContext,
]

const DEFAULT_CONTEXTS = [
    // System contexts (必须的系统级上下文)
    ToolCallContext,
    ClientContext,
    SystemToolContext,
    
    // User interaction contexts (用户交互相关，最优先)
    UserInputContext,
    
    // Planning context (计划和组织)
    PlanContext,
    
    // Coding context (具体实现)
    CODING_CONTEXT,
    
    // Execution and utility contexts (执行和工具)
    ExecuteToolsContext,
    WebSearchContext,
    MCPContext,
    ToolSetContext,
    HackernewsContext,
    DeepWikiContext,
    FireCrawlContext,
    
    // Interactive context (UI/交互支持，最后)
    InteractiveContext,
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
}

export interface AgentOptions {
    model?: SupportedModel; // 指定具体模型，默认使用 GPT-4o
    enableParallelToolCalls?: boolean;
    temperature?: number;
    taskConcurency?: number;
    mcpConfigPath?: string; // Path to MCP config file
    executionMode?: 'auto' | 'manual'; // Agent执行模式：auto(无approval) | manual(有approval)
    promptOptimization?: {
        mode: 'minimal' | 'standard' | 'detailed' | 'custom';
        customSystemPrompt?: string;
        maxTokens?: number;
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
    clients: IClient<any,any>[];
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

    constructor(
        id: string, 
        name: string, 
        description: string, 
        clients: IClient<any,any>[], 
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
        this.clients = clients;
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
        
        // Set MCP config path
        this.mcpConfigPath = agentOptions?.mcpConfigPath || path.join(process.cwd(), 'config', 'mcp.json');
        logger.info(`MCP config path: ${this.mcpConfigPath}`);

        
        let taskConcurency = agentOptions?.taskConcurency ? agentOptions?.taskConcurency : 5;
        this.taskQueue = new TaskQueue(taskConcurency);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
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

        // create the toolset for client output
        const clientOutputToolSet: ToolSet = {
            name: "ClientOutputTools",
            description: "This tool set must be active, it is used to handle the client output",
            tools: [],
            active: true,
            source: "local"
        }
        // receive the client messages 
        for (const client of this.clients){
            client.input?.subscribe?.(this.clientSendfn.bind(this));
            const clientOutputTool = client.output?.responseTool;
            if (clientOutputTool) {
                clientOutputToolSet.tools.push(clientOutputTool);
            }
        }
        this.toolSets.push(clientOutputToolSet);

        // 订阅ExecutionModeChangeEvent
        if (this.eventBus) {
            this.subscribeToExecutionModeChanges();
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

    // 新的异步start方法
    async start(maxSteps: number): Promise<void> {
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

            // 将主要的执行逻辑放入taskQueue
            await this.taskQueue.addProcessStepTask(async () => {
                return await this.executeStepsLoop(maxSteps);
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
    private async executeStepsLoop(maxSteps: number): Promise<void> {
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
                    return await this.processStep();
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
                logger.info("==========Agent Stop Signal ==========");
                break;
            }
        }
    }

    stop(): void {
        this.shouldStop = true;
        logger.info("==========Agent Stop has been called ==========");
        
        // 异步更新状态
        this.changeState('stopping', 'User requested stop').catch(error => {
            logger.error('Error updating state to stopping:', error);
        });
    }

    private async processStep(): Promise<void>{
        const toolCallContext = asRAGEnabledContext(this.contextManager.findContextById(ToolCallContextId));
        let allTools = this.getActiveTools();
        const toolCallsDefinition = allTools.map((tool) => tool.toCallParams());
        if (!toolCallContext || !toolCallContext.setData) {
            logger.error(`ToolCallContext (${ToolCallContextId}) not found or is missing setData method.`);
            return; 
        }
        
        // Check if the context has the required methods
        const typedToolCallContext = toolCallContext as any;
        
        if (!typedToolCallContext.setToolCalls || 
            !typedToolCallContext.setToolCallResult) {
            logger.error(`ToolCallContext (${ToolCallContextId}) is missing required methods.`);
            return;
        }
        
        // 不再需要设置 tool definitions，因为工具定义已经通过 llm.call 传递

        // format the prompt using the context and the memory
        const prompt = await this.contextManager.renderPrompt();

        logger.debug(`
            ============Prompt: ============ 
            ${prompt}
            ==============================
            `);
        
        // Choose streaming or non-streaming API based on configuration
        const { text, toolCalls } = this.llm.streaming ? 
                                   await this.llm.streamCall(prompt, toolCallsDefinition) : 
                                   await this.llm.call(prompt, toolCallsDefinition);

        typedToolCallContext.setToolCalls(toolCalls);
        
        // push the toolcalls into the taskqueue 
        for (const toolCall of toolCalls){
            const tool = allTools.find(t => t.name === toolCall.name);
            if (!tool) {
                logger.error(`Tool ${toolCall.name} not found`); 
                continue; 
            }
            
            // 更新工具调用的 async 标志
            if (typedToolCallContext.updateToolCallAsync) {
                typedToolCallContext.updateToolCallAsync(toolCall.call_id, tool.async);
            }

            if (!tool.async) {
                // --- SYNC TOOL HANDLING ---
                logger.info(`Executing sync tool: ${tool.name} (${toolCall.call_id})`);
                try {
                    const result = await tool.execute(toolCall.parameters, this);
                    typedToolCallContext.setToolCallResult(toolCall.call_id, result as ToolCallResult);
                    
                    // Call processToolCallResult for sync tool results
                    this.processToolCallResult(result as ToolCallResult);

                } catch (error) {
                     logger.error(`Error executing sync tool ${tool.name} (${toolCall.call_id}):`, error);
                }
            } else {
                // --- ASYNC TOOL HANDLING ---
                logger.info(`Queueing async tool: ${tool.name} (${toolCall.call_id})`);
                const taskId = toolCall.call_id;
                this.taskQueue.addTask(async () => {
                    try {
                         return await tool.execute(toolCall.parameters, this);
                    } catch(err) {
                        logger.error(`Error executing async tool ${tool.name} (${taskId}) in task queue:`, err);
                        // Type check for error message
                        const errorMessage = (err instanceof Error) ? err.message : String(err);
                        return { type: "function", name: tool.name, call_id: taskId, result: { error: `Async execution failed: ${errorMessage}` } }; 
                    }
                }, 0, 'toolCall', taskId).then((result) => {
                    typedToolCallContext.setToolCallResult(taskId, result as ToolCallResult);
                    
                    // Call processToolCallResult for async tool results
                    this.processToolCallResult(result as ToolCallResult);
                    
                }).catch(error => {
                     logger.error(`Error processing async tool ${tool.name} (${taskId}) completion:`, error);
                     // Type check for error message
                     const errorMessage = (error instanceof Error) ? error.message : String(error);
                     if (!errorMessage.includes('Async execution failed')) { 
                         typedToolCallContext.setToolCallResult(taskId, { type: "function", name: tool.name, call_id: taskId, result: { error: `Completion processing failed: ${errorMessage}` } });
                     }
                });
            }
        }
    }

    async clientSendfn(clientInfo: {clientId: string, userId: string}, incomingMessages: Message): Promise<void> {
        const clientContext = asRAGEnabledContext(this.contextManager.findContextById(clientInfo.clientId));
        if (!clientContext) {
            throw new Error(`Client context not found for ID: ${clientInfo.clientId}`);
        }

        clientContext.setData({ incomingMessages });
        await this.start(100);
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
     * 订阅ExecutionModeChangeRequestEvent事件
     */
    private subscribeToExecutionModeChanges(): void {
        if (!this.eventBus) return;

        this.eventBus.subscribe('execution_mode_change_request', async (event: any) => {
            const { toMode, fromMode, reason, requestId } = event.payload;
            
            logger.info(`Agent received execution mode change request: ${fromMode} -> ${toMode} (${reason || 'No reason provided'})`);
            
            try {
                // 更新Agent的执行模式
                this.executionMode = toMode;
                
                logger.info(`Agent execution mode updated to: ${this.executionMode}`);
                
                // 发送响应事件
                if (this.eventBus && requestId) {
                    await this.eventBus.publish({
                        type: 'execution_mode_change_response',
                        source: 'agent',
                        sessionId: event.sessionId,
                        payload: {
                            requestId,
                            mode: toMode,
                            timestamp: Date.now(),
                            success: true
                        }
                    });
                }
            } catch (error) {
                logger.error(`Failed to change execution mode: ${error}`);
                
                // 发送失败响应
                if (this.eventBus && requestId) {
                    await this.eventBus.publish({
                        type: 'execution_mode_change_response',
                        source: 'agent',
                        sessionId: event.sessionId,
                        payload: {
                            requestId,
                            mode: fromMode, // 保持原模式
                            timestamp: Date.now(),
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        }
                    });
                }
            }
        });
    }

    /**
     * 获取当前执行模式
     */
    public getExecutionMode(): 'auto' | 'manual' | 'supervised' {
        return this.executionMode;
    }

    /**
     * 设置执行模式（支持异步）
     */
    public async setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void> {
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
     * 处理用户输入（通过事件系统）
     * 这个方法现在主要用于直接调用，事件处理通过 setupEventHandlers 进行
     */
    public async processUserInput(input: string, sessionId: string): Promise<void> {
        logger.info(`Agent processing user input directly: "${input}" in session ${sessionId}`);
        
        // 直接更新 UserInputContext
        const userInputContext = this.contextManager.findContextById('user-input-context');
        if (userInputContext && 'processUserInput' in userInputContext) {
            (userInputContext as any).processUserInput(input, sessionId);
        }
        
        // 启动Agent处理
        await this.start(10); // 处理用户输入时限制步数
    }

    /**
     * 设置事件处理器（在 Agent 启动时调用）
     */
    private setupEventHandlers(): void {
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
    private async handleUserMessage(event: any): Promise<void> {
        const { content, messageType, context } = event.payload;
        logger.info(`Agent handling user message: "${content}" (type: ${messageType})`);
        
        // 更新 UserInputContext
        const userInputContext = this.contextManager.findContextById('user-input-context');
        if (userInputContext && 'handleUserMessage' in userInputContext) {
            await (userInputContext as any).handleUserMessage(event);
        }
        
        // 启动Agent处理
        await this.start(this.maxSteps);
    }

    /**
     * 处理输入响应事件
     */
    private async handleInputResponse(event: any): Promise<void> {
        const { requestId, value } = event.payload;
        logger.info(`Agent handling input response for request ${requestId}: ${value}`);
        
        // 更新 UserInputContext
        const userInputContext = this.contextManager.findContextById('user-input-context');
        if (userInputContext && 'handleInputResponse' in userInputContext) {
            await (userInputContext as any).handleInputResponse(event);
        }
        
        // 启动Agent处理（如果需要）
        await this.start(this.maxSteps);
    }

    /**
     * 请求用户批准
     */
    public async requestApproval(request: any): Promise<any> {
        if (!this.eventBus) {
            throw new Error('EventBus is required for approval requests');
        }
        
        const requestId = `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.eventBus.publish({
            type: 'approval_request',
            source: 'agent',
            sessionId: this.eventBus.getActiveSessions()[0] || 'default',
            payload: {
                requestId,
                ...request
            }
        });
        
        // 等待响应（这里简化处理，实际应该有超时机制）
        return new Promise((resolve) => {
            const subscriptionId = this.eventBus!.subscribe('approval_response', async (event: any) => {
                if (event.payload.requestId === requestId) {
                    this.eventBus!.unsubscribe(subscriptionId);
                    resolve(event.payload);
                }
            });
        });
    }

    /**
     * 请求用户输入（已废弃，建议使用UserInputContext中的request_user_input工具）
     * @deprecated Use request_user_input tool from UserInputContext instead
     */
    public async requestUserInput(request: any): Promise<any> {
        logger.warn('requestUserInput method is deprecated. Use request_user_input tool from UserInputContext instead.');
        
        if (!this.eventBus) {
            throw new Error('EventBus is required for input requests');
        }
        
        const requestId = `input_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        await this.eventBus.publish({
            type: 'input_request',
            source: 'agent',
            sessionId: this.eventBus.getActiveSessions()[0] || 'default',
            payload: {
                requestId,
                ...request
            }
        });
        
        // 等待响应
        return new Promise((resolve) => {
            const subscriptionId = this.eventBus!.subscribe('input_response', async (event: any) => {
                if (event.payload.requestId === requestId) {
                    this.eventBus!.unsubscribe(subscriptionId);
                    resolve(event.payload);
                }
            });
        });
    }
}

