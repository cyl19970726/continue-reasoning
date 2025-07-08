import { createTool, ContextHelper } from "../utils/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { any, z } from "zod";
import { IAgent, ToolSet, IRAGEnabledContext } from "../interfaces/index.js";
import { zodToJson, jsonToZodStrict, jsonToZodNostrict } from "../utils/jsonHelper.js";
import { logger } from "../utils/logger.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { CreateRAGContext } from "./rag/createRagContext.js";

// 使用promisify包装exec
const execAsync = promisify(exec);

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
    description: "Manages connections to external Model Context Protocol (MCP) servers and clients. Enables the agent to discover, integrate, and control external toolsets, prompts, and resources from remote MCP endpoints for extended capabilities.",
    dataSchema: MCPContextSchema,
    // Initial data with an empty clients array
    initialData: {
        clients: [],
    },
    // Add all MCP tools to the context
    toolSetFn: () => ({
        name: "MCPTools",
        description: "This tool set is for managing and connecting to external MCP servers/clients, including tools for adding, removing, and listing MCP clients, as well as listing and reading their tools and resources. Use this set to integrate and control external model context protocol (MCP) endpoints.",
        tools: [
            AddStdioMcpServer,
            AddSseOrHttpMcpServer,
            ListToolsTool, 
            ListPromptsTool, 
            ListResourcesTool,
            RemoveMcpServer,
            ReadResourceTool,
            CreateRAGContext
        ],
        active: true,
        source: "mcp-context"
    }),
    renderPromptFn: (data) => {
        // Get connected clients count
        const clientCount = data.clients.length;
        
        return `
--- MCP (Model Context Protocol) Integration Context ---
Connected Endpoints: ${clientCount} MCP client${clientCount !== 1 ? 's' : ''}

${clientCount > 0 ? `Current Connections:
${data.clients.map((_, index) => `• Client #${index}: Connected MCP endpoint`).join('\n')}` : 
'No MCP clients connected. Use add_stdio_mcp_server or add_sse_or_http_mcp_client to connect to external capabilities.'}

Available Operations:
1. Connect to MCP servers (add_stdio_mcp_server, add_sse_or_http_mcp_client)
2. List available tools (list_mcp_tools), prompts (list_mcp_prompts), and resources (list_mcp_resources)
3. Read specific resources (read_mcp_resource)
4. Remove connections when no longer needed (remove-mcp-client)

Usage Guidelines:
• When calling MCP tools, always specify the client ID (0 to ${Math.max(0, clientCount - 1)})
• External tools become available AFTER connecting to an MCP server
• Check tool availability with list_mcp_tools before attempting to use external tools
• External tools are dynamically registered and have names prefixed with "mcp_[clientId]_"

${clientCount > 0 ? 'IMPORTANT: External MCP tools may have different capabilities, limitations, and usage patterns. Always review tool descriptions before use.' : ''}
`;
    }
});

export const ADD_MCP_CLIENT_ID = "add_mcp_client";
export const REMOVE_MCP_CLIENT_ID = "remove-mcp-client";
export const GET_MCP_CLIENT_ID = "get-mcp-client";
// 专门用于 stdio 的 schema
export const AddStdioMcpServerInputSchema = z.object({
    name: z.string().describe("The name for this MCP server. Will be used as the toolset name."),
    command: z.string().describe("The command to run for stdio transport."),
    args: z.array(z.string()).describe("The arguments to pass to the command for stdio transport."),
    cwd: z.string().optional().describe("The working directory for the command for stdio transport."),
    // Using object({}).passthrough() instead of record for OpenAI function calling compatibility
    env: z.object({}).passthrough().optional().describe("The environment variables for the command for stdio transport."),
});

export const generateMcpToolId = (serverId: number, toolName: string) => {
    return `mcp_${serverId}_${toolName}`;
}

export const getServerIdTools = (agent: IAgent, serverId: number) => {
    // Find the toolset corresponding to this serverId
    const toolSetName = `MCPServer_${serverId}`;
    const toolSet = agent.listToolSets().find(ts => ts.name === toolSetName);
    
    // Return the tools in this toolset
    return toolSet ? toolSet.tools : [];
}

export const removeServerIdTools = (agent: IAgent, serverId: number) => {
    // Find the toolset corresponding to this serverId
    const toolSetName = `MCPServer_${serverId}`;
    
    // Find the index of the toolset in toolSets
    const index = agent.toolSets.findIndex(ts => ts.name === toolSetName);
    
    // If the toolset is found, remove it from toolSets
    if (index !== -1) {
        // First deactivate the toolset
        agent.deactivateToolSets([toolSetName]);
        // Then remove it from the list
        agent.toolSets.splice(index, 1);
    }
}

