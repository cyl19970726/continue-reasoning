// 导出RAG相关类和接口
export * from './chromaRAG.js';
export * from './ragBuilder.js';

// 创建包装函数，用于快速创建常用RAG实例
import { RAGBuilder } from './ragBuilder.js';
import { IRAGBuilder, IRAG, VectorStoreType, EmbeddingModelType } from '../interfaces/index.js';

/**
 * 创建基于Chroma的RAG实例的快速方法
 * @param name RAG实例名称
 * @param description RAG实例描述
 * @param collectionName Chroma集合名称
 * @param apiKey OpenAI API密钥（用于嵌入）
 * @param url Chroma服务器URL
 */
export function createChromaRAG(
  name: string,
  description: string,
  collectionName: string,
  apiKey: string,
  url: string = 'http://localhost:8000'
): IRAG {
  return new RAGBuilder()
    .setName(name, description)
    .setVectorStore('chroma', {
      collectionName,
      url
    })
    .setEmbeddingModel('openai', {
      apiKey,
      modelName: 'text-embedding-ada-002'
    })
    .build();
}

/**
 * 创建预配置的RAG Builder以便自定义
 * @param type 向量存储类型
 * @param name RAG实例名称
 * @param description RAG实例描述
 */
export function createRAGBuilder(
  type: VectorStoreType = 'chroma',
  name: string = 'default-rag',
  description: string = 'Default RAG instance'
): IRAGBuilder {
  return new RAGBuilder()
    .setName(name, description)
    .setVectorStore(type, {});
} 