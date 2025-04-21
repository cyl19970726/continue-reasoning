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
    toolListFn: () => ITool<any,any,any>[];
  }): IContext<T> {
    const { id, description, dataSchema, initialData = {}, renderPromptFn, toolListFn } = options;
    
    const context: IContext<T> = {
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
};