// 获取npx的完整路径
async function findNpxPath(): Promise<string> {
    try {
        // 尝试找到npx的路径
        const { stdout } = await execAsync('which npx || where npx 2>/dev/null || echo npx');
        const npxPath = stdout.trim();
        
        logger.info(`Found npx at: ${npxPath}`);
        return npxPath;
    } catch (error) {
        logger.warn(`Failed to find npx path, falling back to 'npx': ${error}`);
        return 'npx';  // 如果找不到就使用默认值
    }
}

// --- Dynamic registration of MCP tools helper function ---
function registerMcpToolsForClient(client: Client, serverId: number, agent: IAgent, context: any, toolsetName?: string) {
    if (!client || !client.listTools) return [];

    // Create toolset for this mcp server
    const mcpToolSet: ToolSet = {
        name: toolsetName || `MCPServer_${serverId}`,
        description: `Collection of tools provided by MCP server ${toolsetName || `#${serverId}`}. These tools are dynamically discovered from the external MCP endpoint and provide extended capabilities such as specialized APIs, integrations, and domain-specific functions.`,
        tools: [],
        active: true,
        source: "mcp"
    }

    return client.listTools().then((listToolsResult: any) => {
        const tools = listToolsResult?.tools ?? [];
        const toolIds: string[] = [];
        
        // Categorize tools for more accurate description
        const toolCategories: {[key: string]: string[]} = {};

        for (const tool of tools) {
            // Only support inputSchema that is an object and has properties
            if (!tool.inputSchema || typeof tool.inputSchema !== 'object' || !tool.inputSchema.properties) continue;
            
            // Check for 'any' type or other suspicious schema types that might cause OpenAI API issues
            try {
                // Check if the schema or any of its properties use 'any' type 
                const schemaStr = JSON.stringify(tool.inputSchema);
                if (schemaStr.includes('"type":"any"') || schemaStr.includes('"type": "any"')) {
                    logger.warn(`MCP Tool registration warning: Tool "${tool.name}" from server ${serverId} has parameters with 'any' type which may cause OpenAI API errors. This tool might not work properly.`);
                    // Skip this tool since it will likely cause API errors
                    continue;
                }
                
                // Also check for missing type definitions
                const properties = tool.inputSchema.properties;
                let hasInvalidProperty = false;
                for (const propName in properties) {
                    const prop = properties[propName];
                    if (!prop.type) {
                        logger.warn(`MCP Tool registration warning: Tool "${tool.name}" property "${propName}" is missing type definition`);
                        hasInvalidProperty = true;
                    }
                }
                
                if (hasInvalidProperty) {
                    logger.warn(`Skipping tool "${tool.name}" due to invalid property definitions`);
                    continue;
                }
            } catch (e) {
                logger.warn(`Error checking schema for tool "${tool.name}":`, e);
            }
            
            // Normalize tool name: replace "-" with "_"
            const normalizedToolName = tool.name.replace(/-/g, '_');

            // Try to extract category from tool name
            const category = normalizedToolName.split('_')[0] || 'general';
            if (!toolCategories[category]) {
                toolCategories[category] = [];
            }
            toolCategories[category].push(normalizedToolName);

            // Ensure inputSchema meets strict mode requirements
            const strictSchema = {
                ...tool.inputSchema,
                required: Object.keys(tool.inputSchema.properties),
                additionalProperties: false
            };
            
            // Convert JSON Schema to a strict Zod object schema for tool inputs
            const inputSchema = jsonToZodNostrict(strictSchema) as z.ZodObject<any>;
            const localToolId = generateMcpToolId(serverId, normalizedToolName);
            
            // Check if the tool already exists using active tools
            const activeTools = agent.listToolSets()
                .filter(ts => ts.active)
                .flatMap(ts => ts.tools);
                
            if (activeTools.some(t => t.id === localToolId)) continue;
            
            const localTool = createTool({
                id: localToolId,
                name: normalizedToolName,  // Use normalized name
                description: tool.description || `${normalizedToolName} tool from MCP server #${serverId}`,
                inputSchema,
                async: true,
                execute: async (params) => {
                    // Note: Use the original tool name when calling
                    try {
                        const result = await client.callTool({ name: tool.name, arguments: inputSchema.parse(params) });
                        return {
                            success: true,
                            result: result
                        };
                    } catch (error) {
                        return {
                            success: false,
                            error: error instanceof Error ? error.message : String(error)
                        };
                    }
                }
            });
            
            // Add tool to toolSet instead of directly to agent.tool
            mcpToolSet.tools.push(localTool);
            toolIds.push(localToolId);
        }
        
        // Enhance ToolSet description based on discovered tool categories
        if (Object.keys(toolCategories).length > 0) {
            const categoryDescriptions = Object.entries(toolCategories)
                .map(([category, tools]) => 
                    `${category} tools (${tools.length}): ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}`
                )
                .join('; ');
                
            mcpToolSet.description = `Collection of tools from MCP server #${serverId}. Includes ${tools.length} tools across ${Object.keys(toolCategories).length} categories. ${categoryDescriptions}`;
        }
        
        // Add the entire toolSet to the agent
        if (mcpToolSet.tools.length > 0) {
            // Add to agent's toolSets list
            agent.toolSets.push(mcpToolSet);
            // Activate the tool set
            agent.activateToolSets([mcpToolSet.name]);
            
            // NEW: Check if there's a corresponding context with the same name as the toolset
            // This allows for automatic association between MCP servers and contexts
            const associatedContextId = toolsetName;
            if (associatedContextId) {
                const associatedContext = agent.contextManager.findContextById(associatedContextId);
                if (associatedContext) {
                    logger.info(`Found matching context for MCP server: ${associatedContextId}`);
                    
                    // If the context has a toolSet method that returns an empty tools array,
                    // we can auto-populate it with the MCP server's tools
                    const existingToolSet = associatedContext.toolSet?.();
                    if (existingToolSet) {
                        try {
                            // Clone the tools array to avoid reference issues
                            const toolsToAdd = [...mcpToolSet.tools];
                            
                            // Check if existingToolSet is an array or a single ToolSet
                            if (Array.isArray(existingToolSet)) {
                                // Handle array of ToolSets case
                                logger.warn(`Context ${associatedContextId} returns multiple tool sets, cannot auto-populate tools`);
                            } else if (existingToolSet.tools && existingToolSet.tools.length === 0) {
                                // Find the actual toolSet in agent's toolSets that matches the context ID
                                const contextToolSet = agent.toolSets.find(ts => ts.name === associatedContextId);
                                if (contextToolSet) {
                                    // Add the MCP tools to the context's toolset
                                    contextToolSet.tools = toolsToAdd;
                                    logger.info(`Auto-populated ${toolsToAdd.length} tools from MCP server into ${associatedContextId} context`);
                                }
                            }
                        } catch (e) {
                            logger.error(`Error auto-populating tools for context ${associatedContextId}:`, e);
                        }
                    }
                }
            }
        }
        
        // Record toolIds to client object for potential later cleanup
        context.data.clients[serverId]._mcpToolIds = toolIds;
        return toolIds;
    });
}

