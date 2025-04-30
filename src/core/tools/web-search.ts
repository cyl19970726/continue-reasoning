import { z } from "zod";
import OpenAI from "openai";
import { IAgent, IContext, ITool } from "../interfaces";
import { Tool, ToolExecutionOptions } from "ai";
import { createTool, ContextHelper } from "../utils";


export const WebSearchContext = ContextHelper.createContext({
    id: "web-search",
    description: "Web Search Context",
    dataSchema: z.object({
        active_active_tools: z.array(z.string()),
    }),
    initialData: {
        active_active_tools: ["web-search"],
    },
    toolListFn: () => [WebSearchTool],
    renderPromptFn: (data) => `
    You are a helpful assistant that can search the web for information.
    You are currently using the following tools: ${data.active_active_tools.join(", ")}.
    `
});

async function openaiWebSearch(query: string) {
  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await client.responses.create({
        model: "gpt-4.1",
        tools: [ { type: "web_search_preview" } ],
        input: query,
    });
    return response;
}

const querySchema = z.object({
    query: z.string()
});

export const WebSearchTool = createTool({
    id: "web_search",
    name: "Web_Search",
    description: "Search the web for information",
    inputSchema: querySchema,
    async: true,
    execute: async (parameters: z.infer<typeof querySchema>, agent?: IAgent) => {
        const response = await openaiWebSearch(parameters.query);
        return response.output_text;
    }
});