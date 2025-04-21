import { createTool, ContextHelper } from "../utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { any, z } from "zod";
import { IAgent } from "../interfaces";

// Use instanceof for better type checking if possible at runtime
const McpClientListSchema = z.array(z.instanceof(Client)).describe("List of active MCP Client instances.");

export const MCPContextSchema = z.object({
    clients: McpClientListSchema,
});

export const MCPToolSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.object({
        type: z.literal("object"),
        properties: z.record(z.string(), z.unknown()),
        required: z.array(z.string()),
    }).optional(),
    annotations: z.object({
        title: z.string().optional(),
        readOnlyHint: z.boolean().optional(),
        destructiveHint: z.boolean().optional(),
        idempotentHint: z.boolean().optional(),
        openWorldHint: z.boolean().optional(),
    }).optional(),
});
export const MCPToolCallSchema = MCPToolSchema.omit({
    annotations: true,
});

export type MCPTool = z.infer<typeof MCPToolSchema>;
export type MCPToolCall = z.infer<typeof MCPToolCallSchema>;



export const MCPContextId = "mcp-context";
export const MCPContext = ContextHelper.createContext({
    id: MCPContextId,
    description: "Manages connections to external MCP servers/clients.",
    dataSchema: MCPContextSchema,
    // Initial data with an empty clients array
    initialData: {
        clients: [],
    },
    // Add all MCP tools to the context
    toolListFn: () => [
        AddMCPClientTool,
        ListToolsTool,
        MCPCallTool,
        ListPromptsTool, 
        GetPromptTool,  
        ListResourcesTool,
        // Add RemoveMCPClientTool, GetMCPClientTool when implemented
    ],
    renderPromptFn: (data) => {
        // Simple prompt showing the number of connected clients
        return `The MCP context currently manages ${data.clients.length} client(s). Use client ID (index) 0 to ${data.clients.length - 1} when calling MCP tools.`;
    }
});

export const ADD_MCP_CLIENT_ID = "add_mcp_client";
export const REMOVE_MCP_CLIENT_ID = "remove-mcp-client";
export const GET_MCP_CLIENT_ID = "get-mcp-client";

export const AddMCPClientToolInputSchema = z.object({
    type: z.enum(["sse", "streamableHttp", "stdio"]).describe("The transport type of the MCP client."),
    url: z.string().optional().describe("The URL of the MCP client (required for sse, streamableHttp)."),
    // Add stdio specific args if needed, e.g., command, args
});

export const AddMCPClientTool = createTool({
    id: ADD_MCP_CLIENT_ID,
    name: ADD_MCP_CLIENT_ID,
    description: "Connects a new MCP client instance using the specified transport.",
    inputSchema: AddMCPClientToolInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        clientId: z.number().optional().describe("The ID (index) of the newly added client."),
        error: z.string().optional(),
    }),
    async: true, // Connecting might take time
    execute: async (params: z.infer<typeof AddMCPClientToolInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context) {
            return { success: false, error: "MCP context not found." };
        }

        let transport;
        try {
            switch (params.type) {
                case "sse":
                    if (!params.url) return { success: false, error: "URL required for SSE transport." };
                    transport = new SSEClientTransport(new URL(params.url));
                    break;
                case "streamableHttp":
                     if (!params.url) return { success: false, error: "URL required for StreamableHTTP transport." };
                    transport = new StreamableHTTPClientTransport(new URL(params.url));
                    break;
                case "stdio":
                    // Example stdio setup - adjust command/args as needed
                    transport = new StdioClientTransport({
                        command: "node", // Example command
                        args: [],    // Example args
                        cwd: process.cwd(),
                        env: process.env as Record<string, string>,
                    });
                    break;
                default:
                     return { success: false, error: `Unsupported transport type: ${params.type}` };
            }

            // Use a more descriptive name if possible, maybe based on URL/type?
            const client = new Client(
                { name: `mcp-client-${context.data.clients.length}`, version: "1.0.0" },
                { capabilities: { prompts: {}, resources: {}, tools: {} } } // Define actual capabilities if known
            );
            
            await client.connect(transport);
            context.data.clients.push(client);
            const newClientId = context.data.clients.length - 1;
            console.log(`MCP Client connected via ${params.type}. Assigned ID: ${newClientId}`);
            return { success: true, clientId: newClientId };

        } catch (error: any) {
            console.error(`Error adding MCP client (${params.type}):`, error);
            return { success: false, error: error.message || "Failed to connect MCP client." };
        }
    },
});

export const LIST_TOOLS_ID = "list_mcp_tools";
export const ListToolsToolInputSchema = z.object({
    mcpClientId: z.number().int().nonnegative().describe("The ID (index) of the MCP client to list tools from."),
});

const ListToolId = "list_mcp_tools";

