import { Container, MemoryData } from './base';

// RAG related type definitions
export type VectorStoreType = 'chroma' | 'pinecone' | 'qdrant' | 'weaviate' | 'milvus';
export type EmbeddingModelType = 'openai' | 'cohere' | 'anthropic' | 'google' | 'local';

export interface VectorStoreConfig {
    url?: string;
    apiKey?: string;
    collectionName?: string;
    namespace?: string;
    environment?: string;
    index?: string;
    [key: string]: any;
}

export interface EmbeddingConfig {
    modelName?: string;
    apiKey?: string;
    dimensions?: number;
    batchSize?: number;
    [key: string]: any;
}

export interface IndexConfig {
    dimension: number;
    metric?: 'cosine' | 'euclidean' | 'dot';
    indexType?: string;
    [key: string]: any;
}

export interface ChunkingStrategy {
    method: 'fixed' | 'paragraph' | 'semantic';
    size?: number;
    overlap?: number;
    [key: string]: any;
}

export interface QueryOptions {
    limit?: number;
    similarity_threshold?: number;
    includeEmbeddings?: boolean;
    includeMetadata?: boolean;
}

export interface RAGFilter {
    metadata?: Record<string, any>;
    dateRange?: {start: Date, end: Date};
    custom?: Record<string, any>;
}

export interface RAGMetadata {
    source: string;             // e.g., 'twitter', 'xiaohongshu', 'plan'
    category: string;           // e.g., 'web3', 'marketing', 'reasoning'
    created: Date;
    lastUpdated?: Date;
    userId?: string;            // User-specific data
    tags?: string[];            // Flexible tags
    [key: string]: any;         // Allow additional custom metadata
}

export interface RAGDocument {
    id?: string;                // Optional, system can auto-generate
    content: string;            // Actual text content
    metadata: RAGMetadata;      // Flexible metadata for filtering
    embedding?: number[];       // Optional pre-computed embedding vector
}

export interface RAGResult {
    id: string;
    content: string;
    score: number;
    metadata: RAGMetadata;
    embedding?: number[];
}

// RAG core interface
export interface IRAG {
    id: string;
    name: string;
    description: string;
    
    // Core operations
    query(query: string, options?: QueryOptions): Promise<RAGResult[]>;
    upsert(documents: RAGDocument[]): Promise<string[]>;
    delete(ids: string[]): Promise<boolean>;
    
    // Filtering and metadata operations
    queryWithFilter(query: string, filter: RAGFilter, options?: QueryOptions): Promise<RAGResult[]>;
}

// RAG builder interface
export interface IRAGBuilder {
    setVectorStore(type: VectorStoreType, config: VectorStoreConfig): IRAGBuilder;
    setEmbeddingModel(model: EmbeddingModelType, config?: EmbeddingConfig): IRAGBuilder;
    setIndexConfig(config: IndexConfig): IRAGBuilder;
    setChunkingStrategy(strategy: ChunkingStrategy): IRAGBuilder;
    build(): IRAG;
}

export interface IMemoryManager{
    id: string;
    name: string;
    description: string;
    createContainer<T>(name: string, description: string): Container<T>;
    getContainer<T>(id: string): Container<T>;
    listContainer(): Container<any>[];
    deleteContainer(id: string): void;
    // return the memoryId which used to mark the memoryData
    saveMemory<T>(memory: MemoryData<T>, containerId: string): string;
    loadMemory<T>(id: string, containerId: string): MemoryData<T>;
    deleteMemory(id: string, containerId: string): void;
    renderPrompt(): string;
}

// Enhanced memory manager interface integrating RAG functionality
export interface IEnhancedMemoryManager extends IMemoryManager {
    // RAG specific operations
    registerRAG(rag: IRAG): void;
    getRag(id: string): IRAG;
    queryRag(ragId: string, query: string, options?: QueryOptions): Promise<RAGResult[]>;
    
    // Memory classification
    storeReasoning(plan: any): Promise<string>; // Store plan, problem-solving data
    storeClientData(data: any, source: string, category: string): Promise<string>; // Store client data
    storeWebContent(content: string, url: string, metadata: RAGMetadata): Promise<string>; // Store web content
    storeUserInteraction(interaction: any): Promise<string>; // Store user interaction history
} 