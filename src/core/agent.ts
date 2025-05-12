import { AnyTool, IContextManager, IMemoryManager, IAgent, IClient, ILLM, IContext, ToolCallDefinition, ToolCallParams, ToolCallResult, IRAGEnabledContext, asRAGEnabledContext } from "./interfaces";
import { SystemToolNames } from "./contexts/index";
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
import path from "path";
import fs from "fs";
import { ProblemContext } from "./contexts/problem";
import { getLogger, LogLevel, Logger } from "./utils/logger";
import { ToolSetContext } from "./contexts/toolset";

// Get singleton logger instance
export const logger = getLogger({
    minLevel: LogLevel.INFO,
    console: true,
    file: true,
    logDir: './logs',
    timestamp: true
});

dotenv.config();

const DEFAULT_CONTEXTS = [
    ToolCallContext,
    ClientContext,
    SystemToolContext,
    PlanContext,
    ProblemContext,
    ExecuteToolsContext,
    WebSearchContext,
    MCPContext,
    ToolSetContext,
]

const DEFAULT_AGENT_OPTIONS: AgentOptions = {
    llmProvider: 'openai',
    enableParallelToolCalls: false,
    temperature: 0.7,
    maxTokens: 100000,
    taskConcurency: 5,
}

export type LLMProvider = 'openai' | 'anthropic' | 'google';

export interface AgentOptions {
    llmProvider?: LLMProvider;
    enableParallelToolCalls?: boolean;
    temperature?: number;
    maxTokens?: number;
    taskConcurency?: number;
    mcpConfigPath?: string; // Path to MCP config file
}

export class BaseAgent implements IAgent {
    id: string;
    name: string;
    description: string;
    maxSteps: number;
    contextManager: IContextManager;
    memoryManager: IMemoryManager;
    clients: IClient<any,any>[];
    llm: ILLM; 
    taskQueue: ITaskQueue;
    llmProvider: LLMProvider;
    enableParallelToolCalls: boolean;
    toolSets: ToolSet[] = [];
    mcpConfigPath: string;

    isRunning: boolean;
    shouldStop: boolean;

    contexts: IContext<any>[] = [];

    constructor(
        id: string, 
        name: string, 
        description: string, 
        contextManager: IContextManager, 
        memoryManager: IMemoryManager, 
        clients: IClient<any,any>[], 
        maxSteps: number,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions, 
        contexts?: IContext<any>[]
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
        this.contextManager = contextManager;
        this.memoryManager = memoryManager;
        this.clients = clients;
        this.toolSets = [];


        // LLM configuration options
        this.llmProvider = agentOptions.llmProvider || 'openai';
        this.enableParallelToolCalls = agentOptions.enableParallelToolCalls ?? false;
        const temperature = agentOptions.temperature || 0.7;
        const maxTokens = agentOptions.maxTokens || 2048;
        
        // Initialize correct LLM based on configuration
        if (this.llmProvider === 'openai') {
            this.llm = new OpenAIWrapper('openai', false, temperature, maxTokens);
            logger.info(`Using OpenAI model: ${this.llm.model}`);
        } else if (this.llmProvider === 'anthropic') {
            this.llm = new AnthropicWrapper('anthropic', false, temperature, maxTokens);
            logger.info(`Using Anthropic model: ${this.llm.model}`);
        } else if (this.llmProvider === 'google') {
            this.llm = new GeminiWrapper('google', false, temperature, maxTokens);
            logger.info(`Using Gemini model: ${this.llm.model}`);
        } else {
            throw new Error(`Unsupported LLM provider: ${this.llmProvider}`);
        }
        
        // Set LLM parallel tool calling
        if (this.llm.setParallelToolCall) {
            this.llm.setParallelToolCall(this.enableParallelToolCalls);
        } else {
            // Directly set the property if method isn't available
            this.llm.parallelToolCall = this.enableParallelToolCalls;
        }
        
        // Set MCP config path
        this.mcpConfigPath = agentOptions.mcpConfigPath || path.join(process.cwd(), 'config', 'mcp.json');
        logger.info(`MCP config path: ${this.mcpConfigPath}`);
        
        let taskConcurency = agentOptions.taskConcurency ? agentOptions.taskConcurency : 5;
        this.taskQueue = new TaskQueue(taskConcurency);
        this.maxSteps = maxSteps;
        this.isRunning = false;
        this.shouldStop = false;
    }


    async setup(): Promise<void>{
        this.contexts.forEach((context) => {
            this.contextManager.registerContext(asRAGEnabledContext(context));
        });
        this.contextManager.contexts.forEach((context) => {
            if (context && context.toolSet) {
                const toolSet = context.toolSet();
                if (toolSet) {
                    this.toolSets.push(toolSet);
                }
            } else if (context) {
                logger.warn(`Context ${context.id} is missing the toolList method.`);
            } else {
                logger.error('Encountered an undefined context during setup.');
            }
        });


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

        if (this.llm.setParallelToolCall) {
            this.llm.setParallelToolCall(this.enableParallelToolCalls);
        } else {
            this.llm.parallelToolCall = this.enableParallelToolCalls;
        }

        // Load and connect MCP servers from config
        await this.setupMcpServersFromConfig();
    }

