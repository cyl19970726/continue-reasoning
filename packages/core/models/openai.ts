import openai, { OpenAI } from "openai";
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams } from "../interfaces";
import dotenv from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper";
import { SupportedModel } from "../models";
import { logger } from "../utils/logger";

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


// Use the correct Tool type expected by the API call
// type OpenaiFunctionTool = OpenAI.Chat.Completions.ChatCompletionTool;
type OpenaiFunctionTool = OpenAI.Responses.FunctionTool;

function convertToOpenaiTool(tool: ToolCallDefinition, strict: boolean = false): OpenaiFunctionTool {
    // Assuming tool.paramSchema is always a ZodObject for the top level
    if (!(tool.paramSchema instanceof z.ZodObject)) {
        throw new Error(`Tool ${tool.name} paramSchema must be a ZodObject.`);
    }

    // Generate the full JSON schema using the recursive function
    const parametersSchema = strict ? zodToJsonStrict(tool.paramSchema) : zodToJsonNostrict(tool.paramSchema);

    // Ensure the output conforms to OpenAI's expectations (type object, has properties)
    if (parametersSchema.type !== 'object' || !parametersSchema.properties) {
         console.error(`Schema conversion resulted in non-object type for tool ${tool.name}:`, parametersSchema);
         throw new Error(`Schema conversion failed for tool ${tool.name}: Expected object schema output.`);
    }

    // Construct the object matching ChatCompletionTool structure
    return {
        name: tool.name,
        description: tool.description || undefined,
        parameters: parametersSchema as Record<string, unknown>, // Cast as required by OpenAI type
        strict: strict,
        type: "function",
    };
}

export class OpenAIWrapper implements ILLM {
    model: SupportedModel;
    streaming: boolean;
    parallelToolCall: boolean;
    temperature: number;
    maxTokens: number;

    constructor(model: SupportedModel, streaming: boolean = false, temperature: number = 0.7, maxTokens: number = 100000, parallelToolCall: boolean = false) {
    
        this.model = model;
        this.streaming = streaming;
        this.parallelToolCall = false;
        this.temperature = temperature;
        this.maxTokens = maxTokens;
    }

    setParallelToolCall(enabled: boolean): void {
        this.parallelToolCall = enabled;
    }

    async call(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        console.log(process.env.OPENAI_API_KEY);
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        const openaiTools = tools.map(tool => convertToOpenaiTool(tool, false));

        const response = await openai.responses.create({
            model: this.model,
            input: messages,
            tools: openaiTools,
            store: true,
            parallel_tool_calls: this.parallelToolCall,
        });

        const toolCalls = response.output.filter((item) => item.type === "function_call").map((item) => ({
            type: "function" as const,
            name: item.name,
            call_id: item.call_id,
            parameters: JSON.parse(item.arguments),
        }));

        logger.debug(`[OpenAIWrapper] Extracted Tool Calls: ${toolCalls.length}`);

        return {
            text: response.output_text || "",
            toolCalls
        };
    }
    
