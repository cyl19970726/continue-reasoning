import { BaseAgent } from "./agent";
import { CliClient } from "./client";
import { ContextManager } from "./context";
import { MapMemoryManager } from "./memory/baseMemory";
import { z } from "zod";
import { OpenAIWrapper } from "./models/openai";
import { LLMModel, AnyTool } from "./interfaces";


const contextManager = new ContextManager("1", "test", "test", z.object({}));
const memoryManager = new MapMemoryManager("1", "test", "test");

// Initialize LLM
const llm = new OpenAIWrapper(LLMModel.Enum.openai, true, 0.7, 1000);

// Initialize clients
const clients = [new CliClient()];

// Create agent
const agent = new BaseAgent(
    "1", 
    "test", 
    "test", 
    contextManager, 
    memoryManager, 
    clients, 
    llm, 
    10
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