// --- 修改 AddStdioMcpServer ---
export const AddStdioMcpServer = createTool({
    id: "add_stdio_mcp_server",
    name: "add_stdio_mcp_server",
    description: "Connect to an MCP server using stdio transport. This creates a direct pipe to an external process that provides additional capabilities through the Model Context Protocol. Use this for local processes or scripts that implement MCP.",
    inputSchema: AddStdioMcpServerInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        serverId: z.number().optional().describe("The ID (index) of the newly added client."),
        toolCount: z.number().optional().describe("Number of tools discovered from this MCP server."),
        categories: z.array(z.string()).optional().describe("Categories of tools discovered."),
        error: z.string().optional(),
    }),
    async: false,
    execute: async (params, agent) => {
        if (!agent) {
            return { success: false, error: "Agent instance not available." };
        }
        
        const context = agent.contextManager.findContextById(MCPContextId);
        if (!context) {
            return { success: false, error: "MCP context not found." };
        }
        
        try {
            // 获取npx的完整路径
            const command = params.command;
            let resolvedCommand = command;
            
            // 如果是npx命令，尝试获取完整路径
            if (command === 'npx') {
                resolvedCommand = await findNpxPath();
                logger.info(`Using npx at: ${resolvedCommand}`);
            }
            
            // 使用提供的cwd或默认的当前工作目录
            const workingDir = params.cwd ?? process.cwd();
            logger.info(`Starting MCP server with command: ${resolvedCommand} ${params.args.join(' ')}`);
            logger.info(`Working directory: ${workingDir}`);
            logger.info(`Environment variables: ${JSON.stringify(params.env)}`);
            
            // 创建环境变量对象，确保包含系统PATH
            const env = {
                ...process.env,  // 包含当前进程的所有环境变量
                ...params.env,   // 添加用户指定的环境变量
                PATH: `${process.env.PATH}:${path.join(os.homedir(), '.npm/bin')}:/usr/local/bin:/usr/bin:/bin`  // 扩展PATH
            };
            
            // 使用原始参数，不添加start命令
            const finalArgs = params.args ?? [];
            
            const transport = new StdioClientTransport({
                command: resolvedCommand,
                args: finalArgs,
                cwd: workingDir,
                env: env as Record<string, string>,
            });
            
            const client = new Client(
                { name: `mcp-client-${context.data.clients.length}`, version: "1.0.0" },
                { capabilities: { prompts: {}, resources: {}, tools: {} } }
            );
            
            logger.info(`Connecting to MCP client using args: ${finalArgs.join(' ')}...`);
            await client.connect(transport);
            logger.info(`Successfully connected to MCP client.`);
            
            context.data.clients.push(client);
            const newClientId = context.data.clients.length - 1;
            
            // Dynamic registration of MCP tools - using custom name if provided
            logger.info(`Registering tools for MCP client ${params.name} (ID: ${newClientId})...`);
            const toolIds = await registerMcpToolsForClient(client, newClientId, agent, context, params.name);
            logger.info(`Added ${toolIds.length} tools for ${params.name}`);
            
            // Get tool category information to return more detailed results
            const categories = new Set<string>();
            if (toolIds.length > 0) {
                toolIds.forEach(id => {
                    const category = id.split('_')[2] || 'general'; // mcp_serverId_category_name format
                    categories.add(category);
                });
            }
            
            return { 
                success: true, 
                serverId: newClientId, 
                toolCount: toolIds.length,
                categories: Array.from(categories)
            };
        } catch (error: any) {
            logger.error(`Failed to connect MCP client: ${error.message}`);
            if (error.stderr) {
                logger.error(`stderr: ${error.stderr}`);
            }
            return { 
                success: false, 
                error: error.message || "Failed to connect MCP client." 
            };
        }
    },
});

