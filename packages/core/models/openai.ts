import openai, { OpenAI } from "openai";
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams, LLMCallbacks } from "../interfaces";
import dotenv from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper";
import { SupportedModel } from "../models";
import { logger } from "../utils/logger";
import { response } from "express";

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

    /**
     * 向后兼容的call方法 - 调用callAsync
     */
    async call(
        messages: string,
        tools: ToolCallDefinition[] = [],
        options?: { stepIndex?: number }
    ): Promise<{ text: string; toolCalls: ToolCallParams[] }> {
        const result = await this.callAsync(messages, tools, options);
        return {
            text: result.text,
            toolCalls: result.toolCalls || []
        };
    }

    /**
     * 新的stream流式调用（推荐使用）
     */
    async* callStream(
        messages: string,
        tools: ToolCallDefinition[] = [],
        options?: { stepIndex?: number }
    ): AsyncIterable<import('../interfaces/agent').LLMStreamChunk> {
        const stepIndex = options?.stepIndex!;


        
        try {
            // 发出步骤开始事件
            if (stepIndex !== undefined) {
                yield { type: 'step-start', stepIndex };
            }
            
            const openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            });
            
            const openaiTools = tools.map(tool => convertToOpenaiTool(tool, false));
            
            logger.debug("Starting stream-based streaming response with OpenAI...");
            
            // 创建流式响应
            const stream = await openai.responses.create({
                model: this.model,
                input: messages,
                tools: openaiTools,
                stream: true,
                store: true,
                parallel_tool_calls: this.parallelToolCall,
            });

            let currentText = '';
            const toolCalls = new Map<string, {
                id: string;
                name: string;
                arguments: string;
            }>();

            // 处理流式响应
            for await (const event of stream) {
                if (stepIndex !== undefined) {
                    if (event.type === "response.created") {
                        yield {
                            type: 'step-start',
                            stepIndex,
                        };
                    }
                }

                if (event.type === "response.output_text.delta") {
                    yield {
                        type: 'text-delta',
                        content: event.delta,
                        outputIndex: event.output_index, // The index of the output item that the text delta was added to.
                        stepIndex,
                        chunkIndex: event.sequence_number
                    };
                }else if(event.type == "response.output_text.done") {
                    // 注意这里其实只是收集了一个chunk 的text 而不是完整的text
                    yield {
                            type: 'text-done',
                            content: event.text,
                            stepIndex,
                            chunkIndex: event.sequence_number
                    };
                }

                if (event.type === "response.output_item.added") {
                    const item = event.item;
                    if (item.type === "function_call") {
                        // 处理工具调用
                        const toolCallId = item.call_id || item.id;
                        if (toolCallId && item.name) {
                            // 工具调用开始
                            yield {
                                type: 'tool-call-start',
                                toolCall: {
                                    type: 'function',
                                    call_id: toolCallId,
                                    name: item.name,
                                    parameters: item.arguments,
                                },
                                stepIndex
                            };
                        }
                    }
                }
                if (event.type === "response.output_item.done") {
                    const item = event.item;
                    
                 if (item.type === "function_call") {
                        // 处理工具调用
                        const toolCallId = item.call_id || item.id;
                        if (toolCallId && item.name) {
                            // 解析参数并发出完成事件
                            try {
                                const parameters = item.arguments ? JSON.parse(item.arguments) : {};
                                yield {
                                    type: 'tool-call-done',
                                    toolCall: {
                                        type: 'function',
                                        call_id: toolCallId,
                                        name: item.name,
                                        parameters
                                    },
                                    result: { parameters },
                                    stepIndex
                                };
                            } catch (error) {
                                yield {
                                    type: 'tool-call-error',
                                    toolCall: {
                                        type: 'function',
                                        call_id: toolCallId,
                                        name: item.name,
                                        parameters: {}
                                    },
                                    error: new Error(`Failed to parse tool arguments: ${item.arguments}`),
                                    stepIndex
                                };
                            }
                        }
                    }
                }

                // finish the whole step 
                if (event.type === "response.completed") {

                    // 发出步骤完成事件
                    if (stepIndex !== undefined) {
                        yield {
                            type: 'step-complete',
                            stepIndex,
                            result: {
                                text: currentText,
                                toolCalls: Array.from(toolCalls.values())
                            }
                        };
                    }
                    
                    break;
                }

                if (event.type == "error") {
                    let ec;
                    if (event.code == null){
                        ec = 'NONE'
                    }else{
                        ec = event.code;
                    }
                    yield {
                        type: 'error',
                        errorCode: ec,
                        message: event.message,
                    }
                }

            }
        
            
        } catch (error) {
            logger.error("[OpenAIWrapper] Error in callStream:", error);
            yield { 
                type: 'error', 
                errorCode: 'NONE', 
                message: String(error), 
                stepIndex 
            };
            throw error;
        }
    }

    /**
     * 新的async非流式调用（推荐使用）
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
                    case 'error':
                        throw chunk.message;
                }
            }
            
            return { 
                text, 
                toolCalls: toolCalls.length > 0 ? toolCalls : undefined 
            };
            
        } catch (error) {
            logger.error("[OpenAIWrapper] Error in callAsync:", error);
            throw error;
        }
    }
}