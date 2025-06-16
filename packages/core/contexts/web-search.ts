import { z } from "zod";
import OpenAI from "openai";
import { IAgent, IContext, ITool } from "../interfaces";
import { Tool, ToolExecutionOptions } from "ai";
import { createTool, ContextHelper } from "../utils";

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
        return {
            success: true,
            result: response.output_text
        };
    }
});

// 导出 WebSearchContext
export const WebSearchContextId = "web-search";

// 定义数据 schema
const WebSearchDataSchema = z.object({
    searchHistory: z.array(z.object({
        query: z.string(),
        timestamp: z.number(),
        results: z.any().optional()
    })).default([])
});

export const WebSearchContext: IContext<typeof WebSearchDataSchema> = {
    id: WebSearchContextId,
    description: "Provides web search capabilities using OpenAI's web search preview. Used to search for current information, news, and web content when the agent needs up-to-date information beyond its training data.",
    dataSchema: WebSearchDataSchema,
    data: { searchHistory: [] },
    
    setData: function(data: Partial<z.infer<typeof WebSearchDataSchema>>) {
        this.data = { ...this.data, ...data };
    },
    
    getData: function() {
        return this.data;
    },
    
    toolSet: () => ({
        name: "Web Search Tools",
        description: "Tools for searching the web",
        tools: [WebSearchTool],
        active: true,
        source: WebSearchContextId
    }),
    
    renderPrompt: () => {
        return `Web Search Context: Provides access to current web information through search capabilities. Use the web_search tool when you need to find current information, news, or data that may not be in your training data.`;
    }
};