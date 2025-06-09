import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams } from "../interfaces";
import { config } from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper";
import { SupportedModel } from "../models";
import { logger } from "../utils/logger";

config();

// Default model to use for Claude
const DEFAULT_CLAUDE_MODEL = "claude-3-7-sonnet-20240229";

// Define the Tool type explicitly to avoid importing from beta paths
interface AnthropicTool {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}

// Tool choice types
type ToolChoice = 
    | { type: "auto"; disable_parallel_tool_use?: boolean }
    | { type: "any"; disable_parallel_tool_use?: boolean }
    | { type: "tool"; name: string; disable_parallel_tool_use?: boolean }
    | { type: "none" };

// Message types for conversation support
interface MessageContent {
    type: "text" | "image" | "tool_use" | "tool_result";
    text?: string;
    id?: string;
    name?: string;
    input?: any;
    tool_use_id?: string;
    content?: string | any[];
    is_error?: boolean;
}

interface AnthropicMessage {
    role: "user" | "assistant";
    content: string | MessageContent[];
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
    return {
        name: tool.name,
        description: tool.description || "",
        input_schema: inputSchema,
    };
}

export class AnthropicWrapper implements ILLM {
    model: SupportedModel;
    streaming: boolean;
    parallelToolCall: boolean;  // Keep for interface compatibility
    temperature: number;
    maxTokens: number;
    toolChoice: ToolChoice;
    enableTokenEfficientTools: boolean;

    constructor(
        model: SupportedModel, 
        streaming: boolean = false, 
        temperature: number = 0.7, 
        maxTokens: number = 100000
    ) {
        this.model = model;
        this.streaming = streaming;
        this.parallelToolCall = true;  // Default to true for interface compatibility
        this.temperature = temperature;
        this.maxTokens = maxTokens;
        this.toolChoice = { type: "auto" };
        this.enableTokenEfficientTools = false;
    }

    setParallelToolCall(enabled: boolean): void {
        this.parallelToolCall = enabled;
        
        // Update tool_choice to include disable_parallel_tool_use
        if (this.toolChoice.type === "auto") {
            this.toolChoice = { type: "auto", disable_parallel_tool_use: !enabled };
        } else if (this.toolChoice.type === "any") {
            this.toolChoice = { type: "any", disable_parallel_tool_use: !enabled };
        } else if (this.toolChoice.type === "tool") {
            this.toolChoice = { ...this.toolChoice, disable_parallel_tool_use: !enabled };
        }
        
        console.log(`Parallel tool calls ${enabled ? 'enabled' : 'disabled'} for Anthropic model`);
    }

    setToolChoice(toolChoice: ToolChoice): void {
        this.toolChoice = toolChoice;
        
        // Sync parallelToolCall setting with the tool_choice setting
        if (toolChoice.type === "auto" || toolChoice.type === "any" || toolChoice.type === "tool") {
            if ('disable_parallel_tool_use' in toolChoice) {
                this.parallelToolCall = !toolChoice.disable_parallel_tool_use;
            }
        }
    }

    setTokenEfficientTools(enabled: boolean): void {
        this.enableTokenEfficientTools = enabled;
    }

