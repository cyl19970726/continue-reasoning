import { ModularFunctionCallAgent, DefaultPromptProcessor } from '../function-call/agent';
import { OpenAIWrapper } from '@continue-reasoning/core';
import { OPENAI_MODELS } from '@continue-reasoning/core';
import { ThinkTool } from '../tools/think';
import { createCalculatorTool } from "../tools";
import { createWeatherTool } from "../tools/weather-tool";
import { createFileTool } from "../tools/file-tool";
import { createHttpTool } from "../tools/http-tool";
import { logger, LogLevel } from '../utils/logger';

// 设置日志级别
logger.setLogLevel(LogLevel.DEBUG);

const gpt4o = new OpenAIWrapper(OPENAI_MODELS.GPT_4O);
const gpt4o_mini = new OpenAIWrapper(OPENAI_MODELS.GPT_4O_MINI);

// 复杂任务：数据研究助手
const complexTask = `我需要你帮我完成一个复杂的数据分析任务：

1. 首先获取北京和上海的天气数据
2. 将这些天气数据保存到文件 weather-data.json 中
3. 从文件中读取数据并计算温度统计信息
4. 创建一个天气分析报告，包含：
   - 两城市的温度对比
   - 温度差异分析
   - 基于温度的建议
5. 将分析报告保存到 weather-report.txt 文件中

请按步骤完成这个任务，确保每一步都有详细的思考过程。`;

const systemPrompt = `你是一个专业的数据分析助手，能够调用多种工具来完成复杂的数据分析任务。

你拥有以下工具：
- think: 思考工具，用于分析和规划
- get_weather: 获取天气数据
- calculator: 执行数学计算
- file_operations: 文件读写操作
- http_request: HTTP请求工具

请按照以下步骤进行工作：
1. 使用think工具分析任务并制定计划
2. 按步骤执行各项操作
3. 对每个步骤的结果进行验证
4. 最终提供完整的分析结果

在完成任务时，请使用以下格式：
<think>你的思考过程</think>

当完成所有任务时，请使用：
<final_answer>任务完成的总结</final_answer>`;

async function runComplexDataAnalysisTask() {
  logger.info('Starting complex data analysis task');
  
  const tools = [
    new ThinkTool(),
    createWeatherTool(),
    createCalculatorTool(),
    createFileTool(),
    createHttpTool()
  ];

  const promptProcessor = new DefaultPromptProcessor(systemPrompt);
  const agent = new ModularFunctionCallAgent(
    'data_analysis_agent', 
    'Complex Data Analysis Agent', 
    gpt4o, 
    tools, 
    promptProcessor
  );

  agent.setMaxIterations(15); // 增加迭代次数以支持复杂任务

  try {
    const result = await agent.execute(complexTask);
    
    logger.info('Task completed', { success: result.success });
    
    if (result.success) {
      console.log('\n=== 任务完成 ===');
      console.log('最终答案:', result.finalAnswer);
      console.log('\n=== 执行步骤总数 ===');
      console.log(`共执行了 ${result.steps.length} 个步骤`);
      
      // 显示每个步骤的摘要
      result.steps.forEach((step, index) => {
        console.log(`\n步骤 ${index + 1}:`);
        if (step.thinking) {
          console.log(`思考: ${step.thinking.substring(0, 100)}...`);
        }
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach(call => {
            console.log(`工具调用: ${call.tool} -> ${JSON.stringify(call.result).substring(0, 100)}...`);
          });
        }
      });
    } else {
      console.log('\n=== 任务失败 ===');
      console.log('错误:', result.error);
    }

    return result;
  } catch (error) {
    logger.error('Task execution failed', error);
    throw error;
  }
}