export const ListToolsTool = createTool({
    id: ListToolId,
    name: ListToolId,
    description: "Lists all tools available on a specified MCP client.",
    inputSchema: ListToolsToolInputSchema,
    // Use the refined ToolDetailSchema in the outputSchema
    outputSchema: z.object({
        tools: z.array(MCPToolCallSchema).describe("The list of tools including name, description, and input schema."),
    }),
    async: true, // API call is async
    // Return type annotation uses the refined schema
    execute: async (params: z.infer<typeof ListToolsToolInputSchema>, agent?: IAgent): Promise<{ tools: z.infer<typeof MCPToolCallSchema>[] }> => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context || !context.data?.clients) {
            console.error("MCP context or clients not found in ListToolsTool.");
            return { tools: [] };
        }
        if (params.mcpClientId < 0 || params.mcpClientId >= context.data.clients.length) {
            console.error(`MCP client index ${params.mcpClientId} out of bounds.`);
            return { tools: [] };
        }
        const client = context.data.clients[params.mcpClientId] as Client;
        if (!client) {
            console.error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
            return { tools: [] };
        }
        try {
            const listToolsResult = await client.listTools();
            // Safely map the tools, ensuring inputSchema is an object
            const detailedTools = (listToolsResult?.tools ?? []).map(
                (tool: { name: string; description?: string; inputSchema?: any }) => ({
                    name: tool.name,
                    description: tool.description,
                    inputSchema: (tool.inputSchema && typeof tool.inputSchema === 'object') ? tool.inputSchema : {},
                })
            );
            console.log("ListToolsTool result:", detailedTools[0].inputSchema);
            return { tools: detailedTools };
        } catch (error: any) {
            console.error(`Error listing tools for client index ${params.mcpClientId}:`, error);
            return { tools: [] }; // Return empty list on error, matching schema
        }
    },
});

export const MCP_CALL_TOOL_ID = "mcp_call_tool";

export const MCPCallToolInputSchema = z.object({
    mcpClientId: z.number().describe("The ID (index) of the MCP client."),
    name: z.string().describe("The name of the tool to call."),
    arguments: z.record(z.any()).describe("The arguments to pass to the tool."),
});

export const MCPCallTool = createTool({
    id: MCP_CALL_TOOL_ID,
    name: MCP_CALL_TOOL_ID,
    description: "Calls a specific tool on a specified MCP client with the given arguments.",
    inputSchema: MCPCallToolInputSchema,
    async: true,
    execute: async (params: z.infer<typeof MCPCallToolInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context || !context.data?.clients) {
            console.error("MCP context or clients not found in MCPCallTool.");
            return { result: null, error: "MCP Context not found" };
        }
        if (params.mcpClientId < 0 || params.mcpClientId >= context.data.clients.length) {
            console.error(`MCP client index ${params.mcpClientId} out of bounds.`);
             return { result: null, error: `MCP client index ${params.mcpClientId} out of bounds.` };
        }
        const client = context.data.clients[params.mcpClientId];
        if (!client) {
             console.error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
            return { result: null, error: `MCP client at index ${params.mcpClientId} not found or invalid.` };
        }
        try {
            // Ensure arguments is an object, even if empty
            console.log(`Calling MCP tool '${params.name}' on client ${params.mcpClientId} with args:`, params.arguments);
            const callResult = await client.callTool({ name: params.name, arguments: params.arguments });
            console.log(`MCP tool '${params.name}' result:`, callResult);
            // Extract relevant part of the result if necessary, based on SDK response structure
            // Assuming the primary result might be in 'content' or similar, adjust as needed
            return { result: callResult }; // Return the whole result object for now
        } catch (error: any) {
            console.error(`Error calling MCP tool ${params.name} on client ${params.mcpClientId}:`, error);
            return { result: null, error: error.message || "Failed to call MCP tool." };
        }
    },
});

// --- ListPromptsTool --- 
export const LIST_PROMPTS_ID = "list_mcp_prompts";
export const ListPromptsInputSchema = z.object({
    mcpClientId: z.number().int().nonnegative().describe("The ID (index) of the MCP client."),
    // Add pagination if needed: cursor: z.string().optional(), limit: z.number().optional(),
});
export const McpPromptSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    // Add arguments schema based on observed structure or SDK definition
    arguments: z.array(z.object({ 
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional()
        // Add other potential fields like type if known
    }).passthrough()).optional().describe("Arguments the prompt accepts."), 
});
export const ListPromptsTool = createTool({
    id: LIST_PROMPTS_ID,
    name: LIST_PROMPTS_ID,
    description: "Lists available prompts on a specified MCP client.",
    inputSchema: ListPromptsInputSchema,
    outputSchema: z.object({
        prompts: z.array(McpPromptSchema).describe("List of available prompts with name, description, and arguments.")
    }),
    async: true,
    execute: async (params: z.infer<typeof ListPromptsInputSchema>, agent?: IAgent): Promise<{ prompts: z.infer<typeof McpPromptSchema >[] }> => {
         const context = ContextHelper.findContext(agent!, MCPContextId);
         if (!context || !context.data?.clients) {
            console.error("MCP context or clients not found in ListPromptsTool.");
            return { prompts: [] };
        }
         if (params.mcpClientId < 0 || params.mcpClientId >= context.data.clients.length) {
             console.error(`MCP client index ${params.mcpClientId} out of bounds.`);
             return { prompts: [] };
         }
         const client = context.data.clients[params.mcpClientId];
         if (!client) {
             console.error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
             return { prompts: [] };
         }
        try {
            // Pass any pagination params if implemented in input schema
            const listResult = await client.listPrompts(); 
            // Include arguments in the mapping
            const prompts = (listResult?.prompts ?? []).map(
                (prompt: { name: string; description?: string; arguments?: any[] /* Adjust type if known */ }) => ({
                    name: prompt.name,
                    description: prompt.description,
                    arguments: prompt.arguments ?? [], // Include arguments, default to empty array
                })
            );
            return { prompts };
        } catch (error: any) {
            console.error(`Error listing prompts for client ${params.mcpClientId}:`, error);
            return { prompts: [] };
        }
    },
});

