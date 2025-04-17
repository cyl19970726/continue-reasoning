import { z } from "zod";
import { ITool, IAgent, IContext, ToolCallDefinition, IMemoryManager } from "./interfaces";
import { randomUUID } from "crypto";

/** Utility type to preserve type information */
export type Pretty<type> = { [key in keyof type]: type[key] } & unknown;

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

// Helper to map Zod types to JSON schema types
function zodToJsonSchemaType(zodType: z.ZodTypeAny): string {
    if (zodType instanceof z.ZodString) return 'string';
    if (zodType instanceof z.ZodNumber) return 'number';
    if (zodType instanceof z.ZodBoolean) return 'boolean';
    if (zodType instanceof z.ZodObject) return 'object';
    if (zodType instanceof z.ZodArray) return 'array';
    // Add more mappings as needed (e.g., ZodDate -> string with format)
    return 'any'; // Fallback
}

/**
 * 简化工具创建的工厂函数
 * @param options 工具配置选项
 * @returns 符合ITool接口的工具对象
 */
export function createTool<
  InputSchema extends z.ZodObject<any>,
  OutputSchema extends z.ZodObject<any>
>(options: {
  id?: string;
  name: string;
  description: string;
  inputSchema: InputSchema;
  outputSchema: OutputSchema;
  async: boolean;
  execute: (
    params: z.infer<InputSchema>,
    agent?: IAgent
  ) => Promise<z.infer<OutputSchema>> | z.infer<OutputSchema>;
}): ITool<InputSchema, OutputSchema, IAgent> {
  const { id = `tool-${randomUUID()}`, name, description, inputSchema, outputSchema, async, execute } = options;

  return {
    id,
    type: "function",
    name,
    description,
    params: inputSchema,
    async,
    execute,
    toCallParams: () => {
        // Generate JSON Schema for parameters
        const properties: Record<string, { type: string; description?: string }> = {};
        const required: string[] = [];

        for (const key in inputSchema.shape) {
            const fieldSchema = inputSchema.shape[key];
            // Check if the field is optional
            const isOptional = fieldSchema instanceof z.ZodOptional || fieldSchema._def.typeName === 'ZodOptional';
            const underlyingType = isOptional ? (fieldSchema as z.ZodOptional<any>)._def.innerType : fieldSchema;

            properties[key] = {
                type: zodToJsonSchemaType(underlyingType),
                description: underlyingType.description || undefined // Use Zod description
            };

            if (!isOptional) {
                required.push(key);
            }
        }

        // Return the structure expected by the modified ToolCallDefinitionSchema
        return {
            type: "function",
            function: { 
                name,
                description,
                parameters: {
                    type: 'object',
                    properties,
                    // Only include 'required' if it's not empty
                    ...(required.length > 0 && { required })
                }
            },
            async,
            // Include other fields from ToolCallDefinitionSchema if needed
            strict: true, 
            resultSchema: outputSchema,
            resultDescription: `Result from ${name} tool`
        };
    }
  };
}

/**
 * 简化Context操作的辅助函数
 */
export const ContextHelper = {
  /**
   * 根据ID查找Context
   */
  findContext<T extends z.ZodObject<any>, M extends z.ZodObject<any>>(
    agent: IAgent,
    contextId: string
  ): IContext<T, M> {
    const context = agent.contextManager.findContextById(contextId);
    if (!context) {
      throw new Error(`Context with ID ${contextId} not found`);
    }
    return context as IContext<T, M>;
  },

  /**
   * 更新Context数据
   */
  updateContextData<T extends z.ZodObject<any>, M extends z.ZodObject<any>>(
    context: IContext<T, M>,
    data: Partial<z.infer<T>>
  ): void {
    if (context.setData) {
      context.setData(data);
    } else {
      throw new Error(`Context ${context.id} does not support data updates`);
    }
  },

  /**
   * 保存数据到内存
   */
  saveToMemory<T extends z.ZodObject<any>, M extends z.ZodObject<any>>(
    agent: IAgent,
    context: IContext<T, M>,
    data: z.infer<M>
  ): string {
    if (context.saveMemory && context.getContainerId) {
      const containerId = context.getContainerId();
      if (!containerId) {
        throw new Error(`Context ${context.id} did not provide a containerId for saveMemory`);
      }
      return context.saveMemory(agent.memoryManager, data, containerId);
    }
    throw new Error(`Context ${context.id} does not support memory operations or getting containerId`);
  },

  /**
   * 从内存加载数据
   */
  loadFromMemory<T extends z.ZodObject<any>, M extends z.ZodObject<any>>(
    agent: IAgent,
    context: IContext<T, M>,
    memoryId: string
  ): z.infer<M> {
    if (context.loadMemory && context.getContainerId) {
        const containerId = context.getContainerId();
        if (!containerId) {
          throw new Error(`Context ${context.id} did not provide a containerId for loadMemory`);
        }
        return context.loadMemory(agent.memoryManager, memoryId, containerId);
    }
    throw new Error(`Context ${context.id} does not support memory operations or getting containerId`);
  }
};

