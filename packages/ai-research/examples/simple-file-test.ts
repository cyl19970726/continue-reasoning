import { ModularFunctionCallAgent, DefaultPromptProcessor } from '../function-call/agent';
import { OpenAIWrapper } from '@continue-reasoning/core';
import { OPENAI_MODELS } from '@continue-reasoning/core';
import { ThinkTool } from '../tools/think';
import { createFileTool } from "../tools/file-tool";
import { createCalculatorTool } from "../tools";
import { logger, LogLevel } from '../utils/logger';

// 设置日志级别为DEBUG以查看所有日志
logger.setLogLevel(LogLevel.DEBUG);

const gpt4o_mini = new OpenAIWrapper(OPENAI_MODELS.GPT_4O_MINI);

// THINK_TOOL Agent
const systemPrompt = `你是一个智能助手，能够调用工具来完成任务。

你拥有以下工具：
- think: 思考工具，用于分析和规划
- file_operations: 文件读写操作
- calculator: 执行数学计算

请按照步骤完成任务，并在最终使用：
<final_answer>你的回答</final_answer>`;

// THINK_TEXT Agent
const thinkTextAgentTools = [
    createFileTool(),
    createCalculatorTool()
];
const thinkTextAgentSystemPrompt = `你是一个智能体，能够调用多种工具来完成任务。

同时你也是一个multi-step agent,你可以在ChatHistory List 里查看之前步骤的工作。
所以请你留意 'Step_1' 、'step 1' , 'step_1' 等字样，这些是用来标识现在处于哪个 Step 的。

在进行工具调用之前请先进行思考，格式如下：
<think>你可以在这里进行复杂的工具调用分析，也可以在'Step 0' 给出你的行动计划，在之后的步骤里更新计划和计划状态，最好计划采用 Markdown的todo list 格式</think>
可用工具：

${thinkTextAgentTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

请按照步骤完成任务，并在最终使用：
<final_answer>你的回答</final_answer>`;

// THINK_TEXT_SPECIAL Agent
const thinkTextSpecialAgentTools = [
    createFileTool(),
    createCalculatorTool()
];
const thinkTextSpecialAgentSystemPrompt = `你是一个智能体，能够调用多种工具来完成任务。

同时你也是一个 Multi-Step-Agent, Multi-Step 指的是我们会把重复调用LLM，直到任务完成，每个Step都会包含之前Step的必要信息 
你可以在 '## Chat History List' 下查看之前 Steps 的工作。
所以请你留意 'Step_1' 、'step 1' , 'step_1' 等字样，这些是用来标识现在处于哪个 Step 的。


在进行工具调用之前请先进行思考，格式如下：
<think>你可以在这里进行复杂的工具调用分析，也可以在'Step 0' 给出你的行动计划，在之后的步骤里更新计划和计划状态，最好计划采用 Markdown的todo list格式,并且这里的我们要避免用Step字段防止混淆</think>

可用工具：
${thinkTextSpecialAgentTools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

请按照步骤完成任务，并在最终使用：
<final_answer>你的回答</final_answer>`;


const simpleTask = `请帮我完成一个简单的文件操作任务：

1. 创建一个名为 test-file-sepcial-1.txt 的文件，内容为 "Hello, World! This is a test file."
2. 读取这个文件的内容并验证
3. 计算文件内容的字符数
4. 将字符数的信息追加到文件末尾

请确保每个步骤都成功完成。`;