    async call(
        messages: string | AnthropicMessage[], 
        tools: ToolCallDefinition[]
    ): Promise<{text: string, toolCalls: ToolCallParams[], stopReason?: string}> {
        try {
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            const anthropicTools = tools.map(tool => convertToAnthropicTool(tool, false));
            
            // Convert string messages to proper format
            const formattedMessages: AnthropicMessage[] = typeof messages === 'string' 
                ? [{ role: "user", content: messages }]
                : messages;

            logger.info(`Calling Anthropic API with ${tools.length} tools, model=${this.model}, disable_parallel_tool_use=${this.parallelToolCall}`);

            // Prepare request configuration
            const requestConfig: any = {
                model: this.model,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                system: "You are a helpful assistant that provides accurate and useful responses.",
                messages: formattedMessages,
            };

            // Add tools if provided
            if (tools.length > 0) {
                requestConfig.tools = anthropicTools;
                requestConfig.tool_choice = this.toolChoice;
            }

            // Add beta headers for token-efficient tools
            const headers: any = {};
            if (this.enableTokenEfficientTools && this.model.includes('claude-3-7-sonnet')) {
                headers['anthropic-beta'] = 'token-efficient-tools-2025-02-19';
            }

            const response = await anthropic.messages.create(requestConfig, { headers });

            const toolCalls: ToolCallParams[] = [];
            
            // Extract tool calls from the response
            if (response.content) {
                for (const content of response.content) {
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
                toolCalls,
                stopReason: response.stop_reason || undefined
            };
        } catch (error) {
            console.error("Error in Anthropic call method:", error);
            // Return an empty response with error message
            return {
                text: `Error calling Anthropic API: ${error instanceof Error ? error.message : String(error)}`,
                toolCalls: [],
                stopReason: "error"
            };
        }
    }

    async streamCall(
        messages: string | AnthropicMessage[], 
        tools: ToolCallDefinition[]
    ): Promise<{text: string, toolCalls: ToolCallParams[], stopReason?: string}> {
        try {
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            const anthropicTools = tools.map(tool => convertToAnthropicTool(tool, false));
            
            // Convert string messages to proper format
            const formattedMessages: AnthropicMessage[] = typeof messages === 'string' 
                ? [{ role: "user", content: messages }]
                : messages;
            
            console.log(`Streaming Anthropic API with ${tools.length} tools, model=${this.model}, disable_parallel_tool_use=${this.parallelToolCall}`);

            // Prepare request configuration
            const requestConfig: any = {
                model: this.model,
                max_tokens: this.maxTokens,
                temperature: this.temperature,
                system: "You are a helpful assistant that provides accurate and useful responses.",
                messages: formattedMessages,
                stream: true
            };

            // Add tools if provided
            if (tools.length > 0) {
                requestConfig.tools = anthropicTools;
                requestConfig.tool_choice = this.toolChoice;
            }

            // Add beta headers for token-efficient tools
            const headers: any = {};
            if (this.enableTokenEfficientTools && this.model.includes('claude-3-7-sonnet')) {
                headers['anthropic-beta'] = 'token-efficient-tools-2025-02-19';
            }

            const streamResponse = await anthropic.messages.create(requestConfig, { headers });

            let generatedText = "";
            const toolCalls: ToolCallParams[] = [];
            const toolUsesInProgress: Record<string, any> = {};
            let stopReason: string | undefined;
            
            // Make sure streamResponse is treated as an AsyncIterable
            const streamIterator = streamResponse as unknown as AsyncIterable<any>;
            
            for await (const chunk of streamIterator) {
                if (chunk.type === 'content_block_delta') {
                    const delta = chunk.delta as any;
                    
                    if (delta.type === 'text_delta') {
                        generatedText += delta.text;
                    } else if (delta.type === 'input_json_delta') {
                        // Handle tool input streaming
                        const toolKey = chunk.index.toString();
                        
                        if (!toolUsesInProgress[toolKey]) {
                            toolUsesInProgress[toolKey] = {
                                id: '',
                                name: '',
                                input: ''
                            };
                        }
                        
                        toolUsesInProgress[toolKey].input += delta.partial_json;
                    }
                } else if (chunk.type === 'content_block_start') {
                    if (chunk.content_block?.type === 'tool_use') {
                        const toolKey = chunk.index.toString();
                        toolUsesInProgress[toolKey] = {
                            id: chunk.content_block.id,
                            name: chunk.content_block.name,
                            input: ''
                        };
                    }
                } else if (chunk.type === 'content_block_stop') {
                    if (chunk.content_block?.type === 'tool_use') {
                        const toolKey = chunk.index.toString();
                        const toolUse = toolUsesInProgress[toolKey];
                        
                        if (toolUse && toolUse.id && toolUse.name) {
                            try {
                                const parsedInput = toolUse.input ? JSON.parse(toolUse.input) : {};
                                toolCalls.push({
                                    type: "function" as const,
                                    name: toolUse.name,
                                    call_id: toolUse.id,
                                    parameters: parsedInput,
                                });
                            } catch (e) {
                                console.error(`Error parsing tool input:`, e);
                            }
                        }
                    }
                } else if (chunk.type === 'message_stop') {
                    stopReason = chunk.stop_reason || undefined;
                } else if (chunk.type === 'message_delta') {
                    if (chunk.delta?.stop_reason) {
                        stopReason = chunk.delta.stop_reason;
                    }
                }
            }
            
            console.log(`Stream complete. Generated ${generatedText.length} chars of text and ${toolCalls.length} tool calls`);

            return {
                text: generatedText,
                toolCalls,
                stopReason
            };
        } catch (error) {
            console.error("Error in Anthropic streamCall method:", error);
            return {
                text: `Error calling Anthropic streaming API: ${error instanceof Error ? error.message : String(error)}`,
                toolCalls: [],
                stopReason: "error"
            };
        }
    }

    // Helper method to create tool result messages
    createToolResultMessage(toolUseId: string, content: string | any[], isError: boolean = false): AnthropicMessage {
        return {
            role: "user",
            content: [{
                type: "tool_result",
                tool_use_id: toolUseId,
                content: typeof content === 'string' ? content : content,
                is_error: isError
            }]
        };
    }

    // Helper method to handle pause_turn scenario
    async continuePausedTurn(
        pausedResponse: any,
        originalMessages: AnthropicMessage[],
        tools: ToolCallDefinition[]
    ): Promise<{text: string, toolCalls: ToolCallParams[], stopReason?: string}> {
        if (pausedResponse.stop_reason !== 'pause_turn') {
            throw new Error('Response is not paused');
        }

        const continuationMessages = [
            ...originalMessages,
            { role: "assistant" as const, content: pausedResponse.content }
        ];

        return this.call(continuationMessages, tools);
    }
}

// Export the validation function
export { validateAnthropicKey };

// Export types
export type { AnthropicMessage, MessageContent, ToolChoice }; 