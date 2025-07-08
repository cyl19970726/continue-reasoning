import openai, { OpenAI } from "openai";
import { z } from "zod";
import { ILLM, ToolCallDefinition, ToolCallParams, LLMCallbacks } from "../interfaces";
import dotenv from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper";
import { DEEPSEEK_MODELS, SupportedModel } from "../models";
import { logger } from "../utils/logger";

dotenv.config();

// Use the correct Tool type expected by the Chat Completion API
// type OpenaiChatFunction = OpenAI.Chat.Completions.ChatCompletionTool;
type OpenaiChatFunction = OpenAI.Chat.Completions.ChatCompletionCreateParams.Function;

function convertToOpenaiChatFunction(tool: ToolCallDefinition, strict: boolean = false): OpenaiChatFunction {
	// Assuming tool.paramSchema is always a ZodObject for the top level
	if (!(tool.paramSchema instanceof z.ZodObject)) {
		throw new Error(`Tool ${tool.name} paramSchema must be a ZodObject.`);
	}

	// Generate the JSON schema for function parameters
	const parametersSchema = strict
		? zodToJsonStrict(tool.paramSchema)
		: zodToJsonNostrict(tool.paramSchema);

	// Ensure the schema is an object with properties
	if (parametersSchema.type !== 'object' || !parametersSchema.properties) {
		console.error(
			`Schema conversion resulted in non-object type for tool ${tool.name}:`,
			parametersSchema
		);
		throw new Error(
			`Schema conversion failed for tool ${tool.name}: Expected object schema output.`
		);
	}

	return {
		name: tool.name,
		description: tool.description || undefined,
		parameters: parametersSchema as Record<string, unknown>,
	};
}

export class OpenAIChatWrapper implements ILLM {
	model: SupportedModel;
	streaming: boolean;
	parallelToolCall: boolean;
	temperature: number;
	maxTokens: number;

	constructor(
		model: SupportedModel,
		streaming: boolean = false,
		temperature: number = 0.7,
		maxTokens: number = 100000,
		parallelToolCall: boolean = false
	) {
		this.model = model;
		this.streaming = streaming;
		this.parallelToolCall = parallelToolCall;
		this.temperature = temperature;
		this.maxTokens = maxTokens;
	}

	setParallelToolCall(enabled: boolean): void {
		this.parallelToolCall = enabled;
	}

	async call(
		messages: string,
		tools: ToolCallDefinition[],
		options?: { stepIndex?: number }
	): Promise<{ text: string; toolCalls: ToolCallParams[] }> {
		let client: OpenAI;
		if (Object.values(DEEPSEEK_MODELS).includes(this.model as DEEPSEEK_MODELS)) {
			logger.info(`Using DeepSeek model: ${this.model}`);
			client = new OpenAI({ 
				baseURL: 'https://api.deepseek.com',
				apiKey: process.env.DEEPSEEK_API_KEY 
			});
		} else {
			logger.info(`Using OpenAI model: ${this.model}`);
			client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
		}

		const functions = tools.map((tool) => convertToOpenaiChatFunction(tool, false));

		const response = await client.chat.completions.create({
			model: this.model,
			messages: [{ role: "user", content: messages }],
			temperature: this.temperature,
			max_tokens: this.maxTokens,
			functions,
		});

		const choice = response.choices?.[0];
		let text = "";
		const toolCalls: ToolCallParams[] = [];

		if (choice?.message) {
			if (choice.message.content) {
				text = choice.message.content;
			}
			if (choice.message.function_call) {
				const fnCall = choice.message.function_call;
				let params: any = {};
				try {
					params = JSON.parse(fnCall.arguments || "{}");
				} catch (e) {
					console.error(
						`Error parsing function arguments for ${fnCall.name}:`,
						e
					);
				}
				
				const callId = Date.now().toString();
				
				toolCalls.push({
					type: "function",
					name: fnCall.name,
					call_id: callId,
					parameters: params,
				});
			}
		}

		return { text, toolCalls };
	}

	async streamCall(
		messages: string,
		tools: ToolCallDefinition[],
		options?: { stepIndex?: number }
	): Promise<{ text: string; toolCalls: ToolCallParams[] }> {
		let client: OpenAI;
		if (Object.values(DEEPSEEK_MODELS).includes(this.model as DEEPSEEK_MODELS)) {
			logger.info(`Using DeepSeek model: ${this.model}`);
			client = new OpenAI({ 
				baseURL: 'https://api.deepseek.com',
				apiKey: process.env.DEEPSEEK_API_KEY 
			});
		} else {
			logger.info(`Using OpenAI model: ${this.model}`);
			client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
		}

		const functions = tools.map((tool) => convertToOpenaiChatFunction(tool, false));

		const stream = await client.chat.completions.create({
			model: this.model,
			messages: [{ role: "user", content: messages }],
			temperature: this.temperature,
			max_tokens: this.maxTokens,
			functions,
			stream: true,
		});

		let text = "";
		const toolCalls: ToolCallParams[] = [];
		const callBuffer: { name?: string; arguments?: string; id?: string; started?: boolean } = {};

		// Track if we've started text or tool call chunks
		let textChunkStarted = false;
		let toolChunkStarted = false;

		for await (const chunk of stream) {
			const choice = chunk.choices?.[0];
			if (!choice) continue;

			const delta = (choice.delta as any) || {};
			
			if (delta.content) {
				if (!textChunkStarted) {
					textChunkStarted = true;
				}
				text += delta.content;
			}
			
			if (delta.function_call?.name) {
				if (!toolChunkStarted) {
					callBuffer.id = Date.now().toString();
					toolChunkStarted = true;
				}
				callBuffer.name = delta.function_call.name;
			}
			
			if (delta.function_call?.arguments) {
				callBuffer.arguments = (callBuffer.arguments || "") + delta.function_call.arguments;
			}
		}

		// Send completion callbacks
		if (textChunkStarted) {
			// Text completion handled
		}

		if (callBuffer.name && toolChunkStarted) {
			let params: any = {};
			try {
				params = JSON.parse(callBuffer.arguments || "{}");
			} catch (e) {
				console.error(`Error parsing function arguments for ${callBuffer.name}:`, e);
			}
			
			// Tool call completion handled
			
			toolCalls.push({
				type: "function",
				name: callBuffer.name,
				call_id: callBuffer.id!,
				parameters: params,
			});
		}

		return { text, toolCalls };
	}

