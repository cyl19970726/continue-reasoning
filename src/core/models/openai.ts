import openai, { OpenAI } from "openai";
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams } from "../interfaces";
import dotenv from "dotenv";

dotenv.config();

async function validateOpenAIKey(): Promise<boolean> {
    try {
        const openai = new OpenAI();
        // Make a simple API call to test the key
        await openai.models.list();
        return true;
    } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('api key')) {
            return false;
        }
        // For other types of errors, assume key is valid but other issues exist
        return true;
    }
}


type OpenaiFunctionTool = openai.Responses.FunctionTool;

function convertToOpenaiTool(tool: ToolCallDefinition): OpenaiFunctionTool {
    // Convert Zod schema to JSON Schema
    const jsonSchema = {
        type: "object",
        properties: Object.entries(tool.paramSchema.shape).reduce((acc, [key, schema]) => {
            if (schema instanceof z.ZodString) {
                acc[key] = { type: "string" };
            } else if (schema instanceof z.ZodNumber) {
                acc[key] = { type: "number" };
            } else if (schema instanceof z.ZodBoolean) {
                acc[key] = { type: "boolean" };
            } else if (schema instanceof z.ZodArray) {
                acc[key] = { type: "array" };
            } else if (schema instanceof z.ZodObject) {
                acc[key] = { type: "object" };
            }
            return acc;
        }, {} as Record<string, { type: string }>),
        required: Object.keys(tool.paramSchema.shape),
        additionalProperties: false
    };

    return {
        type: "function",
        name: tool.name,
        parameters: jsonSchema,
        strict: tool.strict,
        description: tool.description
    };
}

export class OpenAIWrapper implements ILLM {
    model: z.infer<typeof LLMModel>;
    streaming: boolean;
    parallelToolCall: boolean;
    temperature: number;
    maxTokens: number;

    constructor(model: z.infer<typeof LLMModel>, streaming: boolean, temperature: number, maxTokens: number) {
    
        this.model = model;
        this.streaming = streaming;
        this.parallelToolCall = false;
        this.temperature = temperature;
        this.maxTokens = maxTokens;
    }

    async call(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        console.log(process.env.OPENAI_API_KEY);
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        console.log("tools:: ", tools);
        const openaiTools = tools.map(convertToOpenaiTool);
        console.log("openaiTools:: ", openaiTools);
        const response = await openai.responses.create({
            model: "gpt-4o",
            input: messages,
            tools: openaiTools,
        }); 

        const toolCalls = response.output.filter((item) => item.type === "function_call").map((item) => ({
            type: "function" as const,
            name: item.name,
            call_id: item.call_id,
            parameters: JSON.parse(item.arguments),
        }));

        console.log("toolCalls:: ", toolCalls);

        return {
            text: response.output_text,
            toolCalls
        };
    }
    
    // async streamCall(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
    //     const openai = new OpenAI();
    //     const openaiTools = tools.map(convertToOpenaiTool);
    //     const streamCall = await openai.responses.create({
    //         model: "gpt-4o",
    //         input: messages,
    //         tools: openaiTools,
    //         stream: true,
    //         store: true,
    //     }); 

    //     let generatedText = "";
    //     const toolCalls: ToolCallParams[] = [];

    //     for await (const event of streamCall) {
    //         if (event.type === "response.output_text.delta") {
    //             generatedText += event.delta;
    //         } else if (event.type === "response.function_call_arguments.done") {
    //             const functionCall = response.output.find(item => 
    //                 item.type === "function_call" && 
    //                 item.arguments === event.arguments
    //             );
                
    //             if (functionCall) {
    //                 toolCalls.push({
    //                     type: "function" as const,
    //                     name: functionCall.name,
    //                     call_id: functionCall.call_id,
    //                     parameters: JSON.parse(event.arguments),
    //                 });
    //             }
    //         }
    //     }

    //     return {
    //         text: generatedText,
    //         toolCalls
    //     };
    // }
}



// const stream = await openai.responses.create({
//     model: "gpt-4o",
//     input: [{ role: "user", content: "What's the weather like in Paris today?" }],
//     tools,
//     stream: true,
//     store: true,
// });

// for await (const event of stream) {
//     console.log(event)
// }