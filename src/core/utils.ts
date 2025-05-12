import { z } from "zod";
import { ITool, IAgent, IContext, ToolCallDefinition, IMemoryManager, IRAGEnabledContext, IRAG, RAGResult, QueryOptions, AnyTool, ToolSet } from "./interfaces";
import { randomUUID } from "crypto";

/** Utility type to preserve type information */
export type Pretty<type> = { [key in keyof type]: type[key] } & unknown;

/**
 * 通用的搜索过滤器类型
 */
export interface SearchFilter {
  [key: string]: string | string[] | boolean | number | undefined;
}

/**
 * 从Context数据中搜索匹配条件的项目
 * @param items 要搜索的项目数组
 * @param query 搜索查询字符串
 * @param filter 过滤条件对象
 * @param options 搜索选项
 * @returns 匹配的项目数组
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

  // 过滤项目
  let filteredItems = items.filter(item => {
    // 应用查询过滤
    if (query && query.trim() !== '') {
      const q = caseSensitive ? query : query.toLowerCase();
      
      // 检查指定字段是否匹配查询
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
    
    // 应用过滤条件
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        // 跳过未定义的值
        if (value === undefined) continue;
        
        // 检查项目是否有这个属性
        if (!(key in item)) {
          return false;
        }
        
        // 处理数组类型的过滤器（例如标签）
        if (Array.isArray(value)) {
          // 期望项目中有一个与过滤器数组中至少一个值匹配的数组
          if (
            !Array.isArray(item[key]) || 
            !value.some(v => item[key].includes(v))
          ) {
            return false;
          }
        }
        // 处理普通值的精确匹配
        else if (item[key] !== value) {
          return false;
        }
      }
    }
    
    return true;
  });
  
  // 限制结果数量
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
 * 创建查询上下文数据的工具
 * @param options 工具配置选项
 * @returns 符合ITool接口的工具对象
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
      error: z.string().optional()
    }),
    async: true,
    execute: async (params, agent) => {
      if (!agent) {
        return { success: false, items: [], error: "需要Agent实例" };
      }

      try {
        // 获取上下文
        const context = agent.contextManager.findContextById(contextId);
        if (!context) {
          return { success: false, items: [], error: `上下文 ${contextId} 未找到` };
        }
        
        // 获取所有项目
        const allItems = getItems(context);
        
        // 构建过滤器
        const filter = buildFilter(params);
        
        // 查询字符串
        const query = params.query || '';
        
        // 使用通用搜索函数
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
        
        // 转换结果
        return transformResult(results);
      } catch (error) {
        console.error(`${name} 执行错误:`, error);
        return {
          success: false,
          items: [],
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });
}

/**
 * 简化工具创建的工厂函数
 * @param options 工具配置选项
 * @returns 符合ITool接口的工具对象
 */
export function createTool<
  InputSchema extends z.ZodObject<any>,
  // Keep constraint ZodObject, but make optional later
  OutputSchema extends z.ZodObject<any> = z.ZodObject<any> // Provide a default empty object schema type
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
    // Default to an empty object schema instance. 
    // Casting needed because TS can't perfectly infer the default satisfies the generic here.
    outputSchema = z.object({}) as OutputSchema, 
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
      resultSchema: outputSchema, // Use the (potentially defaulted) outputSchema
      resultDescription: `Result from ${name} tool`
    })
  };
}

/**
 * 简化Context操作的辅助函数
 */
