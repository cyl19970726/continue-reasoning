import { z } from "zod";
import { createTool,ContextHelper } from "../utils";
import { SystemToolNames } from "./index";
import { logger } from "../agent";

export const systemToolContextId = "systemToolContext";
export const SystemToolContext = ContextHelper.createContext({
    id: systemToolContextId,
    description: "Provides system-level control tools, such as stopping or aborting the agent's current response or task. Used to manage agent execution flow and ensure safe termination of ongoing processes when necessary.",
    dataSchema: z.object({}),
    initialData: {},
    renderPromptFn: () => `
    --- System Control Context ---
    
    Available System Tools:
    • stop-response: Safely terminates agent execution
    
    System Control Guidelines:
    1. Use the stop-response tool ONLY when:
       - You have responded to the user's request completely
       - No further processing or follow-up actions are needed
       - The conversation naturally concludes (e.g., after greeting or answering a final question)
       - A critical error requires immediate termination
    
    IMPORTANT RULES:
    • AFTER responding to the user, ALWAYS consider if you should call stop-response
    • Call stop-response if the user's request has been fully addressed and no more actions are needed
    • Check conversation state - if no new incoming messages and previous message was fully addressed, call stop-response
    • Do NOT call stop-response if there are pending plans or unfinished tasks
    • Do NOT call stop-response repeatedly (check if it's already in toolCalls or toolResults)
    
    EXAMPLE SCENARIOS TO STOP:
    • User says "hello" → You respond with greeting → Call stop-response
    • User asks simple question → You answer completely → Call stop-response
    • User says "thank you" or indicates conversation is complete → Call stop-response
    
    Note: System tools have the highest priority and override other context behaviors.
    `,
    toolSetFn: () => ({
        name: "SystemTools",
        description: "This tool set provides system-level control, including the StopResponseTool for aborting or terminating the current response or task. Suitable for halting ongoing processes or stopping agent execution. Source: local.",
        tools: [StopResponseTool],
        active: true,
        source: "local"
    }),
});

export const StopResponseTool = createTool({
    name: SystemToolNames.stopResponse,
    description: `Call this tool when:
    1. You have completed answering the user's request
    2. No further responses or actions are needed
    3. The conversation has naturally concluded (e.g., after greeting or answering a question)
    
    This prevents the agent from continuing execution which would cause duplicate or unnecessary responses.
    
    Important: Always check if a 'stop' tool call is already present in the toolCalls or toolResults lists before calling this again.
    Do not call this tool if there are active plans or unfinished tasks that need to be completed.`,
    inputSchema: z.object({}),
    outputSchema: z.object({
        result: z.string().describe("The result of the stop tool"),
    }),
    async: false,
    execute: async (_params, agent) => {
        if (!agent) {
            throw new Error("Agent is not found");
        }
        logger.info("StopResponseTool executed - stopping agent");
        agent.stop();
        return {
            result: "stopped",
        };
    },
});


// export const LoadMemoryTool = createTool({
//     name: SystemToolNames.loadMemory,
//     description: "Load the memory of the agent",
//     inputSchema: z.object({
//         memoryId: z.string().describe("The id of the memory to load"),
//     }),
//     outputSchema: z.object({
//         result: z.string().describe("The result of the loadMemory tool"),
//     }),
//     execute: async (params, agent) => {
//         if (!agent) {
//             throw new Error("Agent is not found");
//         }
//         const memory = agent.memoryManager.loadMemory(params.memoryId);
//         return {
//             result: memory,
//         };
//     },
// });
