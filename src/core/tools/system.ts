import { z } from "zod";
import { createContext, createTool } from "../utils";
import { SystemToolNames } from "./index";


export const systemToolContextId = "systemToolContext";
export const SystemToolContext = createContext({
    id: systemToolContextId,
    description: "The context for the system tool",
    dataSchema: z.object({}),
    memorySchema: z.object({}),
    initialData: {},
    renderPromptFn: () => "",
    toolListFn: () => [StopResponseTool],
});

export const StopResponseTool = createTool({
    name: SystemToolNames.stopResponse,
    description: "If you have completed the conversation with the user and believe no further reply is needed, please call this tool to stop the Agent from continuing to execute tasks, because continuing execution will repeatedly trigger response-related tools causing duplicate replies"
    + "   Warning: If a 'stop' tool call is already present in the toolCalls list or toolResults list, do not issue another 'stop' command..",
    inputSchema: z.object({}),
    outputSchema: z.object({

        result: z.string().describe("The result of the stop tool"),
    }),
    async: false,
    execute: async (_params, agent) => {
        if (!agent) {
            throw new Error("Agent is not found");
        }
        agent.stop();
        return {
            result: "stop",
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
