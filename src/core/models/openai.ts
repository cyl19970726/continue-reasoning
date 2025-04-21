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

// Function to recursively convert Zod schemas (can be moved outside if preferred)

// Example Zod Schemas (from plan.ts for context)
// export const StepSchema = z.object({
//     id: z.number().describe("..."),
//     task: z.string().describe("..."),
//     process: z.string().describe("..."),
//     result: z.string().describe("..."),
// });
// export const PlanInfoSchema = z.object({
//     id: z.string().describe("..."),
//     memoryId: z.string().describe("..."),
//     description: z.string().describe("..."),
//     status: z.enum(["pending", "resolved", "rejected"]).describe("..."),
//     result: z.string().describe("..."),
// });
// export const PlanDataSchema = PlanInfoSchema.extend({
//     steps: z.array(StepSchema).describe("..."),
//     pendingSteps: z.array(z.number()).describe("..."),
//     maxPendingSteps: z.number().describe("..."),
//     resolvedSteps: z.array(z.number()).describe("..."),
//     rejectedSteps: z.array(z.number()).describe("..."),
// });

// Example JSON Schema output for PlanDataSchema:
/*
{
  "type": "object",
  "properties": {
    "id": { "type": "string", "description": "Unique identifier for the plan this info relates to." },
    "memoryId": { "type": "string", "description": "The key used to store/retrieve this plan's full details from memory, if applicable." },
    "description": { "type": "string", "description": "A concise summary or description of the overall plan." },
    "status": { "type": "string", "enum": ["pending", "resolved", "rejected"], "description": "The current high-level status of the plan." },
    "result": { "type": "string", "description": "The final result of the plan." },
    "steps": {
      "type": "array",
      "description": "The list of sequential or parallel steps required to complete the plan.",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "number", "description": "Sequential identifier for the step within the plan, typically assigned based on order during creation." },
          "task": { "type": "string", "description": "A description of the specific action or goal to be achieved in this step." },
          "process": { "type": "string", "description": "A detailed description of the workflow executed for this step, including encountered problems and how they were addressed." },
          "result": { "type": "string", "description": "The outcome or final result produced by executing this step." }
        },
        "required": ["id", "task", "process", "result"] // Assuming all fields in StepSchema are required
      }
    },
    "pendingSteps": {
      "type": "array",
      "description": "The IDs of the steps currently being executed or actively waiting for asynchronous results.",
      "items": { "type": "number" }
    },
    "maxPendingSteps": { "type": "number", "description": "The maximum number of steps that can be pending at any given time." },
    "resolvedSteps": {
      "type": "array",
      "description": "The IDs of the steps that have been completed.",
      "items": { "type": "number" }
    },
    "rejectedSteps": {
      "type": "array",
      "description": "The IDs of the steps that have been rejected.",
      "items": { "type": "number" }
    }
  },
  // Assuming all fields in PlanInfoSchema and the extended fields are required
  "required": [
    "id", "memoryId", "description", "status", "result",
    "steps", "pendingSteps", "maxPendingSteps", "resolvedSteps", "rejectedSteps"
  ]
}
*/