// --- GetPromptTool --- 
export const GET_PROMPT_ID = "get_mcp_prompt";
export const GetPromptInputSchema = z.object({
    mcpClientId: z.number().describe("ID of the MCP server to query"),
    name: z.string().describe("Name of the prompt to get"),
    arguments: z
      .record(z.any())
      .optional()
      .describe("Arguments for the prompt"),
  });
export const GetPromptTool = createTool({
    id: GET_PROMPT_ID,
    name: GET_PROMPT_ID,
    description: "Retrieves the details (description and messages) of a specific prompt.",
    inputSchema: GetPromptInputSchema,
    async: true,
    execute: async (params: z.infer<typeof GetPromptInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
         if (!context || !context.data?.clients) {
            console.error("MCP context or clients not found in GetPromptTool.");
            return { error: "MCP Context not found" };
        }
         if (params.mcpClientId < 0 || params.mcpClientId >= context.data.clients.length) {
             console.error(`MCP client index ${params.mcpClientId} out of bounds.`);
             return { error: `MCP client index ${params.mcpClientId} out of bounds.` };
         }
         const client = context.data.clients[params.mcpClientId];
         if (!client) {
             console.error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
             return { error: `MCP client at index ${params.mcpClientId} not found or invalid.` };
         }
        try {
            const promptResult = await client.getPrompt({ name: params.name, arguments: params.arguments });
            return {
                description: promptResult.description,
                messages: promptResult.messages, // Assuming direct mapping works, adjust if needed
            };
        } catch (error: any) {
             console.error(`Error getting prompt '${params.name}' for client ${params.mcpClientId}:`, error);
            return { error: error.message || `Failed to get prompt '${params.name}'` };
        }
    },
});

// --- ListResourcesTool --- 
export const LIST_RESOURCES_ID = "list_mcp_resources";
export const ListResourcesInputSchema = z.object({
    mcpClientId: z.number().int().nonnegative().describe("The ID (index) of the MCP client."),
    // Add pagination if needed
});
export const ResourceDetailSchema = z.object({
    uri: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
});
export const ListResourcesTool = createTool({
    id: LIST_RESOURCES_ID,
    name: LIST_RESOURCES_ID,
    description: "Lists available resources on a specified MCP client.",
    inputSchema: ListResourcesInputSchema,
    // outputSchema: z.object({
    //     resources: z.array(ResourceDetailSchema).describe("List of available resources.")
    // }),
    async: true,
    execute: async (params: z.infer<typeof ListResourcesInputSchema>, agent?: IAgent)=> {
         const context = ContextHelper.findContext(agent!, MCPContextId);
        
         const client = context.data.clients[params.mcpClientId] as Client;
         if (!client) {
            throw new Error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
         }
        try {
            const listResult = await client.listResources(); 
            return listResult
        } catch (error: any) {
            throw new Error(`Error listing resources for client ${params.mcpClientId}:`, error);
            console.error(`Error listing resources for client ${params.mcpClientId}:`, error);
            return { resources: [] };
        }
    },
});

export const READ_RESOURCE_ID = "read_mcp_resource";
export const ReadResourceInputSchema = z.object({
    mcpClientId: z.number().int().nonnegative().describe("The ID (index) of the MCP client."),
    resourceUri: z.string().describe("The URI of the resource to read."),
});
export const ReadResourceTool = createTool({
    id: READ_RESOURCE_ID,
    name: READ_RESOURCE_ID,
    description: "Reads a specific resource from a specified MCP client.",
    inputSchema: ReadResourceInputSchema,
    async: true,
    execute: async (params: z.infer<typeof ReadResourceInputSchema>, agent?: IAgent)=> {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        const client = context.data.clients[params.mcpClientId] as Client;
        if (!client) {
            throw new Error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
        }
        try {
            const resourceResult = await client.readResource({ uri: params.resourceUri });
            return resourceResult;
        } catch (error: any) {
            throw new Error(`Error reading resource ${params.resourceUri}:`, error);
        }
    },
});
