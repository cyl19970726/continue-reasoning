import { AnyTool, IContextManager, IMemoryManager, IAgent, IClient, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolCallResult } from "./interfaces";
import { SystemToolNames } from "./tools/index";
import { ITaskQueue, ITask, TaskQueue } from "./taskQueue";
import { ToolCallContext, ToolCallContextId } from "./tool";
import { SystemToolContext } from "./tools/system";
import { BasicToolContext } from "./tools/basic";
import { z } from "zod";
import { cliClientId, ClientContext,cliResponseToolName } from "./client";
import { Message } from "./interfaces";
import dotenv from "dotenv";
import { time } from "console";

dotenv.config();

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

    isRunning: boolean;
    shouldStop: boolean;

    constructor(id: string, name: string, description: string, contextManager: IContextManager, memoryManager: IMemoryManager, clients: IClient<any,any>[], llm: ILLM, maxSteps: number){
        this.id = id;
        this.name = name;
        this.description = description;
        this.contextManager = contextManager;
        this.memoryManager = memoryManager;
        this.clients = clients;
        this.tool = [];
        this.llm = llm;
        this.taskQueue = new TaskQueue(3);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }


    async setup(): Promise<void>{
        this.contextManager.registerContext(ClientContext);
        this.contextManager.registerContext(ToolCallContext);
        this.contextManager.registerContext(SystemToolContext);
        // this.contextManager.registerContext(BasicToolContext);

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
        // while (this.isRunning) {
        //     await new Promise(resolve => setTimeout(resolve, 100));
        // }

        // console.log("==========Agent Stop ==========");
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
        if (!this.llm.call) {
            throw new Error("LLM call method is not implemented");
        }
        const {text,toolCalls} = await this.llm.call(prompt, toolCallsDefinition);  

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

                    // *** Check stop flag after sync execution ***
                    // if (this.shouldStop) {
                    //     console.log(`Stop signal received after executing sync tool ${tool.name}. Stopping processStep.`);
                    //     return; // Exit processStep immediately
                    // }
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
        // console.log("==========clientSendfn:: ", clientInfo, incomingMessages);
        // const contextList = this.contextManager.listContexts();
        // console.log("==========contextList:: ", contextList);
        const clientContext = this.contextManager.findContextById(clientInfo.clientId) as typeof ClientContext;
        if (!clientContext) {
            throw new Error(`Client context not found for ID: ${clientInfo.clientId}`);
        }

        clientContext.data.incomingMessages = incomingMessages;
        await this.start(10);
    }
}