/**
 * 创建基本上下文的辅助函数
 */
export function createContext<T extends z.ZodObject<any>, M extends z.ZodObject<any>>(options: {
  id: string;
  description: string;
  dataSchema: T;
  memorySchema: M;
  initialData?: Partial<z.infer<T>>;
  saveMemoryFn?: (memoryManager: IMemoryManager, data: z.infer<M>, containerId: string) => string;
  loadMemoryFn?: (memoryManager: IMemoryManager, memoryId: string, containerId: string) => z.infer<M>;
  deleteMemoryFn?: (memoryManager: IMemoryManager, memoryId: string, containerId: string) => void;
  renderPromptFn?: (data: z.infer<T>) => string;
  getContainerIdFn?: () => string;
  toolListFn: () => ITool<any,any,any>[];
}): IContext<T, M> {
  const { id, description, dataSchema, memorySchema, initialData = {}, renderPromptFn, saveMemoryFn, loadMemoryFn, deleteMemoryFn, getContainerIdFn, toolListFn } = options;
  
  const context: IContext<T, M> = {
    id,
    description,
    dataSchema,
    memorySchema,
    
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
    
    getContainerId(): string {
      if (getContainerIdFn) {
        return getContainerIdFn();
      }
      return "";
    },

    saveMemory(memoryManager: IMemoryManager, data: z.infer<M>): string {
      const containerId = this.getContainerId!();
      if (!containerId) {
         console.warn(`Context ${this.id}: Cannot save memory without a containerId.`);
         return '';
      }
      if (saveMemoryFn) {
        return saveMemoryFn(memoryManager, data, containerId);
      } else {
        return memoryManager.saveMemory({
          id: `${this.id}-memory-${Date.now()}`,
          description: `Memory for context ${this.id}`,
          data
        }, containerId);
      }
    },
    
    loadMemory(memoryManager: IMemoryManager, memoryId: string): z.infer<M> {
      const containerId = this.getContainerId!();
      if (!containerId) {
         console.warn(`Context ${this.id}: Cannot load memory without a containerId.`);
         throw new Error(`Context ${this.id}: Cannot load memory without a containerId.`);
      }
      if (loadMemoryFn) {
        return loadMemoryFn(memoryManager, memoryId, containerId);
      } else {
        return memoryManager.loadMemory<z.infer<M>>(memoryId, containerId).data;
      }
    },
    
    deleteMemory(memoryManager: IMemoryManager, memoryId: string): void {
      const containerId = this.getContainerId!();
       if (!containerId) {
         console.warn(`Context ${this.id}: Cannot delete memory without a containerId.`);
         return;
      }
      if (deleteMemoryFn) {
        deleteMemoryFn(memoryManager, memoryId, containerId);
      } else {
        memoryManager.deleteMemory(memoryId, containerId);
      }
    },
    
    renderPrompt(): string {
      if (renderPromptFn) {
        return renderPromptFn(this.data);
      }
      return `
        --- Context-${this.id} ---
        ${JSON.stringify(this.data, null, 2)}
      `;
    },

    toolList(): ITool<any,any,any>[] {
      return toolListFn();
    }
  };
  
  return context;
}
