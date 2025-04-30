import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams } from "../interfaces";
import dotenv from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper";

dotenv.config();

// Default model to use for Claude
const DEFAULT_CLAUDE_MODEL = "claude-3-7-sonnet-20240229";

// Define the Tool type explicitly to avoid importing from beta paths
interface AnthropicTool {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}

async function validateAnthropicKey(): Promise<boolean> {
    try {
        const anthropic = new Anthropic();
        // Make a simple API call to test the key
        await anthropic.models.list();
        return true;
    } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('api key')) {
            return false;
        }
        // For other types of errors, assume key is valid but other issues exist
        return true;
    }
}

function convertToAnthropicTool(tool: ToolCallDefinition, strict: boolean = false): AnthropicTool {
    // Assuming tool.paramSchema is always a ZodObject for the top level
    if (!(tool.paramSchema instanceof z.ZodObject)) {
        throw new Error(`Tool ${tool.name} paramSchema must be a ZodObject.`);
    }

    // Generate the JSON schema using the appropriate conversion function
    const inputSchema = strict ? zodToJsonStrict(tool.paramSchema) : zodToJsonNostrict(tool.paramSchema);

    // Ensure the output conforms to Anthropic's expectations (type object, has properties)
    if (inputSchema.type !== 'object' || !inputSchema.properties) {
        console.error(`Schema conversion resulted in non-object type for tool ${tool.name}:`, inputSchema);
        throw new Error(`Schema conversion failed for tool ${tool.name}: Expected object schema output.`);
    }

    // Construct the object matching Anthropic's Tool structure
    // Note: Anthropic doesn't use additionalProperties in their schema
    return {
        name: tool.name,
        description: tool.description || "",
        input_schema: inputSchema,
    };
}

export class AnthropicWrapper implements ILLM {
    model: z.infer<typeof LLMModel>;
    streaming: boolean;
    parallelToolCall: boolean;
    temperature: number;
    maxTokens: number;
    modelName: string;

    constructor(model: z.infer<typeof LLMModel>, streaming: boolean, temperature: number, maxTokens: number) {
        this.model = model;
        this.streaming = streaming;
        this.parallelToolCall = false;
        this.temperature = temperature;
        this.maxTokens = maxTokens;
        this.modelName = DEFAULT_CLAUDE_MODEL;
    }

    setParallelToolCall(enabled: boolean): void {
        this.parallelToolCall = enabled;
        console.log(`Parallel tool calls ${enabled ? 'enabled' : 'disabled'} for Anthropic model`);
    }

    async call(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        try {
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            const anthropicTools = tools.map(tool => convertToAnthropicTool(tool, false));
            
            console.log(`Calling Anthropic API with ${tools.length} tools, model=${this.modelName}, parallel_tool_use=${this.parallelToolCall}`);

            // TypeScript cast to allow using beta features
            const response = await anthropic.messages.create({
                model: this.modelName, // Use the class property
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                system: "You are a helpful assistant that provides accurate and useful responses.",
                messages: [{ role: "user", content: messages }],
                tools: anthropicTools as any, // cast to any to bypass type checking
                parallel_tool_use: this.parallelToolCall // Enable parallel tool use based on config
            } as any); // cast the entire config to any to allow beta features

            const toolCalls: ToolCallParams[] = [];
            
            // Extract tool calls from the response
            if (response.content) {
                for (const content of response.content) {
                    // Use type guard for safety
                    if (content.type === 'tool_use') {
                        try {
                            toolCalls.push({
                                type: "function" as const,
                                name: content.name,
                                call_id: content.id,
                                parameters: content.input,
                            });
                        } catch (e) {
                            console.error(`Error processing tool call:`, e);
                        }
                    }
                }
            }

            // Extract text content
            const textContent = response.content
                .filter(item => item.type === 'text')
                .map(item => (item as any).text)
                .join('\n');

            return {
                text: textContent,
                toolCalls
            };
        } catch (error) {
            console.error("Error in Anthropic call method:", error);
            // Return an empty response with error message
            return {
                text: `Error calling Anthropic API: ${error instanceof Error ? error.message : String(error)}`,
                toolCalls: []
            };
        }
    }

