import { createTool, ContextHelper } from "../utils";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { any, z } from "zod";
import { IAgent } from "../interfaces";
import { zodToJson, jsonToZodStrict, jsonToZodNostrict } from "../utils/jsonHelper";

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
        AddStdioMcpServer,
        AddSseOrHttpMcpServer,
        ListToolsTool,
        ListPromptsTool, 
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
// 专门用于 stdio 的 schema
export const AddStdioMcpServerInputSchema = z.object({
    command: z.string().describe("The command to run for stdio transport."),
    args: z.array(z.string()).describe("The arguments to pass to the command for stdio transport."),
    cwd: z.string().describe("The working directory for the command for stdio transport."),
    // Using object({}).passthrough() instead of record for OpenAI function calling compatibility
    env: z.object({}).passthrough().optional().describe("The environment variables for the command for stdio transport."),
});

export const generateMcpToolId = (serverId: number, toolName: string) => {
    return `mcp_${serverId}_${toolName}`;
}

export const getServerIdTools = (agent: IAgent, serverId: number) => {
    return agent.tool.filter(t => t.id?.startsWith(`mcp_${serverId}_`));
}

export const removeServerIdTools = (agent: IAgent, serverId: number) => {
    const tools = getServerIdTools(agent, serverId);
    agent.tool = agent.tool.filter(t => !tools.includes(t));
}

// --- 动态注册 MCP 工具的辅助函数 ---
function registerMcpToolsForClient(client: Client, serverId: number, agent: IAgent, context: any) {
    if (!client || !client.listTools) return [];
    return client.listTools().then((listToolsResult: any) => {
        const tools = listToolsResult?.tools ?? [];
        const toolIds: string[] = [];
        for (const tool of tools) {
            // 只支持 inputSchema 为 object 且有 properties
            if (!tool.inputSchema || typeof tool.inputSchema !== 'object' || !tool.inputSchema.properties) continue;
            
            // 规范化工具名称：将 "-" 替换为 "_"
            const normalizedToolName = tool.name.replace(/-/g, '_');

            // 确保 inputSchema 符合严格模式要求
            const strictSchema = {
                ...tool.inputSchema,
                required: Object.keys(tool.inputSchema.properties),
                additionalProperties: false
            };
            
            // Convert JSON Schema to a strict Zod object schema for tool inputs
            const inputSchema = jsonToZodNostrict(strictSchema) as z.ZodObject<any>;
            const localToolId = generateMcpToolId(serverId, normalizedToolName);
            
            // 避免重复注册
            if (agent.tool.find(t => t.id === localToolId)) continue;
            
            const localTool = createTool({
                id: localToolId,
                name: normalizedToolName,  // 使用规范化后的名称
                description: tool.description || '',
                inputSchema,
                async: true,
                execute: async (params) => {
                    // 注意：调用时使用原始工具名称
                    return await client.callTool({ name: tool.name, arguments: inputSchema.parse(params) });
                }
            });
            agent.tool.push(localTool);
            toolIds.push(localToolId);
        }
        // 记录 toolIds 到 client 对象
        context.data.clients[serverId]._mcpToolIds = toolIds;
        return toolIds;
    });
}

// --- 修改 AddStdioMcpServer ---
export const AddStdioMcpServer = createTool({
    id: "add_stdio_mcp_server",
    name: "add_stdio_mcp_server",
    description: "Connects a new MCP client instance using stdio transport.",
    inputSchema: AddStdioMcpServerInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        serverId: z.number().optional().describe("The ID (index) of the newly added client."),
        error: z.string().optional(),
    }),
    async: false,
    execute: async (params, agent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context) {
            return { success: false, error: "MCP context not found." };
        }
        try {
            const transport = new StdioClientTransport({
                command: params.command,
                args: params.args ?? [],
                cwd: params.cwd ?? process.cwd(),
                env: params.env as Record<string, string> | undefined,
            });
const client = new Client(
                { name: `mcp-client-${context.data.clients.length}`, version: "1.0.0" },
                { capabilities: { prompts: {}, resources: {}, tools: {} } }
            );
            await client.connect(transport);
            context.data.clients.push(client);
            const newClientId = context.data.clients.length - 1;
            // 动态注册 MCP 工具
            let toolIds = await registerMcpToolsForClient(client, newClientId, agent!, context);
            console.log(`Added ${toolIds.length} tools for Agent ${agent!.id} on server ${newClientId}`);
            return { success: true, serverId: newClientId, toolIds };
        } catch (error: any) {
            return { success: false, error: error.message || "Failed to connect MCP client." };
        }
    },
});

// sse/http 专用
export const AddSseOrHttpMcpServerInputSchema = z.object({
    type: z.enum(["sse", "streamableHttp"]).describe("The transport type of the MCP client."),
    url: z.string().describe("The URL of the MCP client."),
});

// --- 修改 AddSseOrHttpMcpServer ---4
export const AddSseOrHttpMcpServer = createTool({
    id: "add_sse_or_http_mcp_client",
    name: "add_sse_or_http_mcp_client",
    description: "Connects a new MCP Server instance using SSE or StreamableHTTP transport.",
    inputSchema: AddSseOrHttpMcpServerInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        serverId: z.number().optional().describe("The ID (index) of the newly added client."),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params, agent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context) {
            return { success: false, error: "MCP context not found." };
        }
        let transport;
        try {
            if (params.type === "sse") {
                transport = new SSEClientTransport(new URL(params.url));
            } else {
                transport = new StreamableHTTPClientTransport(new URL(params.url));
            }
            const client = new Client(
                { name: `mcp-client-${context.data.clients.length}`, version: "1.0.0" },
                { capabilities: { prompts: {}, resources: {}, tools: {} } }
            );
            await client.connect(transport);
            context.data.clients.push(client);
            const newClientId = context.data.clients.length - 1;
            // 动态注册 MCP 工具
            await registerMcpToolsForClient(client, newClientId, agent!, context);
            return { success: true, serverId: newClientId };
        } catch (error: any) {
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

// --- 新增 RemoveMcpServer 工具 ---
export const RemoveMcpServerInputSchema = z.object({
    clientId: z.number().int().nonnegative().describe("The ID (index) of the MCP client to remove."),
});

export const RemoveMcpServer = createTool({
    id: REMOVE_MCP_CLIENT_ID,
    name: REMOVE_MCP_CLIENT_ID,
    description: "Removes an MCP client and all its dynamically registered tools.",
    inputSchema: RemoveMcpServerInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params, agent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context) {
            return { success: false, error: "MCP context not found." };
        }
        const { clientId } = params;
        const client = context.data.clients[clientId];
        if (!client) {
            return { success: false, error: `MCP client at index ${clientId} not found.` };
        }
        // 移除本地 tool
        const toolIds = client._mcpToolIds || [];
        if (Array.isArray(toolIds)) {
            agent!.tool = agent!.tool.filter(t => !toolIds.includes(t.id));
        }
        // 移除 client
        context.data.clients.splice(clientId, 1);
        return { success: true };
    },
});