    /**
     * Load MCP server configurations from the config file and connect to them
     */
    private async setupMcpServersFromConfig(): Promise<void> {
        try {
            // Check if config file exists
            if (!fs.existsSync(this.mcpConfigPath)) {
                logger.info(`MCP config file not found at ${this.mcpConfigPath}. Skipping MCP server setup.`);
                return;
            }

            // Read and parse config file
            const configData = fs.readFileSync(this.mcpConfigPath, 'utf8');
            const config = JSON.parse(configData);
            
            if (!config.mcpServers || typeof config.mcpServers !== 'object') {
                logger.info('No MCP servers defined in config file. Skipping MCP server setup.');
                return;
            }

            // Get server entries from object format
            const serverEntries = Object.entries(config.mcpServers);
            logger.info(`Found ${serverEntries.length} MCP servers in config.`);
            
            // Get the MCP context
            const mcpContext = this.contextManager.findContextById(MCPContextId);
            if (!mcpContext) {
                logger.error('MCP context not found. Cannot connect to MCP servers.');
                return;
            }

            // Connect to each server
            for (const [serverName, serverConfig] of serverEntries) {
                try {
                    let result;
                    const typedConfig = serverConfig as any;
                    
                    // 处理${workspaceRoot}变量
                    if (typedConfig.cwd && typeof typedConfig.cwd === 'string') {
                        if (typedConfig.cwd.includes('${workspaceRoot}')) {
                            typedConfig.cwd = typedConfig.cwd.replace('${workspaceRoot}', process.cwd());
                            logger.info(`Resolved cwd for ${serverName}: ${typedConfig.cwd}`);
                        }
                    }
                    
                    // Determine server type based on config properties
                    let serverType = typedConfig.type;
                    // If type not explicitly specified, infer from properties
                    if (!serverType) {
                        if (typedConfig.url) {
                            serverType = 'sse'; // or streamableHttp
                        } else if (typedConfig.command) {
                            serverType = 'stdio';
                        } else {
                            logger.warn(`Unknown MCP server type for ${serverName}. Skipping.`);
                            continue;
                        }
                    }
                    
                    logger.info(`Connecting to MCP server: ${serverName} (${serverType})`);
                    
                    // Connect based on server type
                    if (serverType === 'stdio') {
                        result = await AddStdioMcpServer.execute({
                            command: typedConfig.command,
                            args: typedConfig.args || [],
                            cwd: typedConfig.cwd || process.cwd(),
                            env: typedConfig.env || {}
                        }, this);
                    } 
                    else if (serverType === 'sse' || serverType === 'streamableHttp') {
                        result = await AddSseOrHttpMcpServer.execute({
                            type: serverType,
                            url: typedConfig.url
                        }, this);
                    }
                    else {
                        logger.warn(`Unknown MCP server type: ${serverType}. Skipping.`);
                        continue;
                    }

                    if (result && result.success) {
                        logger.info(`Successfully connected to MCP server: ${serverName}`);
                        logger.info(`Added ${result.toolCount} tools from server in ${result.categories?.length || 0} categories`);
                        
                        // Set auto-activation based on config (default to true if not specified)
                        if (typedConfig.autoActivate === false) {
                            // Find the tool set name for this server
                            const toolSetName = `MCPServer_${result.serverId}`;
                            this.deactivateToolSets([toolSetName]);
                            logger.info(`Deactivated tool set ${toolSetName} as per configuration`);
                        }
                    } else {
                        logger.error(`Failed to connect to MCP server: ${serverName}`, result?.error || 'Unknown error');
                    }
                } 
                catch (error) {
                    logger.error(`Error connecting to MCP server ${serverName}:`, error);
                }
            }
        } 
        catch (error) {
            logger.error('Error setting up MCP servers from config:', error);
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
            logger.info(`==========Agent Current Step: ${step} ==========`);
            await this.processStep();
            step++;

            if (this.shouldStop) {
               logger.info("==========Agent Stop Signal ==========");
            }
        }
        this.isRunning = false;
    }

    stop(): void{
        this.shouldStop = true;
        logger.info("==========Agent Stop has been called ==========");
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
        
        if (!typedToolCallContext.setToolDefinitions || 
            !typedToolCallContext.setToolCalls || 
            !typedToolCallContext.setToolCallResult) {
            logger.error(`ToolCallContext (${ToolCallContextId}) is missing required methods.`);
            return;
        }
        
        // Set the tool definitions
        typedToolCallContext.setToolDefinitions(toolCallsDefinition);

        // format the prompt using the context and the memory
        const contextPrompt = await this.contextManager.renderPrompt();
        // const memoryPrompt = this.memoryManager.renderPrompt();
        const memoryPrompt = "";

        // convert any tool to the toolcall definition
        // invoke the llm to get the response text and the toolcalls
        const prompt  = `${contextPrompt}\n${memoryPrompt}\n}`;

        logger.debug(`============Prompt: ============ 
            ${prompt}
            ==============================`);
        
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

            if (!tool.async) {
                // --- SYNC TOOL HANDLING ---
                logger.info(`Executing sync tool: ${tool.name} (${toolCall.call_id})`);
                try {
                    const result = await tool.execute(toolCall.parameters, this);
                    typedToolCallContext.setToolCallResult(toolCall.call_id, result as ToolCallResult);

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
                }, 0, taskId).then((result) => {
                    typedToolCallContext.setToolCallResult(taskId, result as ToolCallResult);
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

    // New: Get all tools from active tool sets
    getActiveTools(): AnyTool[] {
        return this.toolSets.filter(ts => ts.active).flatMap(ts => ts.tools);
    }
}

