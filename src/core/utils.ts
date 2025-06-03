import { z } from "zod";
import { ITool, IAgent, IContext, ToolCallDefinition, IMemoryManager, IRAGEnabledContext, IRAG, RAGResult, QueryOptions, AnyTool, ToolSet } from "./interfaces";
import { randomUUID } from "crypto";
import { logger } from "./utils/logger";
import fs from "fs";
import path from "path";

/** Utility type to preserve type information */
export type Pretty<type> = { [key in keyof type]: type[key] } & unknown;

/**
 * Generic search filter type
 */
export interface SearchFilter {
  [key: string]: string | string[] | boolean | number | undefined;
}

/**
 * Search for matching items from Context data
 * @param items Array of items to search
 * @param query Search query string
 * @param filter Filter conditions object
 * @param options Search options
 * @returns Array of matching items
 */
export function searchContextItems<T extends Record<string, any>>(
  items: T[],
  query?: string,
  filter?: SearchFilter,
  options: { 
    limit?: number;
    searchFields?: string[];
    caseSensitive?: boolean;
  } = {}
): T[] {
  const { 
    limit = 10, 
    searchFields = ['title', 'description', 'content'],
    caseSensitive = false 
  } = options;
  
  if (!items || items.length === 0) {
    return [];
  }

  // Filter items
  let filteredItems = items.filter(item => {
    // Apply query filtering
    if (query && query.trim() !== '') {
      const q = caseSensitive ? query : query.toLowerCase();
      
      // Check if specified fields match the query
      const matchesQuery = searchFields.some(field => {
        if (item[field]) {
          const fieldValue = caseSensitive 
            ? String(item[field]) 
            : String(item[field]).toLowerCase();
          return fieldValue.includes(q);
        }
        return false;
      });
      
      if (!matchesQuery) {
        return false;
      }
    }
    
    // Apply filter conditions
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        // Skip undefined values
        if (value === undefined) continue;
        
        // Check if the item has this property
        if (!(key in item)) {
          return false;
        }
        
        // Handle array type filters (e.g., tags)
        if (Array.isArray(value)) {
          // Expect the item to have an array that matches at least one value from the filter array
          if (
            !Array.isArray(item[key]) || 
            !value.some(v => item[key].includes(v))
          ) {
            return false;
          }
        }
        // Handle exact matching for regular values
        else if (item[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  });
  
  // Limit the number of results
  if (limit > 0 && filteredItems.length > limit) {
    filteredItems = filteredItems.slice(0, limit);
  }
  
  return filteredItems;
}

/**
 * Extracts variable names from a template string
 * @template T - Template string type
 */
export type ExtractTemplateVariables<T extends string> =
  T extends `${infer Start}{{${infer Var}}}${infer Rest}`
    ? Var | ExtractTemplateVariables<Rest>
    : never;

/**
 * Creates a type mapping template variables to string values
 * @template T - Template string type
 */
export type TemplateVariables<T extends string> = Pretty<{
  [K in ExtractTemplateVariables<T>]: string | string[] | object | any;
}>;

/**
 * Renders a template string by replacing variables with provided values
 * @template Template - The template string type containing variables in {{var}} format
 * @param str - The template string to render
 * @param data - Object containing values for template variables
 * @returns The rendered string with variables replaced
 */
export function render<Template extends string>(
    str: Template,
    data: TemplateVariables<Template>
  ) {
    return str
      .trim()
      .replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
        formatValue(data[key as keyof typeof data] ?? "")
      );
  }


  /**
 * Formats a value for template rendering
 * @param value - The value to format
 * @returns Formatted string representation of the value
 */
export function formatValue(value: any): string {
    if (Array.isArray(value)) return value.map((t) => formatValue(t)).join("\n");
    if (typeof value !== "string")
      return JSON.stringify(value, (_, value) => {
        if (typeof value === "bigint") return value.toString();
        return value;
      });
    return value.trim();
  }

/**
 * Create a tool for querying context data
 * @param options Tool configuration options
 * @returns Tool object conforming to ITool interface
 */
export function createContextSearchTool<
  InputSchema extends z.ZodObject<any>,
  ItemType extends Record<string, any>
>(options: {
  name: string;
  description: string;
  contextId: string;
  inputSchema: InputSchema;
  getItems: (context: IContext<any>) => ItemType[];
  searchFields?: string[];
  buildFilter?: (params: z.infer<InputSchema>) => SearchFilter;
  transformResult?: (items: ItemType[]) => any;
}): ITool<InputSchema, any, IAgent> {
  const {
    name,
    description,
    contextId,
    inputSchema,
    getItems,
    searchFields = ['title', 'description', 'content'],
    buildFilter = () => ({}),
    transformResult = (items) => ({ success: true, items })
  } = options;

  return createTool({
    name,
    description,
    inputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      items: z.array(z.any()),
      message: z.string().optional()
    }),
    async: true,
    execute: async (params, agent) => {
      if (!agent) {
        return { success: false, items: [], error: "Agent instance required" };
      }

      try {
        // Get context
        const context = agent.contextManager.findContextById(contextId);
        if (!context) {
          return { success: false, items: [], error: `Context ${contextId} not found` };
        }
        
        // Get all items
        const allItems = getItems(context);
        
        // Build filter
        const filter = buildFilter(params);
        
        // Query string
        const query = params.query || '';
        
        // Use generic search function
        const results = searchContextItems(
          allItems,
          query as string,
          filter,
          { 
            limit: params.limit || 10,
            searchFields,
            caseSensitive: false
          }
        );
        
        // Transform results
        return transformResult(results);
      } catch (error) {
        console.error(`${name} execution error:`, error);
        return {
          success: false,
          items: [],
          message: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });
}

/**
 * Factory function to simplify tool creation with standardized result format
 * @param options Tool configuration options
 * @returns Tool object conforming to ITool interface
 */
export function createTool<
  InputSchema extends z.ZodObject<any>,
  OutputSchema extends z.ZodType<{ success: boolean; error?: string } & Record<string, any>>
>(options: {
  id?: string;
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema?: OutputSchema; // Still optional in options
  async: boolean;
  execute: (
    params: z.infer<InputSchema>,
    agent?: IAgent
    // Return type should correctly infer based on provided/defaulted schema
  ) => Promise<z.infer<OutputSchema>> | z.infer<OutputSchema>; 
}): ITool<InputSchema, OutputSchema, IAgent> {
  // Default outputSchema to an empty object schema if not provided
  const { 
    id = `tool-${randomUUID()}`, 
    name, 
    description, 
    inputSchema, 
    outputSchema = z.object({
      success: z.boolean(),
      error: z.string().optional()
    }) as unknown as OutputSchema,
    async, 
    execute 
  } = options;

  return {
    id,
    type: "function",
    name,
    description,
    params: inputSchema,
    async,
    execute,
    toCallParams: () => ({
      type: "function",
      name,
      description,
      paramSchema: inputSchema,
      async,
      strict: true, 
      resultSchema: outputSchema,
      resultDescription: `Result from ${name} tool`
    })
  };
}

/**
 * Helper functions to simplify Context operations
 */
export const ContextHelper = {
  /**
   * Find Context by ID
   */
  findContext<T extends z.ZodObject<any>>(
    agent: IAgent,
    contextId: string
  ): IContext<T> {
    const context = agent.contextManager.findContextById(contextId);
    if (!context) {
      throw new Error(`Context with ID ${contextId} not found`);
    }
    return context as IContext<T>;
  },

  /**
   * Update Context data
   */
  updateContextData<T extends z.ZodObject<any>>(
    context: IContext<T>,
    data: Partial<z.infer<T>>
  ): void {
    if (context.setData) {
      context.setData(data);
    } else {
      throw new Error(`Context ${context.id} does not support data updates`);
    }
  },

  /**
   * Helper function to create a basic context
   */
  createContext<T extends z.ZodObject<any>>(options: {
    id: string;
    description: string;
    dataSchema: T;
    initialData: Partial<z.infer<T>>;
    promptCtx?: import("./interfaces").PromptCtx;
    renderPromptFn?: (data: z.infer<T>) => string | import("./interfaces").PromptCtx;
    toolSetFn: () => import("./interfaces").ToolSet;
    handleToolCall?: (toolCallResult: any) => void;
    mcpServers?: {
        name: string;
        type?: "stdio" | "sse" | "streamableHttp";
        // stdio specific
        command?: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        // sse/http specific
        url?: string;
        // General options
        autoActivate?: boolean;
    }[];
  }): IRAGEnabledContext<T> {
    const { id, description, dataSchema, initialData, promptCtx, renderPromptFn, toolSetFn, handleToolCall, mcpServers } = options;
    
    const context: IRAGEnabledContext<T> = {
      id,
      description,
      dataSchema,
      
      data: dataSchema.parse(initialData) as z.infer<T>,
      
      // Add promptCtx if provided
      promptCtx,
      
      // Add mcpServers if provided
      mcpServers,
      
      // Add install method for MCP server connections
      async install(agent: import("./interfaces").IAgent): Promise<void> {
        if (!this.mcpServers || this.mcpServers.length === 0) {
          return; // No MCP servers to connect
        }
        
        try {
          // 获取MCP context (仍然需要MCPContext提供的工具)
          const mcpContext = agent.contextManager.findContextById("mcp-context");
          if (!mcpContext) {
            logger.error(`MCP context not found. Cannot connect MCP servers for ${this.id}.`);
            return;
          }
          
          // 找到可用的MCP工具
          const allTools = agent.listToolSets()
            .filter(ts => ts.active)
            .flatMap(ts => ts.tools);
          
          const addStdioMcpServer = allTools.find(t => t.name === 'add_stdio_mcp_server');
          const addSseOrHttpMcpServer = allTools.find(t => t.name === 'add_sse_or_http_mcp_client');
          
          if (!addStdioMcpServer && !addSseOrHttpMcpServer) {
            logger.error(`MCP tools not found. Cannot connect MCP servers for ${this.id}.`);
            return;
          }
          
          // 处理每个MCP服务器配置
          for (const serverConfig of this.mcpServers) {
            try {
              // 确保服务器有name属性
              if (!serverConfig.name) {
                serverConfig.name = this.id; // 默认使用context ID作为服务器名称
              }
              
              // 处理cwd中的${workspaceRoot}变量
              if (serverConfig.cwd && typeof serverConfig.cwd === 'string') {
                if (serverConfig.cwd.includes('${workspaceRoot}')) {
                  serverConfig.cwd = serverConfig.cwd.replace('${workspaceRoot}', process.cwd());
                  logger.info(`Resolved cwd for ${serverConfig.name}: ${serverConfig.cwd}`);
                }
              }
              
              // 确定服务器类型
              let serverType = serverConfig.type;
              if (!serverType) {
                if (serverConfig.url) {
                  serverType = 'sse';
                } else if (serverConfig.command) {
                  serverType = 'stdio';
                } else {
                  logger.error(`Unknown MCP server type for ${serverConfig.name} in context ${this.id}.`);
                  continue;
                }
              }
              
              // 自动解析命令的绝对路径（仅针对stdio类型）
              if (serverType === 'stdio' && serverConfig.command) {
                const command = serverConfig.command;
                
                // 常见需要解析路径的命令
                const commonCommands = ['npx', 'uvx', 'node', 'python', 'python3'];
                
                // 如果是常见命令，尝试获取绝对路径
                if (commonCommands.includes(command)) {
                  try {
                    // 使用which或where命令获取绝对路径
                    const { execSync } = require('child_process');
                    // 使用适用于不同平台的命令组合
                    const resolvedPath = execSync(`which ${command} || where ${command} 2>/dev/null || echo ${command}`)
                      .toString()
                      .trim();
                    
                    if (resolvedPath && resolvedPath !== command) {
                      logger.info(`Resolved command ${command} to absolute path: ${resolvedPath}`);
                      serverConfig.command = resolvedPath;
                    }
                  } catch (error) {
                    logger.warn(`Failed to resolve absolute path for ${command}, using as-is: ${error}`);
                    // 继续使用原始命令
                  }
                }
              }
              
              // 连接服务器
              let result;
              logger.info(`Context ${this.id} connecting to MCP server: ${serverConfig.name}...`);
              
              if (serverType === 'stdio' && addStdioMcpServer) {
                result = await addStdioMcpServer.execute({
                  name: serverConfig.name,
                  command: serverConfig.command,
                  args: serverConfig.args || [],
                  cwd: serverConfig.cwd || process.cwd(),
                  env: serverConfig.env || {}
                }, agent);
              } 
              else if ((serverType === 'sse' || serverType === 'streamableHttp') && addSseOrHttpMcpServer) {
                result = await addSseOrHttpMcpServer.execute({
                  name: serverConfig.name,
                  type: serverType,
                  url: serverConfig.url
                }, agent);
              }
              else {
                logger.error(`Cannot connect MCP server ${serverConfig.name}: Missing tool or unsupported type ${serverType}`);
                continue;
              }
              
              if (result && result.success) {
                logger.info(`Context ${this.id} successfully connected to MCP server: ${serverConfig.name}`);
                logger.info(`Added ${result.toolCount} tools from server in ${result.categories?.length || 0} categories`);
                
                // 处理自动激活设置
                if (serverConfig.autoActivate === false) {
                  agent.deactivateToolSets([this.id]);
                  logger.info(`Deactivated tool set ${this.id} as per configuration`);
                }
              } else {
                logger.error(`Failed to connect MCP server ${serverConfig.name} for context ${this.id}:`, 
                  result?.error || 'Unknown error');
              }
            } catch (error) {
              logger.error(`Error connecting MCP server ${serverConfig.name} for context ${this.id}:`, error);
            }
          }
        } catch (error) {
          logger.error(`Error setting up MCP servers for context ${this.id}:`, error);
        }
      },
      
      setData(data: Partial<z.infer<T>>): void {
        try {
          const mergedData = {
            ...this.data,
            ...data
          };
          this.data = this.dataSchema.parse(mergedData);
        } catch (error) {
          if (error instanceof z.ZodError) {
            console.error(`Invalid data for context ${this.id}:`, error.errors);
          } else {
            console.error(`Error setting data for context ${this.id}:`, error);
          }
          throw error;
        }
      },
      
      getData(): z.infer<T> {
        return this.data;
      },
      
      renderPrompt(): string | import("./interfaces").PromptCtx {
        if (renderPromptFn) {
          return renderPromptFn(this.data);
        }
        return `
          Empty Context
        `;
      },

      toolSet(): import("./interfaces").ToolSet {
        return toolSetFn();
      }
    };
    
    // Only set onToolCall property if handleToolCall exists
    if (handleToolCall) {
      context.onToolCall = handleToolCall;
    }
    
    return context;
  },

  /**
   * Create a context with RAG capabilities
   */
  createRAGContext<T extends z.ZodObject<any>>(options: {
    id: string;
    description: string;
    dataSchema: T;
    initialData?: Partial<z.infer<T>>;
    promptCtx?: import("./interfaces").PromptCtx;
    renderPromptFn?: (data: z.infer<T>) => string | import("./interfaces").PromptCtx;
    toolSetFn?: () => import("./interfaces").ToolSet;
    handleToolCall?: (toolCallResult: any) => void;
    ragConfigs?: Record<string, {
      rag: IRAG,
      queryTemplate?: string,
      resultsFormatter?: (results: RAGResult[]) => string,
      maxResults?: number
    }>;
  }): IRAGEnabledContext<T> {
    const { 
      id, 
      description, 
      dataSchema, 
      initialData = {}, 
      promptCtx,
      renderPromptFn, 
      toolSetFn,
      handleToolCall,
      ragConfigs = {}
    } = options;

    // First create a basic context
    const baseContext = ContextHelper.createContext({
      id,
      description,
      dataSchema,
      initialData,
      promptCtx,
      renderPromptFn,
      toolSetFn: toolSetFn || (() => ({
        name: '',
        description: '',
        tools: [],
        active: false
      })),
      handleToolCall
    });
    
    // Extend to a RAG context
    const ragContext: IRAGEnabledContext<T> = {
      ...baseContext,
      rags: {}, // Initialize empty object
      
      // Override renderPrompt method with async version
      renderPrompt: async function(): Promise<string | import("./interfaces").PromptCtx> {
        // First load RAG-related data
        const ragData = await this.loadRAGForPrompt!();
        
        // If there's a custom renderPromptFn, use it
        let baseResult: string | import("./interfaces").PromptCtx;

        if (renderPromptFn) {
          baseResult = renderPromptFn(this.data);
        } else {
          baseResult = "Empty Context";
        }

        // If the result is a PromptCtx, add RAG data to status
        if (typeof baseResult === 'object' && baseResult !== null && 'workflow' in baseResult) {
          return {
            ...baseResult,
            status: ragData ? `${baseResult.status}\n\n${ragData}` : baseResult.status
          };
        } else {
          // If it's a string, append RAG data
          return ragData ? `${baseResult}\n\n${ragData}` : baseResult;
        }
      },
      
      // Register RAG instance
      registerRAG(ragId: string, rag: IRAG): void {
        if (!this.rags) this.rags = {};
        this.rags[ragId] = rag;
      },
      
      // Query RAG
      async queryContextRAG(ragId: string, query: string, options?: QueryOptions): Promise<RAGResult[]> {
        if (!this.rags) this.rags = {};
        const rag = this.rags[ragId];
        if (!rag) {
          throw new Error(`RAG with ID ${ragId} not found in context ${this.id}`);
        }
        
        // Use template from config for query, if available
        const config = ragConfigs[ragId];
        const maxResults = config?.maxResults || 5;
        
        // Apply query template if available
        let finalQuery = query;
        if (config?.queryTemplate) {
          finalQuery = render(config.queryTemplate, { query, ...this.data } as any);
        }
        
        // Execute query
        const results = await rag.query(finalQuery, { 
          ...options,
          limit: options?.limit || maxResults 
        });
        
        return results;
      },
      
      // Load RAG data for prompt
      async loadRAGForPrompt(): Promise<string> {
        let knowledgeContent = '';
        
        // Initialize rags if undefined
        if (!this.rags) this.rags = {};
        
        // Early return if no RAGs configured
        if (Object.keys(this.rags).length === 0) {
          return '';
        }
        
        // Iterate through all registered RAGs
        for (const [ragId, rag] of Object.entries(this.rags)) {
          const config = ragConfigs[ragId];
          if (!config) continue;
          
          // Use template from config to build query, if available
          let query = `${this.description || id}`;
          if (config.queryTemplate) {
            query = render(config.queryTemplate, this.data as any);
          }
          
          try {
            // Query RAG
            const results = await rag.query(query, { 
              limit: config.maxResults || 3 
            });
            
            // Format results
            if (results.length > 0) {
              if (config.resultsFormatter) {
                knowledgeContent += config.resultsFormatter(results);
              } else {
                // Default formatting
                knowledgeContent += `\n--- ${ragId} Knowledge ---\n`;
                results.forEach((result, i) => {
                  knowledgeContent += `[${i+1}] ${result.content} (Score: ${result.score.toFixed(2)})\n`;
                });
              }
            }
          } catch (error) {
            console.error(`Error querying RAG ${ragId}:`, error);
            // Don't include errors in prompt content to avoid noise
          }
        }
        
        // Only add the header if we have actual content
        if (knowledgeContent.trim()) {
          return '--- Related Knowledge ---\n' + knowledgeContent;
        }
        
        return '';
      }
    };

    // Only set onToolCall property if handleToolCall exists
    if (handleToolCall) {
      ragContext.onToolCall = handleToolCall;
    }

    // Pre-register configured RAG instances
    for (const [ragId, config] of Object.entries(ragConfigs)) {
      ragContext.registerRAG!(ragId, config.rag);
    }
    
    return ragContext;
  }
};