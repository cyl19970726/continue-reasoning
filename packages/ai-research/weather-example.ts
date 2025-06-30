import { createThinkTextAgent } from "./function-call";
import { createCalculatorTool, ThinkTool } from "./tools/index";
import { createWeatherTool } from "./tools/weather-tool";
import { OpenAIWrapper, OPENAI_MODELS } from "@continue-reasoning/core";

async function runWeatherExample() {
  const agent = createThinkTextAgent(
    "Function Call + Think Agent", 
    "A weather agent using function calling with think capabilities", 
    new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false), 
    [createWeatherTool(), createCalculatorTool(), new ThinkTool()]
  );

  console.log('🌤️ Function-Call Weather Agent 示例 (with ThinkTool)');
  
  console.log('\n📍 示例1：查询北京天气');
  const result = await agent.execute("What is the weather in Beijing?");
  console.log(result);

  // 示例2：复杂查询（多个城市对比）
  console.log('\n📍 示例2：对比北京和上海的天气温差');
  const result2 = await agent.execute("请查询北京和上海的天气，并计算两地的温差");
  console.log(result2);
  return result;
}

// 如果直接运行此文件
if (require.main === module) {
  runWeatherExample().catch(console.error);
}

export { runWeatherExample };