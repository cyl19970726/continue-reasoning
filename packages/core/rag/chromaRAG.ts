import { 
  IRAG, 
  RAGDocument, 
  RAGResult, 
  QueryOptions, 
  RAGFilter, 
  VectorStoreConfig, 
  EmbeddingConfig,
  IndexConfig,
  ChunkingStrategy,
  RAGMetadata
} from '../interfaces/index.js';
import { ChromaClient, Collection, OpenAIEmbeddingFunction, IncludeEnum } from 'chromadb';
import { randomUUID } from 'crypto';

// 默认配置
const DEFAULT_DIMENSION = 1536; // OpenAI默认嵌入维度
const DEFAULT_METRIC = 'cosine';
const DEFAULT_LIMIT = 10;

/**
 * 基于Chroma DB的RAG实现
 */
export class ChromaRAG implements IRAG {
  id: string;
  name: string;
  description: string;
  
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingFunction: OpenAIEmbeddingFunction | null = null;
  private collectionName: string;
  private dimension: number;
  private chunkingStrategy: ChunkingStrategy;
  
  constructor(
    name: string, 
    description: string,
    embeddingConfig: EmbeddingConfig,
    vectorStoreConfig: VectorStoreConfig,
    indexConfig: IndexConfig,
    chunkingStrategy: ChunkingStrategy
  ) {
    this.id = randomUUID();
    this.name = name;
    this.description = description;
    
    // 初始化Chroma客户端
    this.client = new ChromaClient({
      path: vectorStoreConfig.url || 'http://localhost:8000'
    });
    
    this.collectionName = vectorStoreConfig.collectionName || 'default_collection';
    this.dimension = indexConfig.dimension || DEFAULT_DIMENSION;
    this.chunkingStrategy = chunkingStrategy;
    
    // 初始化OpenAI嵌入函数 - 使用简化的配置，不指定维度
    if (embeddingConfig.apiKey) {
      this.embeddingFunction = new OpenAIEmbeddingFunction({
        openai_api_key: embeddingConfig.apiKey,
        openai_model: embeddingConfig.modelName || 'text-embedding-3-small' // 更新为最新的嵌入模型
      });
    }
  }
  
  /**
   * 初始化RAG系统，创建或连接集合
   */
  async initialize(): Promise<void> {
    try {
      // 尝试获取现有集合
      try {
        this.collection = await this.client.getCollection({
          name: this.collectionName,
          embeddingFunction: this.embeddingFunction || undefined
        });
        console.log(`Connected to existing collection: ${this.collectionName}`);
      } catch (error) {
        // 集合不存在，创建新集合 - 不指定维度参数
        this.collection = await this.client.createCollection({
          name: this.collectionName,
          embeddingFunction: this.embeddingFunction || undefined
          // 移除维度参数，让OpenAI模型自动确定维度
        });
        console.log(`Created new collection: ${this.collectionName}`);
      }
    } catch (error) {
      console.error(`Failed to initialize ChromaRAG: ${error}`);
      throw new Error(`ChromaRAG initialization failed: ${error}`);
    }
  }
  