async function runSimpleFileTest(agentConfig: 'THINK_TOOL' | 'THINK_TEXT' | 'THINK_TEXT_SPECIAL') {
  logger.info('Starting simple file test');
  
  if (agentConfig === 'THINK_TOOL') {
    const tools = [
        new ThinkTool(),
        createFileTool(),
        createCalculatorTool()
    ];

    const promptProcessor = new DefaultPromptProcessor(systemPrompt);
    const agent = new ModularFunctionCallAgent(
        'simple_file_agent', 
        'Simple File Test Agent', 
        gpt4o_mini, 
        tools, 
        promptProcessor
    );

    agent.setMaxIterations(8);

    try {
        const result = await agent.execute(simpleTask);
        
        logger.info('Simple file test completed', { success: result.success });
        
        if (result.success) {
        console.log('\n=== 简单文件测试完成 ===');
        console.log('最终答案:', result.finalAnswer);
        console.log('\n=== 执行步骤 ===');
        result.steps.forEach((step, index) => {
            console.log(`步骤 ${index + 1}:`);
            if (step.thinking) {
            console.log(`  思考: ${step.thinking}`);
            }
            if (step.toolCalls && step.toolCalls.length > 0) {
            step.toolCalls.forEach(call => {
                console.log(`  工具: ${call.tool} -> 成功: ${call.result ? 'Yes' : 'No'}`);
            });
            }
        });
        } else {
        console.log('\n=== 简单文件测试失败 ===');
        console.log('错误:', result.error);
        }

        return result;
    } catch (error) {
        logger.error('Simple file test execution failed', error);
        throw error;
    }
  } else if (agentConfig === 'THINK_TEXT') {
    const promptProcessor = new DefaultPromptProcessor(thinkTextAgentSystemPrompt);
    const agent = new ModularFunctionCallAgent(
        'simple_file_agent', 
        'Simple File Test Agent', 
        gpt4o_mini, 
        thinkTextAgentTools, 
        promptProcessor
    );  
    agent.setMaxIterations(8);

    try {
        const result = await agent.execute(simpleTask);
        
        logger.info('Simple file test completed', { success: result.success });
        
        if (result.success) {
        console.log('\n=== 简单文件测试完成 ===');
        console.log('最终答案:', result.finalAnswer);
        console.log('\n=== 执行步骤 ===');
        result.steps.forEach((step, index) => {
            console.log(`步骤 ${index + 1}:`);
            if (step.thinking) {
            console.log(`  思考: ${step.thinking}`);
            }
            if (step.toolCalls && step.toolCalls.length > 0) {
            step.toolCalls.forEach(call => {
                console.log(`  工具: ${call.tool} -> 成功: ${call.result ? 'Yes' : 'No'}`);
            });
            }
        });
        } else {
        console.log('\n=== 简单文件测试失败 ===');
        console.log('错误:', result.error);
        }

        return result;
    } catch (error) {
        logger.error('Simple file test execution failed', error);
        throw error;
    }

  } else if (agentConfig === 'THINK_TEXT_SPECIAL') {
    const promptProcessor = new DefaultPromptProcessor(thinkTextSpecialAgentSystemPrompt);
    // 确保在最开始先进行思考不进行工具调用
    promptProcessor.setEnableToolCallsForStep((stepIndex) => {
        if (stepIndex === 0) {
            return false;
        }
        return true;
    });
    const agent = new ModularFunctionCallAgent(
        'simple_file_agent', 
        'Simple File Test Agent', 
        gpt4o_mini, 
        thinkTextSpecialAgentTools, 
        promptProcessor
    );  
    agent.setMaxIterations(10);

    try {
        const result = await agent.execute(simpleTask);
        
        logger.info('Simple file test completed', { success: result.success });
        
        if (result.success) {
        console.log('\n=== 简单文件测试完成 ===');
        console.log('最终答案:', result.finalAnswer);
        console.log('\n=== 执行步骤 ===');
        result.steps.forEach((step, index) => {
            console.log(`步骤 ${index + 1}:`);
            if (step.thinking) {
            console.log(`  思考: ${step.thinking}`);
            }
            if (step.toolCalls && step.toolCalls.length > 0) {
            step.toolCalls.forEach(call => {
                console.log(`  工具: ${call.tool} -> 成功: ${call.result ? 'Yes' : 'No'}`);
            });
            }
        });
        } else {
        console.log('\n=== 简单文件测试失败 ===');
        console.log('错误:', result.error);
        }

        return result;
    } catch (error) {
        logger.error('Simple file test execution failed', error);
        throw error;
    }
  }
}

async function main() {
  try {
    console.log("开始运行简单文件测试...\n");
    
    await runSimpleFileTest("THINK_TEXT_SPECIAL");
    
    console.log("\n✅ 简单文件测试任务已完成！");
    console.log("📁 请检查生成的文件和日志：");
    console.log("   - .logs/ 目录下的日志文件");
    console.log("   - test-file.txt");
    
  } catch (error) {
    logger.error('Main execution failed', error);
    console.error('执行失败:', error);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { runSimpleFileTest }; 