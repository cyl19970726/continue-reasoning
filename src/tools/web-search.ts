import { z } from "zod";
import OpenAI from "openai";
import { SystemContext, Tool } from "../type";
import { ToolExecutionOptions } from "ai";

async function openaiWebSearch(query: string) {
  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
  const response = await client.responses.create({
        model: "gpt-4o",
        tools: [ { type: "web_search_preview" } ],
        input: query,
    });
    return response;
}

const querySchema = z.object({
    query: z.string()
});

export class WebSearchTool implements Tool<typeof querySchema,string>{
    name(): string {
        return "web-search";
    }
    
    description(): string {
        return "This tool is used to search the web for information";
    }

    parameters = querySchema;

    async execute(parameters: z.infer<typeof this.parameters>, options?: ToolExecutionOptions, systemContext?: SystemContext<any>): Promise<string>{
       const response = await openaiWebSearch(parameters.query);
       return response.output_text;
    }
}