	/**
	 * 新的stream流式调用（必须实现）
	 */
	async* callStream(
		messages: string,
		tools: ToolCallDefinition[] = [],
		options?: { stepIndex?: number }
	): AsyncIterable<import('../interfaces/agent').LLMStreamChunk> {
		const stepIndex = options?.stepIndex;
		
		try {
			// 发出步骤开始事件
			if (stepIndex !== undefined) {
				yield { type: 'step-start', stepIndex };
			}
			
			let client: OpenAI;
			if (Object.values(DEEPSEEK_MODELS).includes(this.model as DEEPSEEK_MODELS)) {
				logger.debug(`Using DeepSeek model: ${this.model}`);
				client = new OpenAI({ 
					baseURL: 'https://api.deepseek.com',
					apiKey: process.env.DEEPSEEK_API_KEY 
				});
			} else {
				logger.debug(`Using OpenAI model: ${this.model}`);
				client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
			}
			
			const functions = tools.map((tool) => convertToOpenaiChatFunction(tool, false));
			
			logger.debug("Starting stream-based streaming response with OpenAI Chat...");
			
			const stream = await client.chat.completions.create({
				model: this.model,
				messages: [{ role: "user", content: messages }],
				temperature: this.temperature,
				max_tokens: this.maxTokens,
				functions: functions.length > 0 ? functions : undefined,
				parallel_tool_calls: this.parallelToolCall,
				stream: true,
			});
			
			let currentText = '';
			const callBuffer: { name?: string; arguments?: string; id?: string } = {};
			
			for await (const chunk of stream) {
				const choice = chunk.choices?.[0];
				if (!choice) continue;
				
				const delta = (choice.delta as any) || {};
				
				// Handle text content
				if (delta.content) {
					yield {
						type: 'text-delta',
						content: delta.content,
						stepIndex,
						chunkIndex: chunk.choices[0]?.index || 0
					};
					currentText += delta.content;
				}
				
				// Handle function call start
				if (delta.function_call?.name) {
					callBuffer.name = delta.function_call.name;
					callBuffer.id = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
					callBuffer.arguments = '';
					
					// 发出工具调用开始事件
					yield {
						type: 'tool-call-start',
						toolCall: {
							type: 'function',
							call_id: callBuffer.id || '',
							name: callBuffer.name || '',
							parameters: {}
						},
						stepIndex
					};
				}
				
				// Handle function call arguments
				if (delta.function_call?.arguments) {
					callBuffer.arguments = (callBuffer.arguments || '') + delta.function_call.arguments;
				}
				
				// Handle choice finish
				if (choice.finish_reason) {
					// 发出完整文本事件
					if (currentText) {
						yield {
							type: 'text-done',
							content: currentText,
							stepIndex,
							chunkIndex: chunk.choices[0]?.index || 0
						};
					}
					
					// 发出工具调用完成事件
					if (callBuffer.name && callBuffer.id) {
						try {
							const parameters = callBuffer.arguments ? JSON.parse(callBuffer.arguments) : {};
							
							yield {
								type: 'tool-call-done',
								toolCall: {
									type: 'function',
									call_id: callBuffer.id!,
									name: callBuffer.name!,
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
									call_id: callBuffer.id!,
									name: callBuffer.name!,
									parameters: {}
								},
								error: new Error(`Failed to parse tool arguments: ${callBuffer.arguments}`),
								stepIndex
							};
						}
					}
					
					// 发出步骤完成事件
					if (stepIndex !== undefined) {
						yield {
							type: 'step-complete',
							stepIndex,
							result: {
								text: currentText,
								finishReason: choice.finish_reason
							}
						};
					}
					
					break;
				}
			}
			
		} catch (error) {
			logger.error("[OpenAIChatWrapper] Error in callStream:", error);
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
					case 'error':
						throw chunk.message;
				}
			}
			
			return { 
				text, 
				toolCalls: toolCalls.length > 0 ? toolCalls : undefined 
			};
			
		} catch (error) {
			logger.error("[OpenAIChatWrapper] Error in callAsync:", error);
			throw error;
		}
	}
}