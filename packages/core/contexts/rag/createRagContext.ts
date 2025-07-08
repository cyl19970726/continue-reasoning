import { z } from "zod";
import { IAgent, IRAGEnabledContext } from "../../interfaces/index.js";
import { createTool, ContextHelper } from "../../utils/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Schema for creating a new RAG-enabled context with an MCP server
 */
export const CreateRAGContextInputSchema = z.object({
    contextId: z.string().describe("The ID for the new RAG-enabled context. Should be unique and descriptive."),
    contextDescription: z.string().describe("A description of what this context is responsible for and its capabilities."),
    mcpServer: z.object({
        name: z.string().describe("The name for the MCP server. Usually the same as the contextId."),
        type: z.enum(["stdio", "sse", "streamableHttp"]).describe("The transport type of the MCP server."),
        // stdio specific
        command: z.string().optional().describe("The command to run for stdio transport."),
        args: z.array(z.string()).optional().describe("The arguments to pass to the command for stdio transport."),
        cwd: z.string().optional().describe("The working directory for the command for stdio transport."),
        env: z.record(z.string()).optional().describe("The environment variables for the command for stdio transport."),
        // sse/http specific
        url: z.string().optional().describe("The URL of the MCP server for SSE or HTTP transport."),
        // General options
        autoActivate: z.boolean().optional().describe("Whether to automatically activate the MCP server after connecting."),
    }).describe("Configuration for the MCP server to associate with this context."),
    initialData: z.object({}).passthrough().optional().describe("Initial data for the context, if any.")
});

/**
 * Tool to create a new RAG-enabled context with an associated MCP server
 */
export const CreateRAGContext = createTool({
    id: "create_rag_context_with_mcp",
    name: "create_rag_context_with_mcp",
    description: "Creates a new RAG-enabled context with an associated MCP server. This allows for creating specialized contexts that can connect to external MCP resources. Useful for extending the agent with domain-specific contexts that manage their own MCP servers.",
    inputSchema: CreateRAGContextInputSchema,
    outputSchema: z.object({
        success: z.boolean(),
        contextId: z.string().optional(),
        error: z.string().optional(),
    }),
    async: true,
    execute: async (params, agent) => {
        if (!agent) {
            return { success: false, error: "Agent instance not available." };
        }
        
        // Check if a context with the same ID already exists
        const existingContext = agent.contextManager.findContextById(params.contextId);
        if (existingContext) {
            return { 
                success: false, 
                error: `A context with ID "${params.contextId}" already exists.` 
            };
        }
        
        try {
            // Create a minimal schema for the context data
            const dataSchema = z.object({
                // Add basic properties that most contexts would need
                history: z.array(z.object({
                    timestamp: z.string(),
                    action: z.string(),
                    details: z.any()
                })).default([]),
                // Allow additional properties
            }).passthrough();
            
            // Create initial data with history
            const initialData = {
                history: [{
                    timestamp: new Date().toISOString(),
                    action: "Context Created",
                    details: "Created with integrated MCP server"
                }],
                ...(params.initialData || {})
            };
            
            // Create the new RAG-enabled context
            const newContext = ContextHelper.createContext({
                id: params.contextId,
                description: params.contextDescription,
                dataSchema: dataSchema,
                initialData: initialData,
                mcpServers: [params.mcpServer],
                // Create an empty toolset that will be auto-populated
                toolSetFn: () => ({
                    name: params.contextId,
                    description: `Tools for ${params.contextId}. Automatically populated from the associated MCP server.`,
                    tools: [],
                    active: true,
                    source: params.contextId
                }),
                // Simple prompt renderer
                renderPromptFn: (data) => {
                    const historyItems = data.history?.length > 0 
                        ? data.history.slice(-5).map((h) => 
                            `• ${h.timestamp} - ${h.action}: ${typeof h.details === 'string' ? h.details : JSON.stringify(h.details)}`)
                        : ["No history yet"];
                    
                    return `
--- ${params.contextId.toUpperCase()} Context ---
${params.contextDescription}

This context is connected to the ${params.mcpServer.name} MCP server that provides specialized tools.

Recent Activity:
${historyItems.join('\n')}

Current Data:
${Object.entries(data)
    .filter(([key]) => key !== 'history')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join('\n')}

To use this context:
1. Check available tools from this context's toolset
2. Use these tools to interact with the ${params.mcpServer.name} capabilities
3. Context data will be automatically updated based on tool interactions
`;
                }
            });
            
            // Add a custom handler for tool calls if needed
            newContext.onToolCall = (toolCallResult) => {
                // Add to history when tools from this context are used
                if (toolCallResult && toolCallResult.name.startsWith(`mcp_`)) {
                    try {
                        const contextData = newContext.getData();
                        const history = contextData.history || [];
                        history.push({
                            timestamp: new Date().toISOString(),
                            action: `Tool Call: ${toolCallResult.name}`,
                            details: toolCallResult.result
                        });
                        
                        newContext.setData({ 
                            ...contextData,
                            history: history
                        });
                    } catch (error) {
                        logger.warn(`Failed to update context history: ${error}`);
                    }
                }
            };
            
            // Register the new context with the agent
            agent.contextManager.registerContext(newContext);
            
            // Log the creation
            logger.info(`Created new RAG-enabled context: ${params.contextId} with MCP server: ${params.mcpServer.name}`);
            
            // The MCP server will be connected during the next call to installAllContexts
            // or we can manually install it here if needed
            let installError = null;
            if (params.mcpServer.autoActivate) {
                try {
                    if (newContext.install) {
                        await newContext.install(agent);
                    } else {
                        logger.warn(`Context ${params.contextId} does not have an install method.`);
                    }
                } catch (error) {
                    installError = error instanceof Error ? error.message : String(error);
                    logger.error(`Failed to install MCP server for context ${params.contextId}: ${installError}`);
                }
            }
            
            return { 
                success: true, 
                contextId: params.contextId,
                ...(installError ? { error: `Context created but MCP server installation failed: ${installError}` } : {})
            };
        } catch (error) {
            logger.error(`Failed to create RAG context with MCP: ${error instanceof Error ? error.message : String(error)}`);
            return { 
                success: false, 
                error: `Failed to create context: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    },
}); 