import { createChromaRAG } from '../core/rag';
import { RAGEnabledPlanContext } from '../core/contexts/ragEnabledPlanContext';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

async function main() {
  try {
    // 1. 创建RAG实例
    const plansRAG = createChromaRAG(
      'plans-rag',
      '存储和检索计划执行信息',
      'plans_collection',
      process.env.OPENAI_API_KEY || '',
    );
    
    // 等待RAG初始化
    await (plansRAG as any).initialize();
    
    // 2. 创建支持RAG的计划上下文
    const planContext = new RAGEnabledPlanContext();
    
    // 3. 注册RAG实例到上下文
    planContext.registerRAG('plans-rag', plansRAG);
    
    // 4. 向RAG添加示例数据
    await plansRAG.upsert([
      {
        id: 'example-plan-1',
        content: '步骤0: 收集需求\n结果: 已收集所有需求\n\n步骤1: 设计方案\n结果: 完成初步设计\n\n步骤2: 实现核心功能\n结果: 成功实现所有核心功能',
        metadata: {
          source: 'plan-context',
          category: 'plan',
          created: new Date(),
          description: '开发一个网站',
          result: '网站成功开发完成'
        }
      },
      {
        id: 'example-plan-2',
        content: '步骤0: 分析问题\n结果: 明确了问题的根本原因\n\n步骤1: 设计解决方案\n结果: 确定了最优解决方案\n\n步骤2: 实施解决方案\n结果: 问题已彻底解决',
        metadata: {
          source: 'plan-context',
          category: 'plan',
          created: new Date(),
          description: '解决系统性能问题',
          result: '系统性能提升了50%'
        }
      }
    ]);
    
    console.log('示例数据已添加到RAG系统');
    
    // 5. 创建一个新计划（模拟）
    planContext.setData({
      id: 'test-plan-1',
      description: '优化网站加载速度',
      status: 'pending',
      result: '',
      steps: [
        { id: 0, task: '分析当前页面加载性能', process: '', result: '' },
        { id: 1, task: '优化图片资源', process: '', result: '' },
        { id: 2, task: '实施延迟加载', process: '', result: '' }
      ],
      pendingSteps: [],
      resolvedSteps: [],
      rejectedSteps: []
    });
    
    // 6. 使用RAG增强渲染提示
    const prompt = await planContext.renderPrompt();
    console.log('增强的提示:');
    console.log(prompt);
    
    // 7. 查询类似计划
    const queryTool = planContext.toolList().find(tool => tool.name === 'query_similar_plans');
    if (queryTool) {
      const results = await queryTool.execute({ query: '优化网站性能' });
      console.log('相关计划查询结果:');
      console.log(JSON.stringify(results, null, 2));
    }
    
  } catch (error) {
    console.error('示例运行错误:', error);
  }
}

main(); 