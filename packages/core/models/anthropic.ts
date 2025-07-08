import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams } from "../interfaces/index.js";
import * as dotenv from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper.js";
import { SupportedModel } from "../models/index.js";
import { logger } from "../utils/logger.js";

dotenv.config();

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

    /**
     * 向后兼容的call方法 - 调用callAsync
     */
    async call(
        messages: string | AnthropicMessage[],
        tools: ToolCallDefinition[] = [],
        options?: { stepIndex?: number }
    ): Promise<{ text: string; toolCalls: ToolCallParams[]; stopReason?: string }> {
        const messageStr = typeof messages === 'string' 
            ? messages 
            : messages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
            
        const result = await this.callAsync(messageStr, tools, options);
        return {
            text: result.text,
            toolCalls: result.toolCalls || [],
            stopReason: 'end_turn'
        };
    }

    /**
     * 新的stream流式调用（必须实现）
     */
    async* callStream(
        messages: string,
        tools: ToolCallDefinition[] = [],
        options?: { stepIndex?: number }
    ): AsyncIterable<import('../interfaces/agent.js').LLMStreamChunk> {
        const stepIndex = options?.stepIndex;
        
        try {
            // 发出步骤开始事件
            if (stepIndex !== undefined) {
                yield { type: 'step-start', stepIndex };
            }
            
            const anthropic = new Anthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            });

            const anthropicTools = tools.map(tool => convertToAnthropicTool(tool, false));
            
            // Convert string messages to proper format
            const formattedMessages: AnthropicMessage[] = [{ role: "user", content: messages }];
            
            logger.debug(`Starting stream-based streaming response with Anthropic...`);

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

            let currentText = "";
            let currentTextBlockContent = "";
            const toolUsesInProgress: Record<string, any> = {};
            const completedToolCalls: ToolCallParams[] = [];
            
            // Make sure streamResponse is treated as an AsyncIterable
            const streamIterator = streamResponse as unknown as AsyncIterable<any>;
            
            for await (const chunk of streamIterator) {
                if (chunk.type === 'content_block_start') {
                    if (chunk.content_block?.type === 'tool_use') {
                        const toolKey = chunk.index.toString();
                        toolUsesInProgress[toolKey] = {
                            id: chunk.content_block.id,
                            name: chunk.content_block.name,
                            input: ''
                        };
                        
                        // 发出工具调用开始事件
                        yield {
                            type: 'tool-call-start',
                            toolCall: {
                                type: 'function',
                                call_id: chunk.content_block.id,
                                name: chunk.content_block.name,
                                parameters: {}
                            },
                            stepIndex
                        };
                    } else if (chunk.content_block?.type === 'text') {
                        // 重置当前文本块内容
                        currentTextBlockContent = "";
                    }
                } else if (chunk.type === 'content_block_delta') {
                    const delta = chunk.delta as any;
                    
                    if (delta.type === 'text_delta') {
                        // 发出文本增量
                        yield {
                            type: 'text-delta',
                            content: delta.text,
                            stepIndex,
                            chunkIndex: chunk.index
                        };
                        currentText += delta.text;
                        currentTextBlockContent += delta.text;
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
                } else if (chunk.type === 'content_block_stop') {
                    const toolKey = chunk.index.toString();
                    
                    if (toolUsesInProgress[toolKey]) {
                        // 处理工具调用完成
                        const toolUse = toolUsesInProgress[toolKey];
                        
                        if (toolUse && toolUse.id && toolUse.name) {
                            try {
                                const parsedInput = toolUse.input ? JSON.parse(toolUse.input) : {};
                                
                                const toolCall: ToolCallParams = {
                                    type: 'function',
                                    call_id: toolUse.id,
                                    name: toolUse.name,
                                    parameters: parsedInput
                                };
                                
                                completedToolCalls.push(toolCall);
                                
                                // 发出工具调用完成事件
                                yield {
                                    type: 'tool-call-done',
                                    toolCall,
                                    result: { parameters: parsedInput },
                                    stepIndex
                                };
                            } catch (e) {
                                // 发出工具调用错误事件
                                yield {
                                    type: 'tool-call-error',
                                    toolCall: {
                                        type: 'function',
                                        call_id: toolUse.id,
                                        name: toolUse.name,
                                        parameters: {}
                                    },
                                    error: new Error(`Failed to parse tool input: ${e}`),
                                    stepIndex
                                };
                            }
                        }
                        
                        // 清理已完成的工具调用
                        delete toolUsesInProgress[toolKey];
                    } else if (currentTextBlockContent) {
                        // 当文本块完成时，发出完整文本事件
                        yield {
                            type: 'text-done',
                            content: currentTextBlockContent,
                            stepIndex,
                            chunkIndex: chunk.index
                        };
                    }
                } else if (chunk.type === 'message_stop') {
                    // 发出步骤完成事件
                    if (stepIndex !== undefined) {
                        yield {
                            type: 'step-complete',
                            stepIndex,
                            result: {
                                text: currentText,
                                toolCalls: completedToolCalls
                            }
                        };
                    }
                    break;
                }
            }
            
            // 发出完成事件已在message_stop中处理
            
            logger.debug(`[AnthropicWrapper] Stream completed. Text: ${currentText.length} chars, Tools: ${completedToolCalls.length}`);
            
        } catch (error) {
            logger.error("[AnthropicWrapper] Error in callStream:", error);
            yield { 
                type: 'error', 
                errorCode: 'ANTHROPIC_ERROR',
                message: error instanceof Error ? error.message : String(error), 
                stepIndex 
            };
            throw error;
        }
    }

    /**
     * 新的async非流式调用（必须实现）
     */
    async callAsync(
        messages: string,
        tools: ToolCallDefinition[] = [],
        options?: { stepIndex?: number }
    ): Promise<{ text: string; toolCalls?: ToolCallParams[] }> {
        try {
            // 收集流式响应
            let text = '';
            let toolCalls: ToolCallParams[] = [];
            
            for await (const chunk of this.callStream(messages, tools, options)) {
                switch (chunk.type) {
                    case 'text-done':
                        text += chunk.content;
                        break;
                    case 'tool-call-done':
                        toolCalls.push(chunk.toolCall);
                        break;
                    case 'step-complete':
                        // 使用步骤完成时的最终结果
                        if (chunk.result) {
                            text = chunk.result.text || text;
                            if (chunk.result.toolCalls) {
                                toolCalls = chunk.result.toolCalls;
                            }
                        }
                        break;
                    case 'error':
                        throw new Error(chunk.message);
                }
            }
            
            return { 
                text, 
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined 
            };
            
        } catch (error) {
            logger.error("[AnthropicWrapper] Error in callAsync:", error);
            throw error;
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

        const result = await this.callAsync(continuationMessages.map(m => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n'), tools);
        return { 
            text: result.text, 
            toolCalls: result.toolCalls || [], 
            stopReason: 'continue_turn' 
        };
    }
}

// Export the validation function
export { validateAnthropicKey };

// Export types
export type { AnthropicMessage, MessageContent, ToolChoice }; 