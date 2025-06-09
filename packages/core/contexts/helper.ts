import { z } from "zod";
import { randomUUID } from "crypto";
import { createTool } from "../utils";
import { 
  IAgent, 
  IRAG, 
  RAGDocument, 
  RAGMetadata, 
  ITool,
  QueryOptions,
  RAGResult
} from "../interfaces";

/**
 * 通用状态类型，可以扩展
 */
export type ItemStatus = "pending" | "active" | "inactive" | "resolved" | "rejected";

/**
 * 通用队列管理项接口
 */
export interface ManagedItem {
  id: string;
  priority: number;
  status: ItemStatus;
  [key: string]: any;
}

/**
 * 通用队列管理配置
 */
export interface QueueManagerConfig<T extends ManagedItem> {
  maxActiveItems: number;
  contextId: string;
  ragInstance?: IRAG;
  ragCollectionName?: string;
  prioritySortFn?: (a: T, b: T) => number;
  filterActiveFn?: (item: T) => boolean;
  filterInactiveFn?: (item: T) => boolean;
  getRAGDocument?: (item: T) => RAGDocument;
}

/**
 * 通用队列管理Helper
 * 可以用于管理任何类型的队列，如问题队列、任务队列等
 */
export class ContextManagerHelper<T extends ManagedItem> {
  private config: QueueManagerConfig<T>;

  constructor(config: QueueManagerConfig<T>) {
    this.config = {
      ...config,
      // 默认优先级排序函数：优先级数字越高越优先
      prioritySortFn: config.prioritySortFn || ((a, b) => b.priority - a.priority),
      // 默认活动项过滤函数
      filterActiveFn: config.filterActiveFn || (item => item.status === "active"),
      // 默认非活动项过滤函数
      filterInactiveFn: config.filterInactiveFn || (item => item.status === "inactive"),
      // 默认RAG文档转换
      getRAGDocument: config.getRAGDocument || this.defaultGetRAGDocument
    };
  }

  /**
   * 默认的RAG文档转换函数
   */
  private defaultGetRAGDocument(item: T): RAGDocument {
    const metadata: RAGMetadata = {
      source: "managed-context",
      category: item.status,
      created: new Date(),
      id: item.id,
      priority: String(item.priority)
    };

    return {
      id: item.id,
      content: JSON.stringify(item),
      metadata
    };
  }