export const ContextHelper = {
  /**
   * 根据ID查找Context
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
   * 更新Context数据
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
   * 创建基本上下文的辅助函数
   */
  createContext<T extends z.ZodObject<any>>(options: {
    id: string;
    description: string;
    dataSchema: T;
    initialData?: Partial<z.infer<T>>;
    renderPromptFn?: (data: z.infer<T>) => string;
    toolSetFn: () => import("./interfaces").ToolSet;
  }): IRAGEnabledContext<T> {
    const { id, description, dataSchema, initialData = {}, renderPromptFn, toolSetFn } = options;
    
    const context: IRAGEnabledContext<T> = {
      id,
      description,
      dataSchema,
      
      data: dataSchema.parse(initialData) as z.infer<T>,
      
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
          }
          throw error;
        }
      },
      
      getData(): z.infer<T> {
        return this.data;
      },
      
      renderPrompt(): string {
        if (renderPromptFn) {
          return `
            --- Context-${this.id} ---
            Description: ${this.description}
            ${renderPromptFn(this.data)}
          `;
        }
        return `
          --- Context-${this.id} ---
          Description: ${this.description}
          Empty Context
        `;
      },

      toolSet(): import("./interfaces").ToolSet {
        return toolSetFn();
      }
    };
    
    return context;
  },

  /**
   * 创建支持RAG功能的上下文
   */
  createRAGContext<T extends z.ZodObject<any>>(options: {
    id: string;
    description: string;
    dataSchema: T;
    initialData?: Partial<z.infer<T>>;
    renderPromptFn?: (data: z.infer<T>) => string;
    toolSetFn?: () => import("./interfaces").ToolSet;
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
      renderPromptFn, 
      toolSetFn,
      ragConfigs = {}
    } = options;

    // 首先创建基本上下文
    const baseContext = ContextHelper.createContext({
      id,
      description,
      dataSchema,
      initialData,
      renderPromptFn,
      toolSetFn: toolSetFn || (() => ({
        name: '',
        description: '',
        tools: [],
        active: true
      }))
    });
    
    // 扩展为RAG上下文
    const ragContext: IRAGEnabledContext<T> = {
      ...baseContext,
      rags: {}, // Initialize empty object
      
      // 重写renderPrompt方法为异步版本
      renderPrompt: async function(): Promise<string> {
        // 先加载RAG相关数据
        const ragData = await this.loadRAGForPrompt!();
        
        // 如果有自定义renderPromptFn则使用它
        let basePrompt = `
            --- Context-${this.id} ---
            Description: ${this.description}
        `;

        if (renderPromptFn) {
          basePrompt += `\n${renderPromptFn(this.data)}`;
        } else {
          basePrompt += `\nEmpty Context`;
        }
        
        // 组合基本提示和RAG数据
        return `${basePrompt}\n\n${ragData}`;
      },
      
      // 注册RAG实例
      registerRAG(ragId: string, rag: IRAG): void {
        if (!this.rags) this.rags = {};
        this.rags[ragId] = rag;
      },
      
      // 查询RAG
      async queryContextRAG(ragId: string, query: string, options?: QueryOptions): Promise<RAGResult[]> {
        if (!this.rags) this.rags = {};
        const rag = this.rags[ragId];
        if (!rag) {
          throw new Error(`RAG with ID ${ragId} not found in context ${this.id}`);
        }
        
        // 使用配置中的模板进行查询，如果有的话
        const config = ragConfigs[ragId];
        const maxResults = config?.maxResults || 5;
        
        // 应用查询模板如果有的话
        let finalQuery = query;
        if (config?.queryTemplate) {
          finalQuery = render(config.queryTemplate, { query, ...this.data } as any);
        }
        
        // 执行查询
        const results = await rag.query(finalQuery, { 
          ...options,
          limit: options?.limit || maxResults 
        });
        
        return results;
      },
      
      // 加载RAG数据用于提示
      async loadRAGForPrompt(): Promise<string> {
        let ragData = '--- Related Knowledge ---\n';
        
        // 初始化rags如果未定义
        if (!this.rags) this.rags = {};
        
        // 遍历所有已注册的RAG
        for (const [ragId, rag] of Object.entries(this.rags)) {
          const config = ragConfigs[ragId];
          if (!config) continue;
          
          // 使用配置中的模板构建查询，如果有的话
          let query = `${this.description || id}`;
          if (config.queryTemplate) {
            query = render(config.queryTemplate, this.data as any);
          }
          
          try {
            // 查询RAG
            const results = await rag.query(query, { 
              limit: config.maxResults || 3 
            });
            
            // 格式化结果
            if (results.length > 0) {
              if (config.resultsFormatter) {
                ragData += config.resultsFormatter(results);
              } else {
                // 默认格式化
                ragData += `\n--- ${ragId} Knowledge ---\n`;
                results.forEach((result, i) => {
                  ragData += `[${i+1}] ${result.content} (Score: ${result.score.toFixed(2)})\n`;
                });
              }
            }
          } catch (error) {
            console.error(`Error querying RAG ${ragId}:`, error);
            ragData += `\nError querying ${ragId}: ${error}\n`;
          }
        }
        
        return ragData;
      }
    };

    // 预先注册配置的RAG实例
    for (const [ragId, config] of Object.entries(ragConfigs)) {
      ragContext.registerRAG!(ragId, config.rag);
    }
    
    return ragContext;
  }
};