// sse/http 专用
export const AddSseOrHttpMcpServerInputSchema = z.object({
    name: z.string().describe("The name for this MCP server. Will be used as the toolset name."),
    type: z.enum(["sse", "streamableHttp"]).describe("The transport type of the MCP client."),
    url: z.string().describe("The URL of the MCP client."),
});

// --- 修改 AddSseOrHttpMcpServer ---
export const AddSseOrHttpMcpServer = createTool({
    id: "add_sse_or_http_mcp_client",
    name: "add_sse_or_http_mcp_client",
    description: "Connect to an MCP server using SSE (Server-Sent Events) or StreamableHTTP transport. Use this for remote web services that provide MCP capabilities, such as specialized APIs or domain-specific tools.",
    inputSchema: AddSseOrHttpMcpServerInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        serverId: z.number().optional().describe("The ID (index) of the newly added client."),
        toolCount: z.number().optional().describe("Number of tools discovered from this MCP server."),
        categories: z.array(z.string()).optional().describe("Categories of tools discovered."),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params, agent) => {
        if (!agent) {
            return { success: false, error: "Agent instance not available." };
        }
        
        const context = agent.contextManager.findContextById(MCPContextId);
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
            
            // Dynamic registration of MCP tools - using custom name if provided
            const toolIds = await registerMcpToolsForClient(client, newClientId, agent, context, params.name);
            console.log(`Added ${toolIds.length} tools for ${params.name}`);
            
            // Get tool category information to return more detailed results
            const categories = new Set<string>();
            if (toolIds.length > 0) {
                toolIds.forEach(id => {
                    const category = id.split('_')[2] || 'general'; // mcp_serverId_category_name format
                    categories.add(category);
                });
            }
            
            return { 
                success: true, 
                serverId: newClientId,
                toolCount: toolIds.length,
                categories: Array.from(categories)
            };
        } catch (error: any) {
            return { 
                success: false, 
                error: error.message || "Failed to connect MCP client." 
            };
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
        success: z.boolean(),
        tools: z.array(MCPToolCallSchema).describe("The list of tools including name, description, and input schema."),
        error: z.string().optional(),
    }),
    async: true, // API call is async
    // Return type annotation uses the refined schema
    execute: async (params: z.infer<typeof ListToolsToolInputSchema>, agent?: IAgent) => {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        if (!context || !context.data?.clients) {
            console.error("MCP context or clients not found in ListToolsTool.");
            return { success: false, tools: [], error: "MCP context or clients not found" };
        }
        if (params.mcpClientId < 0 || params.mcpClientId >= context.data.clients.length) {
            console.error(`MCP client index ${params.mcpClientId} out of bounds.`);
            return { success: false, tools: [], error: `MCP client index ${params.mcpClientId} out of bounds` };
        }
        const client = context.data.clients[params.mcpClientId] as Client;
        if (!client) {
            console.error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
            return { success: false, tools: [], error: `MCP client at index ${params.mcpClientId} not found or invalid` };
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
            console.log("ListToolsTool result:", detailedTools[0]?.inputSchema);
            return { success: true, tools: detailedTools };
        } catch (error: any) {
            console.error(`Error listing tools for client index ${params.mcpClientId}:`, error);
            return { success: false, tools: [], error: error.message || "Error listing tools" };
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
        success: z.boolean(),
        prompts: z.array(McpPromptSchema).describe("List of available prompts with name, description, and arguments."),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params: z.infer<typeof ListPromptsInputSchema>, agent?: IAgent) => {
         const context = ContextHelper.findContext(agent!, MCPContextId);
         if (!context || !context.data?.clients) {
            console.error("MCP context or clients not found in ListPromptsTool.");
            return { success: false, prompts: [], error: "MCP context or clients not found" };
        }
         if (params.mcpClientId < 0 || params.mcpClientId >= context.data.clients.length) {
             console.error(`MCP client index ${params.mcpClientId} out of bounds.`);
             return { success: false, prompts: [], error: `MCP client index ${params.mcpClientId} out of bounds` };
         }
         const client = context.data.clients[params.mcpClientId];
         if (!client) {
             console.error(`MCP client at index ${params.mcpClientId} not found or invalid.`);
             return { success: false, prompts: [], error: `MCP client at index ${params.mcpClientId} not found or invalid` };
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
            return { success: true, prompts };
        } catch (error: any) {
            console.error(`Error listing prompts for client ${params.mcpClientId}:`, error);
            return { success: false, prompts: [], error: error.message || "Error listing prompts" };
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
    outputSchema: z.object({
        success: z.boolean(),
        resources: z.array(z.any()),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params: z.infer<typeof ListResourcesInputSchema>, agent?: IAgent)=> {
         const context = ContextHelper.findContext(agent!, MCPContextId);
        
         const client = context.data.clients[params.mcpClientId] as Client;
         if (!client) {
            return { success: false, resources: [], error: `MCP client at index ${params.mcpClientId} not found or invalid` };
         }
        try {
            const listResult = await client.listResources(); 
            return { success: true, resources: listResult.resources || [] };
        } catch (error: any) {
            console.error(`Error listing resources for client ${params.mcpClientId}:`, error);
            return { success: false, resources: [], error: error.message || "Error listing resources" };
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
    outputSchema: z.object({
        success: z.boolean(),
        resource: z.any(),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params: z.infer<typeof ReadResourceInputSchema>, agent?: IAgent)=> {
        const context = ContextHelper.findContext(agent!, MCPContextId);
        const client = context.data.clients[params.mcpClientId] as Client;
        if (!client) {
            return { success: false, resource: null, error: `MCP client at index ${params.mcpClientId} not found or invalid` };
        }
        try {
            const resourceResult = await client.readResource({ uri: params.resourceUri });
            return { success: true, resource: resourceResult };
        } catch (error: any) {
            return { success: false, resource: null, error: error.message || `Error reading resource ${params.resourceUri}` };
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
        removedTools: z.number().optional(),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params, agent) => {
        if (!agent) {
            return { success: false, error: "Agent instance not available." };
        }
        
        const context = agent.contextManager.findContextById(MCPContextId);
        if (!context) {
            return { success: false, error: "MCP context not found." };
        }
        
        const { clientId } = params;
        const client = context.data.clients[clientId];
        if (!client) {
            return { success: false, error: `MCP client at index ${clientId} not found.` };
        }
        
        // Remove the corresponding toolset from agent's toolSets
        const toolSetName = `MCPServer_${clientId}`;
        
        // Get the number of tools in the toolset
        let removedToolCount = 0;
        const toolSet = agent.listToolSets().find(ts => ts.name === toolSetName);
        if (toolSet) {
            removedToolCount = toolSet.tools.length;
            // First deactivate the toolset
            agent.deactivateToolSets([toolSetName]);
            
            // Then remove it from the toolSets list
            const index = agent.toolSets.findIndex(ts => ts.name === toolSetName);
            if (index !== -1) {
                agent.toolSets.splice(index, 1);
            }
        }
        
        // Remove the client
        context.data.clients.splice(clientId, 1);
        
        return { 
            success: true,
            removedTools: removedToolCount
        };
    },
});

