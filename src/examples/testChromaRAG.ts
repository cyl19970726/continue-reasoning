import { ChromaRAG } from '../core/rag/chromaRAG';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function testChromaRAG() {
  console.log('开始测试ChromaRAG...');
  
  // 检查API版本
  try {
    const heartbeat = await fetch('http://localhost:8000/api/v2/heartbeat');
    const response = await heartbeat.json();
    console.log('API v2 心跳响应:', response);
    console.log('ChromaDB API v2 正在运行');
  } catch (error) {
    console.error('ChromaDB API检查失败:', error);
    console.error('请确保ChromaDB服务器正在运行，并且支持v2 API');
    process.exit(1);
  }
  
  // 创建ChromaRAG实例
  const chromaRAG = new ChromaRAG(
    'test-rag',
    '测试RAG实例',
    {
      apiKey: process.env.OPENAI_API_KEY || '',
      modelName: 'text-embedding-3-small'
    },
    {
      url: 'http://localhost:8000',
      collectionName: `test_collection_${Date.now()}`
    },
    {
      dimension: 1536
    },
    {
      method: 'fixed',
      size: 1000
    }
  );
  
  let docIds: string[] = [];
  
  try {
    // 初始化
    console.log('初始化ChromaRAG...');
    await chromaRAG.initialize();
    
    // 添加文档
    console.log('添加测试文档...');
    const testDocs = [
      {
        content: '这是一个测试文档，用于测试ChromaRAG的基本功能。',
        metadata: {
          source: 'test',
          category: 'unit-test',
          created: new Date(),
          tags: ['test', 'chroma', 'rag']
        }
      },
      {
        content: '向量数据库可以高效地存储和检索向量数据，非常适合实现RAG系统。',
        metadata: {
          source: 'test',
          category: 'vector-db',
          created: new Date(),
          tags: ['vector-db', 'rag']
        }
      }
    ];
    
    docIds = await chromaRAG.upsert(testDocs);
    console.log('添加的文档ID:', docIds);
    
    // 查询文档
    console.log('\n执行查询...');
    const results = await chromaRAG.query('向量数据库与RAG系统');
    console.log('查询结果:', JSON.stringify(results, null, 2));
    
    // 使用过滤器查询
    console.log('\n执行过滤器查询...');
    const filteredResults = await chromaRAG.queryWithFilter('向量数据库', {
      metadata: {
        category: 'vector-db'
      }
    });
    console.log('过滤器查询结果:', JSON.stringify(filteredResults, null, 2));
    
  } catch (error) {
    console.error('测试过程中发生错误:', error);
  } finally {
    // 清理资源
    if (docIds.length > 0) {
      try {
        // 删除文档
        console.log('\n删除文档...');
        const deleteSuccess = await chromaRAG.delete(docIds);
        console.log('删除成功:', deleteSuccess);
      } catch (error) {
        console.error('删除文档失败:', error);
      }
    }
    
    console.log('\nChromaRAG测试完成!');
  }
}

// 执行测试
testChromaRAG().catch(error => {
  console.error('测试过程中发生未处理的错误:', error);
  process.exit(1);
}); 