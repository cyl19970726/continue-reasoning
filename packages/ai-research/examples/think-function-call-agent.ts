import { FunctionCallAgent } from '../function-call';
import { DefaultPromptProcessor, ModularFunctionCallAgent } from '../function-call/agent';
import { OpenAIWrapper } from '@continue-reasoning/core';
import { OPENAI_MODELS } from '@continue-reasoning/core';
import { ThinkTool } from '../tools/think';
import { createCalculatorTool } from "../tools";
import { createWeatherTool } from "../tools/weather-tool";
import { logger, LogLevel } from '../utils/logger';

// 设置日志级别
logger.setLogLevel(LogLevel.INFO);

const gpt4o = new OpenAIWrapper(OPENAI_MODELS.GPT_4O);
const gpt4o_mini = new OpenAIWrapper(OPENAI_MODELS.GPT_4O_MINI);

const thinkTool = new ThinkTool();
const thinkToolAgentTools = [thinkTool, createWeatherTool(), createCalculatorTool()];
const thinkToolAgentSystemPrompt = `你是一个智能助手，能够调用工具来完成任务。

请根据用户问题进行思考，并决定是否需要调用工具。

在进行任何工具调用之前，请优先调用 think tool 来思考。 

如果是最后一次回答用户请使用以下格式：
<final_answer> 你的回答 </final_answer>`;

let thinkTextAgentTools = [createWeatherTool(), createCalculatorTool()];
const thinkTextAgentSystemPrompt = `你是一个智能体，能够调用多种工具来完成任务。

在进行工具调用之前请先进行思考，格式如下：
<think>我需要知道北京的天气，所以我接下来要调用 get_weather("北京")</think>

可用工具：
${thinkTextAgentTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

请根据用户问题进行思考，并决定是否需要调用工具来获取信息。如果不需要调用工具就能回答，直接回答即可。

如果是最后一次回答用户请使用以下格式：
<final_answer> 你的回答 </final_answer>`;

const task = "请你获取今天北京的天气和上海的天气，并且计算他们之间的温度差"

async function runThinkToolAgent() {
    logger.info('Starting think tool agent test');
    
    const promptProcessor = new DefaultPromptProcessor(thinkToolAgentSystemPrompt);

    const thinkToolAgent = new ModularFunctionCallAgent('think_tool_agent', 'think tool agent', gpt4o, thinkToolAgentTools, promptProcessor);
    
    const result = await thinkToolAgent.execute(task);
    
    logger.info('Think tool agent completed', { success: result.success });
    console.log(result);
    
    return result;
}

async function runThinkTextAgent() {
    logger.info('Starting think text agent test');
    
    const promptProcessor = new DefaultPromptProcessor(thinkTextAgentSystemPrompt);

    const thinkToolAgent = new ModularFunctionCallAgent('think_tool_agent', 'think text agent', gpt4o, thinkTextAgentTools, promptProcessor);
    
    const result = await thinkToolAgent.execute(task);
    
    logger.info('Think text agent completed', { success: result.success });
    console.log(result);
    
    return result;
}

async function main() {
    try {
        console.log("--------------runThinkToolAgent------------------");
        await runThinkToolAgent();

        console.log("----------------runThinkTextAgent----------------");
        await runThinkTextAgent();
        
        console.log("\n✅ 简单测试任务已完成！");
        console.log("📁 查看日志文件：.logs/ 目录");
    } catch (error) {
        logger.error('Simple test execution failed', error);
        console.error('执行失败:', error);
    }
}

if (require.main === module) {
    main().catch(console.error);
}