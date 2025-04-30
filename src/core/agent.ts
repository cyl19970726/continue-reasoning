import { AnyTool, IContextManager, IMemoryManager, IAgent, IClient, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolCallResult } from "./interfaces";
import { SystemToolNames } from "./tools/index";
import { ITaskQueue, ITask, TaskQueue } from "./taskQueue";
import { ToolCallContext, ToolCallContextId } from "./tool";
import { SystemToolContext } from "./tools/system";
import { ExecuteToolsContext } from "./tools/execute";
import { z } from "zod";
import { cliClientId, ClientContext,cliResponseToolName } from "./client";
import { Message } from "./interfaces";
import dotenv from "dotenv";
import { time } from "console";
import { PlanContext } from "./tools/plan";
import { MCPContext } from "./tools/mcp";
import { WebSearchContext } from "./tools/web-search";
import { OpenAIWrapper } from "./models/openai";
import { AnthropicWrapper } from "./models/anthropic";
import { GeminiWrapper } from "./models/gemini";

dotenv.config();

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface AgentOptions {
    llmProvider?: LLMProvider;
    enableParallelToolCalls?: boolean;
    temperature?: number;
    maxTokens?: number;
}

export class BaseAgent implements IAgent {
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    contextManager: IContextManager;
    memoryManager: IMemoryManager;
    clients: IClient<any,any>[];
    tool: AnyTool[];
    llm: ILLM; 
    taskQueue: ITaskQueue;
    llmProvider: LLMProvider;
    enableParallelToolCalls: boolean;

    isRunning: boolean;
    shouldStop: boolean;

    constructor(
        id: string, 
        name: string, 
        description: string, 
        contextManager: IContextManager, 
        memoryManager: IMemoryManager, 
        clients: IClient<any,any>[], 
        llmOptions: AgentOptions = {}, 
        maxSteps: number
    ){
        this.id = id;
        this.name = name;
        this.description = description;
        this.contextManager = contextManager;
        this.memoryManager = memoryManager;
        this.clients = clients;
        this.tool = [];
        
        // LLM配置选项
        this.llmProvider = llmOptions.llmProvider || 'openai';
        this.enableParallelToolCalls = llmOptions.enableParallelToolCalls ?? false;
        const temperature = llmOptions.temperature || 0.7;
        const maxTokens = llmOptions.maxTokens || 2048;
        
        // 基于配置初始化正确的LLM
        if (this.llmProvider === 'openai') {
            this.llm = new OpenAIWrapper('openai', true, temperature, maxTokens);
        } else if (this.llmProvider === 'anthropic') {
            this.llm = new AnthropicWrapper('anthropic', true, temperature, maxTokens);
        } else if (this.llmProvider === 'google') {
            this.llm = new GeminiWrapper('google', true, temperature, maxTokens);
        } else {
            throw new Error(`Unsupported LLM provider: ${this.llmProvider}`);
        }
        
        // 设置LLM的parallel工具调用
        if (this.llm.setParallelToolCall) {
            this.llm.setParallelToolCall(this.enableParallelToolCalls);
        } else {
            // Directly set the property if method isn't available
            this.llm.parallelToolCall = this.enableParallelToolCalls;
        }
        
        this.taskQueue = new TaskQueue(3);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }


    async setup(): Promise<void>{
        this.contextManager.registerContext(ClientContext);
        this.contextManager.registerContext(ToolCallContext);
        this.contextManager.registerContext(SystemToolContext);
        this.contextManager.registerContext(ExecuteToolsContext);
        this.contextManager.registerContext(PlanContext);
        this.contextManager.registerContext(MCPContext);
        this.contextManager.registerContext(WebSearchContext);

        this.contextManager.contexts.forEach((context) => {
            if (context && context.toolList) {
                const toolList = context.toolList();
                if (toolList) {
                    this.tool.push(...toolList);
                }
            } else if (context) {
                console.warn(`Context ${context.id} is missing the toolList method.`);
            } else {
                console.error('Encountered an undefined context during setup.');
            }
        });

        // receive the client messages 
        for (const client of this.clients){
            client.input?.subscribe?.(this.clientSendfn.bind(this));
            const clientOutputTool = client.output?.responseTool;
            if (clientOutputTool) {
                this.tool.push(clientOutputTool);
            }
        }
        
        // 确保LLM的parallel工具调用设置正确
        if (this.llm.setParallelToolCall) {
            this.llm.setParallelToolCall(this.enableParallelToolCalls);
        } else {
            // Directly set the property if method isn't available
            this.llm.parallelToolCall = this.enableParallelToolCalls;
        }
    }

