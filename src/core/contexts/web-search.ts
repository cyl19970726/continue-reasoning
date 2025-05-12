import { z } from "zod";
import OpenAI from "openai";
import { IAgent, IContext, ITool } from "../interfaces";
import { Tool, ToolExecutionOptions } from "ai";
import { createTool, ContextHelper } from "../utils";


export const WebSearchContext = ContextHelper.createContext({
    id: "web-search",
    description: "Enables the agent to perform web searches for up-to-date information. Provides access to web search tools and tracks which search tools are currently active for information retrieval tasks.",
    dataSchema: z.object({
        active_active_tools: z.array(z.string()),
    }),
    initialData: {
        active_active_tools: ["web-search"],
    },
    toolSetFn: () => ({
        name: "WebSearchToolSet",
        description: "This tool set contains the web search tool",
        tools: [WebSearchTool],
        active: true,
        source: "local"
    }),
    renderPromptFn: (data) => `
    --- Web Search Context ---
    Available search tools: ${data.active_active_tools.length} active (${data.active_active_tools.join(", ")})
    
    Current Capabilities:
    • Real-time web information retrieval
    • Access to current news, documentation, and public knowledge
    • Results may vary based on search quality and internet availability
    
    Usage Guidelines:
    1. Use web search for factual information, current events, or reference data
    2. Formulate specific, concise search queries for best results
    3. Web search is asynchronous - continue processing while waiting for results
    4. Always evaluate and verify search results before acting on them
    
    Note: Web search should NOT be used for sensitive information, personal data, 
    or when the required information is already available in other contexts.
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