    async streamCall(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        
        const openaiTools = tools.map(tool => convertToOpenaiTool(tool, false));
        
        try {
            console.log("Starting streaming response with OpenAI...");
            
            // Start streaming response
            const stream = await openai.responses.create({
                model: this.model,
                input: messages,
                tools: openaiTools,
                stream: true,
                store: true,
                parallel_tool_calls: this.parallelToolCall,
            });

            let generatedText = "";
            const toolCalls: ToolCallParams[] = [];
            const functionCallsInProgress: Record<string, {
                id: string;
                call_id: string;
                name: string;
                arguments: string;
                isComplete: boolean;
            }> = {};

            // Debug flag to track events
            let seenEvents = new Set<string>();
            let fullResponseItems: any[] = [];
            
            // Process streaming chunks
            for await (const chunk of stream) {
                // Track event types for debugging
                seenEvents.add(chunk.type);
                
                // Cast the chunk to any to bypass type checking
                const event = chunk as any;
                
                // For text output - delta event
                if (event.type === "response.output_text.delta") {
                    generatedText += event.delta;
                    console.log(`Received text delta: ${event.delta.length} chars`);
                }
                // For text output - added event
                else if (event.type === "response.output_text.added") {
                    generatedText += event.text || "";
                    console.log(`Received text added: ${(event.text || "").length} chars`);
                }
                // Store full response item when added
                else if (event.type === "response.output_item.added") {
                    if (event.output_item) {
                        fullResponseItems.push(event.output_item);
                        console.log(`Added response item type: ${event.output_item.type}`);
                    }
                }
                // For function call starts
                else if (event.type === "response.function_call.start") {
                    console.log(`Function call started: ${event.name}`);
                    // Initialize a new function call
                    functionCallsInProgress[event.id] = {
                        id: event.id,
                        call_id: event.call_id,
                        name: event.name,
                        arguments: "", // Will build this up from argument chunks
                        isComplete: false
                    };
                } 
                // For function call arguments (partial)
                else if (event.type === "response.function_call_arguments.delta") {
                    // Add to the arguments of an in-progress function call
                    if (event.id && functionCallsInProgress[event.id]) {
                        functionCallsInProgress[event.id].arguments += event.delta || "";
                        console.log(`Received arguments delta for ${event.id}: ${(event.delta || "").length} chars`);
                    }
                } 
                // For function call completions
                else if (event.type === "response.function_call_arguments.done") {
                    // Mark the function call as complete
                    if (event.id && functionCallsInProgress[event.id]) {
                        functionCallsInProgress[event.id].isComplete = true;
                        console.log(`Function call completed: ${event.id}`);
                        
                        // Process the complete function call
                        const call = functionCallsInProgress[event.id];
                        try {
                            toolCalls.push({
                                type: "function" as const,
                                name: call.name,
                                call_id: call.call_id,
                                parameters: JSON.parse(call.arguments),
                            });
                            console.log(`Added tool call for ${call.name}`);
                        } catch (e) {
                            console.error(`Error parsing arguments for tool call ${call.id}:`, e);
                        }
                    }
                }
            }

            logger.debug(`[OpenAIWrapper] Streaming complete. Generated text length: ${generatedText.length}`);
            logger.debug(`[OpenAIWrapper] Extracted Tool Calls: ${toolCalls.length}`);
            logger.debug(`[OpenAIWrapper] Seen event types: ${Array.from(seenEvents)}`);
            
            // Extract response text from fullResponseItems if we didn't get it from streaming
            if (generatedText.length === 0 && fullResponseItems.length > 0) {
                const textItems = fullResponseItems.filter(item => item.type === "text");
                for (const item of textItems) {
                    if (item.text) {
                        generatedText += item.text;
                    }
                }
                logger.debug("[OpenAIWrapper] Extracted text from response items:", generatedText.length);
            }
            
            // Extract function calls from fullResponseItems if we didn't get them from streaming
            if (toolCalls.length === 0 && fullResponseItems.length > 0) {
                const functionCallItems = fullResponseItems.filter(item => item.type === "function_call");
                for (const item of functionCallItems) {
                    try {
                        toolCalls.push({
                            type: "function" as const,
                            name: item.name,
                            call_id: item.call_id,
                            parameters: JSON.parse(item.arguments),
                        });
                    } catch (e) {
                        console.error("Error parsing function call arguments:", e);
                    }
                }
                logger.debug(`[OpenAIWrapper] Extracted tool calls from response items: ${toolCalls.length}`);
            }
            
            // If we didn't get any output from streaming or tool calls, 
            // fall back to non-streaming API as a backup
            if (generatedText.length === 0 && toolCalls.length === 0) {
                logger.debug("[OpenAIWrapper] No streaming output received, falling back to non-streaming API");
                return this.call(messages, tools);
            }

            return {
                text: generatedText,
                toolCalls
            };
        } catch (error) {
            logger.error("[OpenAIWrapper] Error in streamCall:", error);
            // Fall back to regular call on error
            logger.debug("[OpenAIWrapper] Falling back to non-streaming API due to error");
            return this.call(messages, tools);
        }
    }
}