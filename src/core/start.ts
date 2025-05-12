import { AgentOptions, BaseAgent } from "./agent";
import { CliClient } from "./contexts/client";
import { ContextManager } from "./context";
import { MapMemoryManager } from "./memory/baseMemory";
import { z } from "zod";
import { LLMModel } from "./interfaces";
import { LogLevel } from "./utils/logger";
import path from "path";

// 解析命令行参数
const args = process.argv.slice(2);
let logLevelArg = LogLevel.INFO;

// 检查是否提供了 --log-level 参数
const logLevelIndex = args.indexOf('--log-level');
if (logLevelIndex !== -1 && logLevelIndex < args.length - 1) {
    const logLevelName = args[logLevelIndex + 1].toUpperCase();
    if (logLevelName in LogLevel) {
        logLevelArg = LogLevel[logLevelName as keyof typeof LogLevel];
        console.log(`Setting log level to: ${LogLevel[logLevelArg]}`);
    } else {
        console.warn(`Unknown log level: ${logLevelName}. Using default: INFO`);
    }
}

const contextManager = new ContextManager("1", "test", "test", z.object({}));
const memoryManager = new MapMemoryManager("1", "test", "test");

// Initialize LLM
// const llm = new GeminiWrapper(LLMModel.Enum.google, true, 0.7, 1000);
// const llm = new OpenAIWrapper(LLMModel.Enum.openai, true, 0.7, 1000);

// 配置选项
let agentOptions: AgentOptions = {
    llmProvider: 'openai',
    enableParallelToolCalls: false,
    temperature: 0.7,
    maxTokens: 100000,
    taskConcurency: 5,
    mcpConfigPath: path.join(process.cwd(), 'config', 'mcp.json')
}

// Initialize clients
const clients = [new CliClient()];

// Create agent with explicit log level
const agent = new BaseAgent(
    "1", 
    "test", 
    "test", 
    contextManager, 
    memoryManager, 
    clients, 
    100,
    logLevelArg,
    agentOptions
);

export async function start() {
    try {
        // Setup the agent
        await agent.setup();
        
        console.log("Agent started successfully");
    } catch (error) {
        console.error("Failed to start agent:", error);
        throw error;
    }
}

// Start the agent if this file is run directly
if (require.main === module) {
    start().catch(console.error);
}