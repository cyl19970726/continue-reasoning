import { createReactAgent } from './react';
import { createWeatherTool } from './tools/weather-tool';
import { createCalculatorTool } from './tools';
import { OpenAIWrapper, OPENAI_MODELS, AnthropicWrapper, ANTHROPIC_MODELS } from "@continue-reasoning/core";

async function runReactWeatherExample() {
  console.log('🌤️ ReAct Weather Agent 示例');

  // 创建 ReAct agent - 改用 OpenAI 来避免 Anthropic 的流式传输超时问题
  const agent = createReactAgent(
    "ReAct Weather Agent", 
    "使用 ReAct 模式的天气查询智能体", 
    new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false), // 使用 OpenAI 替代 Anthropic
    [createWeatherTool(), createCalculatorTool()]
  );

  try {
    // 示例1：简单天气查询
    console.log('\n📍 示例1：查询北京天气');
    const result1 = await agent.execute("请告诉我北京现在的天气温度");
    
    console.log('✅ 执行结果:');
    console.log('成功:', result1.success);
    console.log('最终答案:', result1.finalAnswer);
    console.log('步骤数:', result1.steps.length);
    
    // 示例2：复杂查询（多个城市对比）
    console.log('\n📍 示例2：对比北京和上海的天气温差');
    const result2 = await agent.execute("请查询北京和上海的天气，并计算两地的温差");
    
    console.log('✅ 执行结果:');
    console.log('成功:', result2.success);
    console.log('最终答案:', result2.finalAnswer);
    console.log('步骤数:', result2.steps.length);

    // 展示详细的执行步骤
    console.log('\n📋 详细执行步骤:');
    result2.steps.forEach((step, index) => {
      console.log(`\n--- 步骤 ${index + 1} ---`);
      
      if (step.thinking) {
        console.log('💭 思考过程:', step.thinking);
      }
      
      if (step.toolCalls && step.toolCalls.length > 0) {
        console.log('🔧 工具调用:');
        step.toolCalls.forEach((call, i) => {
          console.log(`  ${i + 1}. ${call.tool}`);
          console.log(`     参数:`, JSON.stringify(call.params, null, 2));
          console.log(`     结果:`, JSON.stringify(call.result, null, 2));
        });
      }
      
      if (step.finalAnswer) {
        console.log('✅ 最终答案:', step.finalAnswer);
      }
    });

  } catch (error) {
    console.error('❌ 执行失败:', error);
  }
}

// 导出函数以便其他地方使用
export { runReactWeatherExample };

// 如果直接运行此文件
if (require.main === module) {
  runReactWeatherExample().catch(console.error);
} 