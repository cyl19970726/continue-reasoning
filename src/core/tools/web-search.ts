import { z } from "zod";
import OpenAI from "openai";
import { IAgent, IContext, ITool } from "../interfaces";
import { Tool, ToolExecutionOptions } from "ai";
import { createTool } from "../utils";

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
    id: "web-search",
    name: "Web Search",
    description: "Search the web for information",
    inputSchema: querySchema,
    async: true,
    execute: async (parameters: z.infer<typeof querySchema>, agent?: IAgent) => {
        const response = await openaiWebSearch(parameters.query);
        return response.output_text;
    }
});