  /**
   * 创建通用的Create工具
   */
  createCreateTool<CreateSchema extends z.ZodObject<any>>(
    options: {
      name: string;
      description: string;
      inputSchema: CreateSchema;
      itemBuilder: (params: z.infer<CreateSchema>) => Omit<T, "id" | "status">
    }
  ): ITool<CreateSchema, z.ZodObject<any>, IAgent> {
    return createTool({
      name: options.name,
      description: options.description,
      inputSchema: options.inputSchema,
      outputSchema: z.object({
        success: z.boolean(),
        item: z.any(),
        error: z.string().optional()
      }),
      async: false,
      execute: async (params, agent) => {
        if (!agent) {
          return { success: false, error: "Agent is required" };
        }
        
        try {
          const context = agent.contextManager.findContextById(this.config.contextId);
          if (!context || !context.data) {
            return { success: false, error: `Context ${this.config.contextId} not found` };
          }
          
          // 获取当前所有项目
          const items = context.data.items || [];
          
          // 创建新项目
          const newItem: T = {
            id: randomUUID(),
            status: "pending", // 初始状态为pending
            ...(options.itemBuilder(params) as any)
          };
          
          // 更新context数据
          if (context.setData) {
            context.setData({
              items: [...items, newItem]
            });
          }
          
          // 尝试立即管理队列
          this.manageQueue(agent);
          
          return { 
            success: true, 
            item: newItem 
          };
        } catch (error) {
          console.error(`Error in ${options.name}:`, error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }
    });
  }

  /**
   * 创建通用的Update工具
   */
  createUpdateTool<UpdateSchema extends z.ZodObject<any>>(
    options: {
      name: string;
      description: string;
      inputSchema: UpdateSchema;
      shouldUpdateFn?: (item: T, params: z.infer<UpdateSchema>) => boolean;
    }
  ): ITool<UpdateSchema, z.ZodObject<any>, IAgent> {
    return createTool({
      name: options.name,
      description: options.description,
      inputSchema: options.inputSchema,
      outputSchema: z.object({
        success: z.boolean(),
        item: z.any().optional(),
        error: z.string().optional()
      }),
      async: false,
      execute: async (params, agent) => {
        if (!agent) {
          return { success: false, error: "Agent is required" };
        }
        
        try {
          const context = agent.contextManager.findContextById(this.config.contextId);
          if (!context || !context.data) {
            return { success: false, error: `Context ${this.config.contextId} not found` };
          }
          
          // 获取当前所有项目
          const items: T[] = context.data.items || [];
          
          // 查找要更新的项目
          const itemIndex = items.findIndex(item => item.id === params.id);
          if (itemIndex === -1) {
            return { success: false, error: `Item with ID ${params.id} not found` };
          }
          
          // 检查是否应该更新
          if (options.shouldUpdateFn && !options.shouldUpdateFn(items[itemIndex], params)) {
            return { 
              success: false, 
              error: `Update not allowed for item ${params.id}`,
              item: items[itemIndex]
            };
          }
          
          // 更新项目
          const updatedItem = {
            ...items[itemIndex],
            ...params
          };
          
          // 更新context数据
          items[itemIndex] = updatedItem;
          if (context.setData) {
            context.setData({ items });
          }
          
          return { 
            success: true, 
            item: updatedItem 
          };
        } catch (error) {
          console.error(`Error in ${options.name}:`, error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }
    });
  }

  /**
   * 创建通用的状态变更工具（如解决、拒绝等）
   */
  createStatusChangeTool<StatusSchema extends z.ZodObject<any>>(
    options: {
      name: string;
      description: string;
      inputSchema: StatusSchema;
      newStatus: ItemStatus;
      postStatusChangeFn?: (item: T, params: z.infer<StatusSchema>, agent: IAgent) => Promise<void>;
    }
  ): ITool<StatusSchema, z.ZodObject<any>, IAgent> {
    return createTool({
      name: options.name,
      description: options.description,
      inputSchema: options.inputSchema,
      outputSchema: z.object({
        success: z.boolean(),
        item: z.any().optional(),
        error: z.string().optional()
      }),
      async: false,
      execute: async (params, agent) => {
        if (!agent) {
          return { success: false, error: "Agent is required" };
        }
        
        try {
          const context = agent.contextManager.findContextById(this.config.contextId);
          if (!context || !context.data) {
            return { success: false, error: `Context ${this.config.contextId} not found` };
          }
          
          // 获取当前所有项目
          const items: T[] = context.data.items || [];
          
          // 查找要更新的项目
          const itemIndex = items.findIndex(item => item.id === params.id);
          if (itemIndex === -1) {
            return { success: false, error: `Item with ID ${params.id} not found` };
          }
          
          // 只有active状态的项目可以被解决或拒绝
          if (options.newStatus === "resolved" || options.newStatus === "rejected") {
            if (items[itemIndex].status !== "active") {
              return { 
                success: false, 
                error: `Only active items can be ${options.newStatus}`,
                item: items[itemIndex]
              };
            }
          }
          
          // 更新项目状态
          const updatedItem = {
            ...items[itemIndex],
            ...params,
            status: options.newStatus
          };
          
          // 更新context数据
          items[itemIndex] = updatedItem;
          if (context.setData) {
            context.setData({ items });
          }
          
          // 如果有RAG实例，保存到RAG
          if (this.config.ragInstance && (options.newStatus === "resolved" || options.newStatus === "rejected")) {
            try {
              const ragDoc = this.config.getRAGDocument!(updatedItem);
              await this.config.ragInstance.upsert([ragDoc]);
              console.log(`Item ${updatedItem.id} saved to RAG with status ${options.newStatus}`);
            } catch (error) {
              console.error(`Error saving item ${updatedItem.id} to RAG:`, error);
            }
          }
          
          // 执行状态变更后的回调
          if (options.postStatusChangeFn && agent) {
            await options.postStatusChangeFn(updatedItem, params, agent);
          }
          
          // 管理队列
          await this.manageQueue(agent);
          
          return { 
            success: true, 
            item: updatedItem 
          };
        } catch (error) {
          console.error(`Error in ${options.name}:`, error);
          return { 
            success: false, 
            error: error instanceof Error ? error.message : String(error) 
          };
        }
      }
    });
  }

  /**
   * 创建查询相似项的工具
   */
  createLoadSimilarItemsTool<QuerySchema extends z.ZodObject<any>>(
    options: {
      name: string;
      description: string;
      inputSchema: QuerySchema;
      queryBuilderFn?: (params: z.infer<QuerySchema>) => string;
    }
  ): ITool<QuerySchema, z.ZodObject<any>, IAgent> {
    return createTool({
      name: options.name,
      description: options.description,
      inputSchema: options.inputSchema,
      outputSchema: z.object({
        success: z.boolean(),
        items: z.array(z.any()),
        error: z.string().optional()
      }),
      async: true, // 异步工具
      execute: async (params, agent) => {
        if (!agent) {
          return { success: false, items: [], error: "Agent is required" };
        }
        
        if (!this.config.ragInstance) {
          return { success: false, items: [], error: "RAG instance not configured" };
        }
        
        try {
          // 构建查询
          const query = options.queryBuilderFn 
            ? options.queryBuilderFn(params) 
            : params.query || params.description || '';
          
          // 查询RAG
          const results = await this.config.ragInstance.query(query, { limit: params.limit || 5 });
          
          // 解析结果
          const items = results.map(result => {
            try {
              return JSON.parse(result.content);
            } catch (e) {
              return { 
                id: result.id, 
                content: result.content,
                score: result.score,
                metadata: result.metadata
              };
            }
          });
          
          return { 
            success: true, 
            items 
          };
        } catch (error) {
          console.error(`Error in ${options.name}:`, error);
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
   * 管理队列
   * 将pending项转为active，如果active满了，转为inactive
   * 当active有空位，将inactive中优先级最高的转为active
   */
  async manageQueue(agent: IAgent): Promise<void> {
    const context = agent.contextManager.findContextById(this.config.contextId);
    if (!context || !context.data) {
      console.error(`Context ${this.config.contextId} not found`);
      return;
    }
    
    // 获取当前所有项目
    const items: T[] = context.data.items || [];
    if (!items.length) return; // 没有项目，不需要管理
    
    // 区分不同状态的项目
    const pendingItems = items.filter(item => item.status === "pending");
    const activeItems = items.filter(this.config.filterActiveFn!);
    const inactiveItems = items.filter(this.config.filterInactiveFn!);
    
    // 需要更新的项目
    const itemsToUpdate: T[] = [];
    
    // 处理pending项目
    if (pendingItems.length > 0) {
      // 按优先级排序
      pendingItems.sort(this.config.prioritySortFn!);
      
      // 计算可以转为active的项目数量
      const availableSlots = Math.max(0, this.config.maxActiveItems - activeItems.length);
      
      // 转换pending项目为active或inactive
      for (const item of pendingItems) {
        if (itemsToUpdate.length < availableSlots) {
          // 转为active
          item.status = "active";
        } else {
          // 转为inactive
          item.status = "inactive";
        }
        itemsToUpdate.push(item);
      }
    }
    
    // 如果active有空位，从inactive中提升
    if (activeItems.length < this.config.maxActiveItems && inactiveItems.length > 0) {
      // 按优先级排序
      inactiveItems.sort(this.config.prioritySortFn!);
      
      // 计算可以提升的项目数量
      const availableSlots = Math.max(0, this.config.maxActiveItems - activeItems.length - itemsToUpdate.filter(i => i.status === "active").length);
      
      // 提升inactive项目为active
      for (let i = 0; i < Math.min(availableSlots, inactiveItems.length); i++) {
        inactiveItems[i].status = "active";
        itemsToUpdate.push(inactiveItems[i]);
      }
    }
    
    // 更新context数据
    if (itemsToUpdate.length > 0) {
      // 创建新的items数组，保留未更新的项目
      const updatedItems = items.map(item => {
        const updated = itemsToUpdate.find(i => i.id === item.id);
        return updated || item;
      });
      
      if (context.setData) {
        context.setData({ items: updatedItems });
      }
    }
  }
} 