  /**
   * 将文本分块，基于配置的分块策略
   */
  private chunkText(text: string): string[] {
    if (this.chunkingStrategy.method === 'fixed') {
      const size = this.chunkingStrategy.size || 1000;
      // 简单的固定大小分块
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += size) {
        chunks.push(text.slice(i, i + size));
      }
      return chunks;
    } else if (this.chunkingStrategy.method === 'paragraph') {
      // 基于段落分块
      return text.split(/\n\s*\n/).filter(chunk => chunk.trim().length > 0);
    } else {
      // 默认行为 - 返回整个文本作为一个块
      return [text];
    }
  }
  
  /**
   * 创建超级简化版的元数据，确保所有值都是字符串
   * 解决ChromaDB的422错误
   */
  private createMinimalMetadata(metadata: any): Record<string, string> {
    const result: Record<string, string> = {
      source: 'unknown',
      category: 'unknown'
    };
    
    if (!metadata) return result;
    
    // 处理所有字段，包括动态字段，全部转换为字符串
    for (const key in metadata) {
      if (Object.prototype.hasOwnProperty.call(metadata, key)) {
        const value = metadata[key];
        
        // 跳过函数和undefined
        if (typeof value === 'function' || value === undefined) {
          continue;
        }
        
        // 转换各种类型为字符串
        if (value instanceof Date) {
          result[key] = value.toISOString();
        } else if (Array.isArray(value)) {
          result[key] = value.join(',');
        } else if (typeof value === 'object' && value !== null) {
          // 对象转为JSON字符串
          try {
            result[key] = JSON.stringify(value);
          } catch (e) {
            result[key] = `[Complex Object: ${key}]`;
          }
        } else {
          // 原始值直接转字符串
          result[key] = String(value);
        }
      }
    }
    
    // 确保至少有source和category
    if (!result.source || result.source === 'undefined') result.source = 'unknown';
    if (!result.category || result.category === 'undefined') result.category = 'unknown';
    
    return result;
  }
  
  /**
   * 向RAG系统添加或更新文档
   */
  async upsert(documents: RAGDocument[]): Promise<string[]> {
    if (!this.collection) {
      await this.initialize();
    }
    
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }
    
    const ids: string[] = [];
    const documents_texts: string[] = [];
    const documents_metadatas: Record<string, string>[] = [];
    
    try {
      // 处理每个文档，应用分块策略
      for (const doc of documents) {
        const textChunks = this.chunkText(doc.content);
        
        for (let i = 0; i < textChunks.length; i++) {
          const chunkId = doc.id ? `${doc.id}-chunk-${i}` : randomUUID();
          ids.push(chunkId);
          documents_texts.push(textChunks[i]);
          
          // 创建最小化元数据
          const minimalMetadata = this.createMinimalMetadata(doc.metadata);
          // 添加必要的索引信息作为字符串
          minimalMetadata.originalDocId = doc.id || chunkId;
          minimalMetadata.chunkIndex = String(i);
          minimalMetadata.totalChunks = String(textChunks.length);
          
          documents_metadatas.push(minimalMetadata);
        }
      }
      
      console.log('Upserting with minimal metadatas:', JSON.stringify(documents_metadatas));
      
      // 尝试使用add方法而不是upsert
      try {
        await this.collection.add({
          ids: ids,
          metadatas: documents_metadatas,
          documents: documents_texts
        });
      } catch (addError) {
        console.log('Add failed, falling back to upsert:', addError);
        // 如果add失败，尝试upsert
        await this.collection.upsert({
          ids: ids,
          metadatas: documents_metadatas,
          documents: documents_texts
        });
      }
      
      return ids;
    } catch (error) {
      console.error(`Failed to upsert documents: ${error}`);
      throw error;
    }
  }
  
  /**
   * 从RAG系统删除文档
   */
  async delete(ids: string[]): Promise<boolean> {
    if (!this.collection) {
      await this.initialize();
    }
    
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }
    
    try {
      await this.collection.delete({
        ids
      });
      return true;
    } catch (error) {
      console.error(`Failed to delete documents: ${error}`);
      return false;
    }
  }
  
  // 确保元数据格式有效
  private ensureValidMetadata(metadata: any): RAGMetadata {
    // 用于查询结果的元数据处理，需要返回RAGMetadata类型
    const result: RAGMetadata = {
      source: typeof metadata?.source === 'string' ? metadata.source : '',
      category: typeof metadata?.category === 'string' ? metadata.category : '',
      created: new Date(),  // 默认使用当前日期
    };
    
    // 尝试解析created字段
    if (metadata?.created && typeof metadata.created === 'string') {
      try {
        result.created = new Date(metadata.created);
      } catch (e) {
        console.warn('Could not parse date string:', metadata.created);
      }
    }
    
    // 尝试解析tags字段
    if (metadata?.tags && typeof metadata.tags === 'string') {
      result.tags = metadata.tags.split(',');
    }
    
    return result;
  }
  
  /**
   * 查询RAG系统
   */
  async query(query: string, options?: QueryOptions): Promise<RAGResult[]> {
    if (!this.collection) {
      await this.initialize();
    }
    
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }
    
    const limit = options?.limit || DEFAULT_LIMIT;
    const includeEmbeddings = options?.includeEmbeddings || false;
    
    try {
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: limit,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances, ...(includeEmbeddings ? [IncludeEnum.Embeddings] : [])]
      });
      
      // 转换结果为标准格式
      return (results.ids[0] || []).map((id, index) => {
        return {
          id,
          content: results.documents?.[0]?.[index] || '',
          score: results.distances?.[0]?.[index] || 0,
          metadata: this.ensureValidMetadata(results.metadatas?.[0]?.[index]),
          embedding: includeEmbeddings ? results.embeddings?.[0]?.[index] : undefined
        };
      });
    } catch (error) {
      console.error(`Query failed: ${error}`);
      return [];
    }
  }
  
  /**
   * 使用过滤器查询RAG系统
   */
  async queryWithFilter(query: string, filter: RAGFilter, options?: QueryOptions): Promise<RAGResult[]> {
    if (!this.collection) {
      await this.initialize();
    }
    
    if (!this.collection) {
      throw new Error('Collection not initialized');
    }
    
    const limit = options?.limit || DEFAULT_LIMIT;
    const includeEmbeddings = options?.includeEmbeddings || false;
    
    // 构建Chroma过滤器 - 简化版
    let chromaFilter: Record<string, any> = {};
    
    // 处理元数据过滤器 - 转换为简单字符串键值对
    if (filter.metadata) {
      const metadataFilters: Record<string, string> = {};
      
      // 转换为字符串
      Object.entries(filter.metadata).forEach(([key, value]) => {
        if (value !== undefined) {
          if (value instanceof Date) {
            metadataFilters[key] = value.toISOString();
          } else if (Array.isArray(value)) {
            metadataFilters[key] = value.join(',');
          } else {
            metadataFilters[key] = String(value);
          }
        }
      });
      
      if (Object.keys(metadataFilters).length > 0) {
        chromaFilter = metadataFilters;
      }
    }
    
    // 处理日期范围 - 直接使用ISO字符串
    if (filter.dateRange) {
      chromaFilter.created = {
        $gte: filter.dateRange.start.toISOString(),
        $lte: filter.dateRange.end.toISOString()
      };
    }
    
    try {
      const results = await this.collection.query({
        queryTexts: [query],
        nResults: limit,
        where: chromaFilter,
        include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances, ...(includeEmbeddings ? [IncludeEnum.Embeddings] : [])]
      });
      
      // 转换结果为标准格式
      return (results.ids[0] || []).map((id, index) => {
        return {
          id,
          content: results.documents?.[0]?.[index] || '',
          score: results.distances?.[0]?.[index] || 0,
          metadata: this.ensureValidMetadata(results.metadatas?.[0]?.[index]),
          embedding: includeEmbeddings ? results.embeddings?.[0]?.[index] : undefined
        };
      });
    } catch (error) {
      console.error(`Query with filter failed: ${error}`);
      return [];
    }
  }
} 