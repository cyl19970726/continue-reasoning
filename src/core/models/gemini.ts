import { GoogleGenAI, FunctionCallingConfigMode, Type } from '@google/genai';
import { z } from "zod";
import { ILLM, LLMModel, ToolCallDefinition, ToolCallParams } from "../interfaces";
import dotenv from "dotenv";
import { zodToJsonNostrict, zodToJsonStrict } from "../utils/jsonHelper";

dotenv.config();

// Default model to use for Gemini
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-001";
const GEMINI_MODEL = "gemini-2.5-pro-exp-03-25"

async function validateGeminiKey(): Promise<boolean> {
    try {
        const genAI = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY || "",
        });
        // Make a simple API call to test the key
        // Check if the API key is valid by trying to access the models
        await genAI.models.generateContent({
            model: DEFAULT_GEMINI_MODEL,
            contents: "test",
            config: { maxOutputTokens: 1 }
        });
        return true;
    } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('api key')) {
            return false;
        }
        // For other types of errors, assume key is valid but other issues exist
        return true;
    }
}

function convertSchemaTypeToGeminiType(schemaType: string): any {
    switch (schemaType) {
        case 'string':
            return Type.STRING;
        case 'number':
        case 'integer':
            return Type.NUMBER;
        case 'boolean':
            return Type.BOOLEAN;
        case 'array':
            return Type.ARRAY;
        case 'object':
            return Type.OBJECT;
        default:
            return Type.STRING; // Default to string for unknown types
    }
}

function convertToGeminiTool(tool: ToolCallDefinition, strict: boolean = false): any {
    // Assuming tool.paramSchema is always a ZodObject for the top level
    if (!(tool.paramSchema instanceof z.ZodObject)) {
        throw new Error(`Tool ${tool.name} paramSchema must be a ZodObject.`);
    }

    // Generate the JSON schema using the appropriate conversion function
    const parametersSchema = strict ? zodToJsonStrict(tool.paramSchema) : zodToJsonNostrict(tool.paramSchema);

    // Convert to Gemini's function declaration format
    return {
        name: tool.name,
        description: tool.description || "",
        parameters: {
            type: Type.OBJECT,
            description: parametersSchema.description || "",
            properties: convertPropertiesToGeminiFormat(parametersSchema.properties || {}),
            required: parametersSchema.required || []
        }
    };
}

function convertPropertiesToGeminiFormat(properties: Record<string, any>): Record<string, any> {
    const geminiProperties: Record<string, any> = {};

    for (const [key, prop] of Object.entries(properties)) {
        geminiProperties[key] = {
            type: convertSchemaTypeToGeminiType(prop.type),
            description: prop.description || ""
        };

        // Handle nested objects
        if (prop.type === 'object' && prop.properties) {
            geminiProperties[key].properties = convertPropertiesToGeminiFormat(prop.properties);
            if (prop.required) {
                geminiProperties[key].required = prop.required;
            }
        }

        // Handle arrays
        if (prop.type === 'array' && prop.items) {
            geminiProperties[key].items = {
                type: convertSchemaTypeToGeminiType(prop.items.type)
            };
            if (prop.items.description) {
                geminiProperties[key].items.description = prop.items.description;
            }
        }

        // Handle enums
        if (prop.enum) {
            geminiProperties[key].enum = prop.enum;
        }
    }

    return geminiProperties;
}

export class GeminiWrapper implements ILLM {
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
        this.modelName = GEMINI_MODEL;
    }
    
    setParallelToolCall(enabled: boolean): void {
        this.parallelToolCall = enabled;
        console.log(`Parallel tool calls ${enabled ? 'enabled' : 'disabled'} for Gemini model`);
    }
    
    async call(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        try {
            const genAI = new GoogleGenAI({
                apiKey: process.env.GEMINI_API_KEY,
            });
            
            console.log(`Calling Gemini API with ${tools.length} tools, model=${this.modelName}, parallel_tool_use=${this.parallelToolCall}`);
            
            // Prepare function declarations from tools
            const functionDeclarations = tools.map(tool => convertToGeminiTool(tool, false));
            
            // Configure function calling mode based on parallelToolCall setting
            const mode = this.parallelToolCall ? 
                FunctionCallingConfigMode.ANY : 
                FunctionCallingConfigMode.AUTO;
            
            // Call the model
            const response = await genAI.models.generateContent({
                model: this.modelName,
                contents: messages || "",
                config: {
                    temperature: this.temperature,
                    maxOutputTokens: this.maxTokens,
                    toolConfig: {
                        functionCallingConfig: {
                            mode: mode
                        }
                    },
                    tools: tools.length > 0 ? [{
                        functionDeclarations: functionDeclarations
                    }] : undefined
                }
            });
            
            // Process the response
            const toolCalls: ToolCallParams[] = [];
            let textContent = '';
            
            // Extract text content
            if (response.text) {
                textContent = response.text;
            }
            
            // Extract function calls
            if (response.functionCalls && response.functionCalls.length > 0) {
                for (const functionCall of response.functionCalls) {
                    try {
                        toolCalls.push({
                            type: "function" as const,
                            name: functionCall.name || "", // Ensure name is always a string
                            call_id: functionCall.id || "", // Generate unique ID
                            parameters: functionCall.args || {},
                        });
                    } catch (e) {
                        console.error(`Error processing Gemini function call:`, e);
                    }
                }
            }
            
            return {
                text: textContent,
                toolCalls
            };
        } catch (error) {
            console.error("Error in Gemini call method:", error);
            return {
                text: `Error calling Gemini API: ${error instanceof Error ? error.message : String(error)}`,
                toolCalls: []
            };
        }
    }
    
    async streamCall(messages: string, tools: ToolCallDefinition[]): Promise<{text: string, toolCalls: ToolCallParams[]}> {
        try {
            // For streamCall, we'll still use the regular call method but inform the user
            // that actual streaming isn't available with the current API
            console.log("Note: True streaming is not available with the @google/genai API. Using regular call instead.");
            return await this.call(messages, tools);
        } catch (error) {
            console.error("Error in Gemini streamCall method:", error);
            return {
                text: `Error calling Gemini streaming API: ${error instanceof Error ? error.message : String(error)}`,
                toolCalls: []
            };
        }
    }
} 