// 另一个复杂任务：Web数据收集与分析
const webDataTask = `请帮我完成一个Web数据收集任务：

1. 访问 JSONPlaceholder API (https://jsonplaceholder.typicode.com/posts) 获取文章数据
2. 分析这些文章数据，统计：
   - 总文章数量
   - 各用户发布的文章数量
   - 文章标题的平均长度
3. 将用户ID为1的所有文章保存到 user1-posts.json 文件中
4. 创建一个数据分析报告并保存到 web-data-report.txt

请确保每个步骤都有完整的验证和错误处理。`;

async function runWebDataCollectionTask() {
  logger.info('Starting web data collection task');
  
  const tools = [
    new ThinkTool(),
    createHttpTool(),
    createFileTool(),
    createCalculatorTool()
  ];

  const promptProcessor = new DefaultPromptProcessor(systemPrompt);
  const agent = new ModularFunctionCallAgent(
    'web_data_agent', 
    'Web Data Collection Agent', 
    gpt4o_mini, 
    tools, 
    promptProcessor
  );

  agent.setMaxIterations(12);

  try {
    const result = await agent.execute(webDataTask);
    
    logger.info('Web data task completed', { success: result.success });
    
    if (result.success) {
      console.log('\n=== Web数据任务完成 ===');
      console.log('最终答案:', result.finalAnswer);
    } else {
      console.log('\n=== Web数据任务失败 ===');
      console.log('错误:', result.error);
    }

    return result;
  } catch (error) {
    logger.error('Web data task execution failed', error);
    throw error;
  }
}

// 文件系统探索任务
const fileSystemTask = `请帮我探索当前工作目录：

1. 列出当前目录的所有文件和子目录
2. 找到所有的.ts文件，统计数量
3. 读取package.json文件（如果存在）并分析项目信息
4. 创建一个目录结构报告，保存到 directory-report.txt

请注意文件操作的安全性，只读取和分析，不要修改现有文件。`;

async function runFileSystemExplorationTask() {
  logger.info('Starting file system exploration task');
  
  const tools = [
    new ThinkTool(),
    createFileTool(),
    createCalculatorTool()
  ];

  const promptProcessor = new DefaultPromptProcessor(systemPrompt);
  const agent = new ModularFunctionCallAgent(
    'filesystem_agent', 
    'File System Explorer Agent', 
    gpt4o_mini, 
    tools, 
    promptProcessor
  );

  agent.setMaxIterations(10);

  try {
    const result = await agent.execute(fileSystemTask);
    
    logger.info('File system task completed', { success: result.success });
    
    if (result.success) {
      console.log('\n=== 文件系统探索任务完成 ===');
      console.log('最终答案:', result.finalAnswer);
    } else {
      console.log('\n=== 文件系统探索任务失败 ===');
      console.log('错误:', result.error);
    }

    return result;
  } catch (error) {
    logger.error('File system task execution failed', error);
    throw error;
  }
}

async function main() {
  try {
    console.log("开始运行复杂测试用例...\n");
    
    // 任务1：数据分析任务
    console.log("🔄 执行任务1：复杂数据分析任务");
    await runComplexDataAnalysisTask();
    
    console.log("\n" + "=".repeat(80) + "\n");
    
    // 任务2：Web数据收集任务
    console.log("🔄 执行任务2：Web数据收集任务");
    await runWebDataCollectionTask();
    
    console.log("\n" + "=".repeat(80) + "\n");
    
    // 任务3：文件系统探索任务
    console.log("🔄 执行任务3：文件系统探索任务");
    await runFileSystemExplorationTask();
    
    console.log("\n✅ 所有复杂测试任务已完成！");
    console.log("📁 请检查生成的文件和日志：");
    console.log("   - .logs/ 目录下的日志文件");
    console.log("   - weather-data.json");
    console.log("   - weather-report.txt");
    console.log("   - user1-posts.json");
    console.log("   - web-data-report.txt");
    console.log("   - directory-report.txt");
    
  } catch (error) {
    logger.error('Main execution failed', error);
    console.error('执行失败:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { runComplexDataAnalysisTask, runWebDataCollectionTask, runFileSystemExplorationTask }; 