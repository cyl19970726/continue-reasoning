import { 
  IRAGBuilder, 
  IRAG, 
  VectorStoreType, 
  VectorStoreConfig, 
  EmbeddingModelType, 
  EmbeddingConfig, 
  IndexConfig, 
  ChunkingStrategy 
} from '../interfaces';
import { ChromaRAG } from './chromaRAG';

/**
 * RAG构建器实现
 * 使用Builder模式创建和配置不同的RAG实例
 */
export class RAGBuilder implements IRAGBuilder {
  private name: string = 'default-rag';
  private description: string = 'Default RAG instance';
  private vectorStoreType: VectorStoreType = 'chroma';
  private vectorStoreConfig: VectorStoreConfig = {
    url: 'http://localhost:8000',
    collectionName: 'default_collection'
  };
  private embeddingModel: EmbeddingModelType = 'openai';
  private embeddingConfig: EmbeddingConfig = {
    modelName: 'text-embedding-ada-002'
  };
  private indexConfig: IndexConfig = { 
    dimension: 1536, 
    metric: 'cosine' 
  };
  private chunkingStrategy: ChunkingStrategy = { 
    method: 'fixed', 
    size: 1000, 
    overlap: 0 
  };

  /**
   * 设置RAG实例名称和描述
   */
  setName(name: string, description?: string): RAGBuilder {
    this.name = name;
    if (description) {
      this.description = description;
    }
    return this;
  }

  /**
   * 设置向量存储类型和配置
   */
  setVectorStore(type: VectorStoreType, config: VectorStoreConfig): RAGBuilder {
    this.vectorStoreType = type;
    this.vectorStoreConfig = { ...this.vectorStoreConfig, ...config };
    return this;
  }

  /**
   * 设置嵌入模型和配置
   */
  setEmbeddingModel(model: EmbeddingModelType, config?: EmbeddingConfig): RAGBuilder {
    this.embeddingModel = model;
    if (config) {
      this.embeddingConfig = { ...this.embeddingConfig, ...config };
    }
    return this;
  }

  /**
   * 设置索引配置
   */
  setIndexConfig(config: IndexConfig): RAGBuilder {
    this.indexConfig = { ...this.indexConfig, ...config };
    return this;
  }

  /**
   * 设置文本分块策略
   */
  setChunkingStrategy(strategy: ChunkingStrategy): RAGBuilder {
    this.chunkingStrategy = { ...this.chunkingStrategy, ...strategy };
    return this;
  }

  /**
   * 构建RAG实例
   */
  build(): IRAG {
    // 根据配置的向量存储类型创建相应的RAG实例
    switch (this.vectorStoreType) {
      case 'chroma':
        return new ChromaRAG(
          this.name,
          this.description,
          this.embeddingConfig,
          this.vectorStoreConfig,
          this.indexConfig,
          this.chunkingStrategy
        );
      // 可以在这里添加其他向量数据库的支持
      // case 'pinecone':
      //   return new PineconeRAG(...);
      // case 'qdrant':
      //   return new QdrantRAG(...);
      default:
        throw new Error(`不支持的向量存储类型: ${this.vectorStoreType}`);
    }
  }
} 