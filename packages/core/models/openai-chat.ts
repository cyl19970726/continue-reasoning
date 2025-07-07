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
		callbacks?: LLMCallbacks
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

		callbacks?.onStart?.();

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
				
				// Call text callbacks
				callbacks?.onChunkStart?.(0, { type: 'text' });
				callbacks?.onTextDone?.(text);
				callbacks?.onChunkComplete?.(0, { type: 'text' });
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
				
				// Call tool callbacks
				callbacks?.onChunkStart?.(1, { type: 'tool_call', id: callId });
				callbacks?.onToolCallStart?.({ id: callId, name: fnCall.name });
				callbacks?.onToolCallDone?.({ id: callId, name: fnCall.name, arguments: params });
				callbacks?.onChunkComplete?.(1, { type: 'tool_call', id: callId });
				
				toolCalls.push({
					type: "function",
					name: fnCall.name,
					call_id: callId,
					parameters: params,
				});
			}
		}

		callbacks?.onComplete?.();

		return { text, toolCalls };
	}

	async streamCall(
		messages: string,
		tools: ToolCallDefinition[],
		callbacks?: LLMCallbacks
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

		callbacks?.onStart?.();

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
					callbacks?.onChunkStart?.(0, { type: 'text' });
					textChunkStarted = true;
				}
				text += delta.content;
				callbacks?.onTextDelta?.(delta.content);
			}
			
			if (delta.function_call?.name) {
				if (!toolChunkStarted) {
					callBuffer.id = Date.now().toString();
					callbacks?.onChunkStart?.(1, { type: 'tool_call', id: callBuffer.id });
					toolChunkStarted = true;
				}
				callBuffer.name = delta.function_call.name;
				callbacks?.onToolCallStart?.({ id: callBuffer.id!, name: callBuffer.name });
			}
			
			if (delta.function_call?.arguments) {
				callBuffer.arguments = (callBuffer.arguments || "") + delta.function_call.arguments;
				callbacks?.onToolCallDelta?.({ id: callBuffer.id!, delta: delta.function_call.arguments });
			}
		}

		// Send completion callbacks
		if (textChunkStarted) {
			callbacks?.onTextDone?.(text);
			callbacks?.onChunkComplete?.(0, { type: 'text' });
		}

		if (callBuffer.name && toolChunkStarted) {
			let params: any = {};
			try {
				params = JSON.parse(callBuffer.arguments || "{}");
			} catch (e) {
				console.error(`Error parsing function arguments for ${callBuffer.name}:`, e);
			}
			
			callbacks?.onToolCallDone?.({ id: callBuffer.id!, name: callBuffer.name, arguments: params });
			callbacks?.onChunkComplete?.(1, { type: 'tool_call', id: callBuffer.id });
			
			toolCalls.push({
				type: "function",
				name: callBuffer.name,
				call_id: callBuffer.id!,
				parameters: params,
			});
		}

		callbacks?.onComplete?.();

		return { text, toolCalls };
	}
}