function convertZodToJsonSchemaRecursive(schema: z.ZodTypeAny): Record<string, any> {
    const definition = schema._def;
    let jsonSchema: Record<string, any> = {};

    // Handle optional/nullable by processing the inner type
    if (definition.typeName === 'ZodOptional' || definition.typeName === 'ZodNullable') {
        return convertZodToJsonSchemaRecursive((schema as z.ZodOptional<any> | z.ZodNullable<any>)._def.innerType);
    }

    switch (definition.typeName) {
        case 'ZodString':
            jsonSchema.type = 'string';
            if ('checks' in definition && definition.checks) {
                const enumCheck = definition.checks.find((check: any) => check.kind === 'enum');
                if (enumCheck) jsonSchema.enum = enumCheck.values;
            }
            break;
        case 'ZodNumber':
        case 'ZodBigInt':
            jsonSchema.type = 'number';
            break;
        case 'ZodBoolean':
            jsonSchema.type = 'boolean';
            break;
        case 'ZodDate':
            jsonSchema.type = 'string';
            jsonSchema.format = 'date-time';
            break;
        case 'ZodEnum':
            jsonSchema.type = 'string';
            jsonSchema.enum = (definition as z.ZodEnumDef<any>).values;
            break;
        case 'ZodNativeEnum':
             const values = Object.values((definition as z.ZodNativeEnumDef<any>).values);
             jsonSchema.type = typeof values[0] === 'number' ? 'number' : 'string';
             jsonSchema.enum = values.filter(v => typeof v === jsonSchema.type);
            break;
        case 'ZodObject':
            jsonSchema.type = 'object';
            jsonSchema.properties = {};
            jsonSchema.required = [];
            const shape = (definition as z.ZodObjectDef).shape();
            for (const key in shape) {
                const fieldSchema = shape[key];
                jsonSchema.properties[key] = convertZodToJsonSchemaRecursive(fieldSchema); // Recursive call
                if (fieldSchema._def.typeName !== 'ZodOptional' && fieldSchema._def.typeName !== 'ZodNullable') {
                    jsonSchema.required.push(key);
                }
            }
            if (jsonSchema.required.length === 0) delete jsonSchema.required;
            break;
        case 'ZodArray':
            jsonSchema.type = 'array';
            jsonSchema.items = convertZodToJsonSchemaRecursive((definition as z.ZodArrayDef).type); // Recursive call for items
            break;
        case 'ZodTuple':
            jsonSchema.type = 'array';
            jsonSchema.items = (definition as z.ZodTupleDef).items.map((item: z.ZodTypeAny) => convertZodToJsonSchemaRecursive(item));
            jsonSchema.minItems = (definition as z.ZodTupleDef).items.length;
            jsonSchema.maxItems = (definition as z.ZodTupleDef).items.length;
           break;
        default:
            console.warn(`Unhandled Zod type: ${definition.typeName} - mapping to 'any'`);
            jsonSchema.type = 'any'; // Or more specific fallback
            break;
    }

    if (schema.description) {
        jsonSchema.description = schema.description;
    }
    jsonSchema.additionalProperties = false;

    return jsonSchema;
}

// Use the correct Tool type expected by the API call
// type OpenaiFunctionTool = OpenAI.Chat.Completions.ChatCompletionTool;
type OpenaiFunctionTool = OpenAI.Responses.FunctionTool;

function convertToOpenaiTool(tool: ToolCallDefinition): OpenaiFunctionTool {
    // Assuming tool.paramSchema is always a ZodObject for the top level
    if (!(tool.paramSchema instanceof z.ZodObject)) {
        throw new Error(`Tool ${tool.name} paramSchema must be a ZodObject.`);
    }

    // Generate the full JSON schema using the recursive function
    const parametersSchema = convertZodToJsonSchemaRecursive(tool.paramSchema);

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
        strict: true,
        type: "function",
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

        // console.log("tools:: ", tools);
        const openaiTools = tools.map(convertToOpenaiTool);
        // console.log("openaiTools:: ", JSON.stringify(openaiTools, null, 2)); // Add logging

        // Use openai.chat.completions.create
        // const response = await openai.chat.completions.create({
        //     model: "gpt-4o", // Use configured model or default
        //     messages: [{ role: "user", content: messages }], // Correct message format
        //     tools: openaiTools,
        //     temperature: this.temperature,
        //     max_tokens: this.maxTokens,
        //     // parallel_tool_calls: this.parallelToolCall // Add if needed
        // }); 

        const response = await openai.responses.create({
            model: "gpt-4.1",
            input: messages,
            tools: openaiTools,
            store: true,
        });

        const toolCalls = response.output.filter((item) => item.type === "function_call").map((item) => ({
            type: "function" as const,
            name: item.name,
            call_id: item.call_id,
            parameters: JSON.parse(item.arguments),
        }));

        // const message = response.output;
        // const generatedToolCalls = response.tools;
        // The generatedToolCalls is an array of objects like this:
        // [{
        //     "type": "function_call",
        //     "id": "fc_12345xyz",
        //     "call_id": "call_12345xyz",
        //     "name": "get_weather",
        //     "arguments": "{\"location\":\"Paris, France\"}"
        // }]
        // const toolCalls: ToolCallParams[] = [];

        // if (generatedToolCalls) {
        //     generatedToolCalls.forEach(call => {
        //         if (call.type === 'function') {
        //             try {
        //                  toolCalls.push({
        //                     type: "function" as const,
        //                     name: call.name,
        //                     call_id: call.call_id,
        //                     parameters: JSON.parse(call.arguments),
        //                 });
        //             } catch (e) {
        //                 console.error(`Error parsing arguments for tool call ${call.id} (${call.function.name}):`, e);
        //                 // Handle error - maybe push an error object or skip
        //             }
        //         }
        //     });
        // }

        // console.log("Response Message:", message);
        console.log("Extracted Tool Calls:", toolCalls);

        return {
            text: response.output_text || "",
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