    async streamCall(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        try {
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            const anthropicTools = tools.map(tool => convertToAnthropicTool(tool, false));
            
            console.log(`Streaming Anthropic API with ${tools.length} tools, model=${this.modelName}, parallel_tool_use=${this.parallelToolCall}`);

            // TypeScript cast to allow using beta features and streaming
            const streamResponse = await anthropic.messages.create({
                model: this.modelName, // Use the class property
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                system: "You are a helpful assistant that provides accurate and useful responses.",
                messages: [{ role: "user", content: messages }],
                tools: anthropicTools as any,
                parallel_tool_use: this.parallelToolCall, // Enable parallel tool use based on config
                stream: true
            } as any); // cast to any to allow beta features

            let generatedText = "";
            const toolCalls: ToolCallParams[] = [];
            const toolUsesInProgress: Record<string, any> = {};
            
            // Track content block indexes for easier debugging
            const seenContentBlocks = new Set<number>();

            // Make sure streamResponse is treated as an AsyncIterable
            const streamIterator = streamResponse as unknown as AsyncIterable<any>;
            
            for await (const chunk of streamIterator) {
                if (chunk.type === 'content_block_delta') {
                    const delta = chunk.delta as any; // Cast delta to any for flexibility
                    
                    // Track content block indexes for debugging
                    if (!seenContentBlocks.has(chunk.index)) {
                        seenContentBlocks.add(chunk.index);
                        console.log(`New content block at index ${chunk.index}, type: ${delta.type}`);
                    }
                    
                    if (delta.type === 'text_delta') {
                        generatedText += delta.text;
                    } else if (delta.type === 'tool_use_delta' || delta.type === 'function_use_delta') {
                        // Use a compound key that includes both index and id if available
                        const toolKey = chunk.index.toString();
                        
                        // Initialize tool use tracking if needed
                        if (!toolUsesInProgress[toolKey]) {
                            toolUsesInProgress[toolKey] = {
                                id: delta.id || '',
                                name: delta.name || '',
                                input: delta.input || {}
                            };
                            
                            if (delta.id || delta.name) {
                                console.log(`Started tracking tool use at index ${chunk.index}: ${delta.name || 'unknown'}`);
                            }
                        }
                        
                        // Update the tracked tool use with new data from the chunk
                        const toolUse = toolUsesInProgress[toolKey];
                        
                        if (delta.id && !toolUse.id) {
                            toolUse.id = delta.id;
                            console.log(`Added ID to tool at index ${chunk.index}: ${delta.id}`);
                        }
                        
                        if (delta.name && !toolUse.name) {
                            toolUse.name = delta.name;
                            console.log(`Added name to tool at index ${chunk.index}: ${delta.name}`);
                        }
                        
                        if (delta.input) {
                            // Merge the input data
                            toolUse.input = { ...toolUse.input, ...delta.input };
                            console.log(`Updated input for tool at index ${chunk.index}`);
                        }
                    }
                } else if (chunk.type === 'message_stop') {
                    console.log(`Message stopped, processing ${Object.keys(toolUsesInProgress).length} tool uses`);
                    
                    // Once the message is complete, add all collected tool uses to toolCalls
                    Object.entries(toolUsesInProgress).forEach(([key, toolUse]) => {
                        if (toolUse.id && toolUse.name) {
                            toolCalls.push({
                                type: "function" as const,
                                name: toolUse.name,
                                call_id: toolUse.id,
                                parameters: toolUse.input,
                            });
                            console.log(`Added complete tool call: ${toolUse.name} (${toolUse.id})`);
                        } else {
                            console.warn(`Incomplete tool use found at key ${key}, missing id or name`);
                        }
                    });
                } else if (chunk.type === 'content_block_start' || chunk.type === 'content_block_stop') {
                    // Log content block boundaries
                    console.log(`${chunk.type} at index ${chunk.index}, type: ${chunk.content_block?.type || 'unknown'}`);
                    
                    // If this is a tool_use block that's stopping, make sure we've captured it
                    if (chunk.type === 'content_block_stop' && 
                        chunk.content_block?.type === 'tool_use') {
                        const toolData = chunk.content_block;
                        const toolKey = chunk.index.toString();
                        
                        if (toolData.id && toolData.name) {
                            // If we haven't tracked this tool yet or it's incomplete, add it now
                            if (!toolUsesInProgress[toolKey] || 
                                !toolUsesInProgress[toolKey].id ||
                                !toolUsesInProgress[toolKey].name) {
                                
                                toolUsesInProgress[toolKey] = {
                                    id: toolData.id,
                                    name: toolData.name,
                                    input: toolData.input || {}
                                };
                                
                                console.log(`Added missing tool use at index ${chunk.index} from content_block_stop`);
                            }
                        }
                    }
                }
            }
            
            console.log(`Stream complete. Generated ${generatedText.length} chars of text and ${toolCalls.length} tool calls`);

            return {
                text: generatedText,
                toolCalls
            };
        } catch (error) {
            console.error("Error in Anthropic streamCall method:", error);
            // Return an empty response with error message
            return {
                text: `Error calling Anthropic streaming API: ${error instanceof Error ? error.message : String(error)}`,
                toolCalls: []
            };
        }
    }
} 