    // start
    // 1. processStep() --> stop tool calls ---> this.shouldStop = true; ---> 
    async start(maxSteps: number): Promise<void>{

        let step = 0;
        if (this.isRunning) {
            return;
        }
        this.isRunning = true;
        this.shouldStop = false;
        while (!this.shouldStop && step < maxSteps){
            console.log(`==========Agent Current Step: ${step} ==========`);
            await this.processStep();
            step++;

            if (this.shouldStop) {
               console.log("==========Agent Stop Singal ==========");
            }
        }
        this.isRunning = false;
    }

    stop(): void{
        this.shouldStop = true;
        console.log("==========Agent Stop has been called ==========");
    }

    private async processStep(): Promise<void>{
        const toolCallContext = this.contextManager.findContextById(ToolCallContextId) as typeof ToolCallContext;
        const toolCallsDefinition = this.tool.map((tool) => tool.toCallParams());
        if (!toolCallContext || !toolCallContext.setToolDefinitions || !toolCallContext.setToolCalls || !toolCallContext.setToolCallResult) {
            console.error(`ToolCallContext (${ToolCallContextId}) not found or is missing required methods.`);
            return; 
        }
        toolCallContext.setToolDefinitions(toolCallsDefinition);

        // format the prompt using the context and the memory
        const contextPrompt = this.contextManager.renderPrompt();
        const memoryPrompt = this.memoryManager.renderPrompt();

        // convert any tool to the toolcall definition
        // invoke the llm to get the response text and the toolcalls
        const prompt  = `${contextPrompt}\n${memoryPrompt}\n}`;
        
        // 根据streaming配置选择调用streaming或非streaming API
        const { text, toolCalls } = this.llm.streaming ? 
                                   await this.llm.streamCall(prompt, toolCallsDefinition) : 
                                   await this.llm.call(prompt, toolCallsDefinition);

        toolCallContext.setToolCalls(toolCalls);
        // push the toolcalls into the taskqueue 
        for (const toolCall of toolCalls){
            const tool = this.tool.find(t => t.name === toolCall.name);
            if (!tool) {
                console.error(`Tool ${toolCall.name} not found`); 
                continue; 
            }

            if (!tool.async) {
                // --- SYNC TOOL HANDLING ---
                console.log(`Executing sync tool: ${tool.name} (${toolCall.call_id})`);
                try {
                    const result = await tool.execute(toolCall.parameters, this);
                    toolCallContext.setToolCallResult(toolCall.call_id, result as ToolCallResult);

                } catch (error) {
                     console.error(`Error executing sync tool ${tool.name} (${toolCall.call_id}):`, error);
                }
            } else {
                // --- ASYNC TOOL HANDLING ---
                console.log(`Queueing async tool: ${tool.name} (${toolCall.call_id})`);
                const taskId = toolCall.call_id;
                this.taskQueue.addTask(async () => {
                    try {
                         return await tool.execute(toolCall.parameters, this);
                    } catch(err) {
                        console.error(`Error executing async tool ${tool.name} (${taskId}) in task queue:`, err);
                        // Type check for error message
                        const errorMessage = (err instanceof Error) ? err.message : String(err);
                        return { type: 'function', name: tool.name, call_id: taskId, result: { error: `Async execution failed: ${errorMessage}` } }; 
                    }
                }, 0, taskId).then((result) => {
                    toolCallContext.setToolCallResult(taskId, result as ToolCallResult);
                }).catch(error => {
                     console.error(`Error processing async tool ${tool.name} (${taskId}) completion:`, error);
                     // Type check for error message
                     const errorMessage = (error instanceof Error) ? error.message : String(error);
                     if (!errorMessage.includes('Async execution failed')) { 
                         toolCallContext.setToolCallResult(taskId, { type: 'function', name: tool.name, call_id: taskId, result: { error: `Completion processing failed: ${errorMessage}` } });
                     }
                });
            }
        }
    }

    async clientSendfn(clientInfo: {clientId: string, userId: string}, incomingMessages: Message): Promise<void> {
        const clientContext = this.contextManager.findContextById(clientInfo.clientId) as typeof ClientContext;
        if (!clientContext) {
            throw new Error(`Client context not found for ID: ${clientInfo.clientId}`);
        }

        clientContext.data.incomingMessages = incomingMessages;
        await this.start(100);
    }
}

