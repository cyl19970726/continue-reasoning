import { 
  IRAGBuilder, 
  IRAG, 
  VectorStoreType, 
  VectorStoreConfig, 
  EmbeddingModelType, 
  EmbeddingConfig, 
  IndexConfig, 
  ChunkingStrategy 
} from '../interfaces/index.js';
import { ChromaRAG } from './chromaRAG.js';

/**
 * RAG builder implementation
 * Uses Builder pattern to create and configure different RAG instances
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
   * Set RAG instance name and description
   */
  setName(name: string, description?: string): RAGBuilder {
    this.name = name;
    if (description) {
      this.description = description;
    }
    return this;
  }

  /**
   * Set vector store type and configuration
   */
  setVectorStore(type: VectorStoreType, config: VectorStoreConfig): RAGBuilder {
    this.vectorStoreType = type;
    this.vectorStoreConfig = { ...this.vectorStoreConfig, ...config };
    return this;
  }

  /**
   * Set embedding model and configuration
   */
  setEmbeddingModel(model: EmbeddingModelType, config?: EmbeddingConfig): RAGBuilder {
    this.embeddingModel = model;
    if (config) {
      this.embeddingConfig = { ...this.embeddingConfig, ...config };
    }
    return this;
  }

  /**
   * Set index configuration
   */
  setIndexConfig(config: IndexConfig): RAGBuilder {
    this.indexConfig = { ...this.indexConfig, ...config };
    return this;
  }

  /**
   * Set text chunking strategy
   */
  setChunkingStrategy(strategy: ChunkingStrategy): RAGBuilder {
    this.chunkingStrategy = { ...this.chunkingStrategy, ...strategy };
    return this;
  }

  /**
   * Build RAG instance
   */
  build(): IRAG {
    // Create corresponding RAG instance based on configured vector store type
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
      // Support for other vector databases can be added here
      // case 'pinecone':
      //   return new PineconeRAG(...);
      // case 'qdrant':
      //   return new QdrantRAG(...);
      default:
        throw new Error(`Unsupported vector store type: ${this.vectorStoreType}`);
    }
  }
} 