import { createThinkToolAgent, createThinkTextAgent } from "./function-call/index.js";
import { createCalculatorTool } from "./tools/index.js";
import { createWeatherTool } from "./tools/weather-tool.js";
import { OpenAIWrapper, OPENAI_MODELS } from "@continue-reasoning/core";
import { z } from "zod";

// 手动创建 ThinkTool 避免导入问题
class ThinkTool {
  name = 'think';
  description = '用于记录思考过程和推理步骤，帮助分析问题和制定执行计划. 请你在计划里显示提供要调用的工具名称';
  params = z.object({ 
    thought: z.string().describe('当前的思考内容，包括问题分析、执行计划或推理过程')
  });
  
  async execute_func(params: { thought: string }) {
    return {
      thought: params.thought,
      timestamp: new Date().toISOString(),
      action: 'thinking_recorded'
    };
  }

  toCallDefinition() {
    return {
      type: 'function' as const,
      name: this.name,
      description: this.description,
      paramSchema: this.params,
      strict: false
    };
  }
}

async function testBothVersions() {
  console.log('🚀 测试新架构的两个版本 (使用重构后的 PromptManager 架构)');
  
  // 测试 Think Text Agent (使用兼容性函数，内部已重构为 PromptManager)
  console.log('\n1️⃣ Think Text Agent (已重构为 PromptManager)');
  const pureAgent = createThinkTextAgent(
    "Think Text Agent",
    "Think text without think tool",
    new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false),
    [createWeatherTool(), createCalculatorTool()] // 不包含 ThinkTool
  );
  
  console.log('Agent 内部已使用 PromptManager 架构');
  console.log('- systemPrompt 由 PromptManager 管理');
  console.log('- outputExtractor 由 PromptManager 处理');
  console.log('- chatMessagesHistory 由 PromptManager 维护');
  
  const pureResult = await pureAgent.execute("请查询北京和上海的天气，并计算两地的温差");
  console.log('Think Text Agent 结果:', pureResult.success ? '成功' : '失败', pureResult.steps?.length || 0, '步');
  
  // 测试 Think Tool Agent (使用兼容性函数，内部已重构为 PromptManager)  
  console.log('\n2️⃣ Think Tool Agent (已重构为 PromptManager)');
  const thinkAgent = createThinkToolAgent(
    "Think Tool Agent",
    "Function call with think tool capabilities",
    new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false),
    [createWeatherTool(), createCalculatorTool(), new ThinkTool()] // 包含 ThinkTool
  );
  
  console.log('Agent 内部已使用 PromptManager 架构');
  console.log('- 所有步骤数据由 PromptManager.getExtractorResultsForStep() 管理');
  console.log('- 工具调用由 PromptManager.insertToolCall() 处理');
  console.log('- 对话历史由 PromptManager.chatMessagesHistory 维护');
  
  const thinkResult = await thinkAgent.execute("请查询北京和上海的天气，并计算两地的温差");
  console.log('Think Tool Agent 结果:', thinkResult.success ? '成功' : '失败', thinkResult.steps?.length || 0, '步');
  
  // 检查是否有 ThinkTool 调用
  const hasThinkToolCalls = thinkResult.steps?.some(step => 
    step.toolCalls?.some(call => call.tool === 'think')
  );
  console.log('是否使用了 ThinkTool:', hasThinkToolCalls ? '是' : '否');
  
  console.log('\n✅ 重构完成：');
  console.log('- FunctionCallAgent 现在使用 PromptManager 进行统一管理');
  console.log('- execute() 方法内部将 string 转换为 ChatMessage 处理');
  console.log('- 保持向后兼容性，现有代码无需修改');
  console.log('- 新代码可以直接传入 PromptManager 实例获得更强大的功能');
}

if (require.main === module) {
  testBothVersions().catch(console.error);
}

export { testBothVersions }; 