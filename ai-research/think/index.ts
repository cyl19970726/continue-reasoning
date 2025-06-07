import { ILLM, ToolCallDefinition } from '../../src/core/interfaces';
import { OpenAIWrapper } from '../../src/core/models/openai';
import { OPENAI_MODELS } from '../../src/core/models';
import { z } from 'zod';

async function thinkToolExample(llm: ILLM) {
  console.log('--- 方法一：think Tool ---');
  const thinkTool: ToolCallDefinition = {
    type: 'function',
    name: 'think',
    description: '捕获模型思考内容的工具',
    paramSchema: z.object({ input: z.string().describe('思考内容') }),
    resultSchema: z.any(),
    resultDescription: '思考工具调用结果',
  };
  const prompt = '请解释为什么天空是蓝色，并使用 think 工具记录思考。';
  const { text, toolCalls } = await llm.call(prompt, [thinkTool]);
  console.log('模型响应：', text.trim());
  if (toolCalls.length > 0) {
    toolCalls.forEach(call => {
      console.log('捕获到思考：', call.parameters.input);
    });
  } else {
    console.log('未捕获到 think 工具调用。');
  }
}

async function thinkTagExample(llm: ILLM) {
  console.log('\n--- 方法二：<think> 标签 ---');
  const systemPrompt = `
You are a helpful agent that must always explain its reasoning before taking any action.
Whenever you think, include it in <think>...</think> tags.
`;
  const userPrompt = '请解释为什么水会在0°C时结冰。';
  const fullPrompt = systemPrompt + '\n' + userPrompt;
  const { text } = await llm.call(fullPrompt, []);
  console.log('模型响应：', text.trim());
}

async function schedulingLoopExample(llm: ILLM) {
  console.log('\n--- 调度循环示例：思考 + 工具调用 ---');
  const systemPrompt = `
You must always think before acting. For every tool you call, precede it with a <think> tag describing your intention.
Use the following format:
<think>我打算使用 web_search 工具查询资料</think>
<tool_call>{"name":"web_search","arguments":{"query":"..."}}</tool_call>
`;
  const webSearchTool: ToolCallDefinition = {
    type: 'function',
    name: 'web_search',
    description: '在网络中搜索给定查询内容',
    paramSchema: z.object({ query: z.string().describe('搜索关键词') }),
    resultSchema: z.any(),
    resultDescription: '网络搜索结果',
  };
  let history = systemPrompt.trim();
  let done = false;
  while (!done) {
    const { text, toolCalls } = await llm.call(history, [webSearchTool]);
    console.log('LLM 输出：', text.trim());
    const thoughts = Array.from(
      text.matchAll(/<think>([\s\S]*?)<\/think>/g)
    ).map(m => m[1].trim());
    thoughts.forEach((th, i) => console.log(`思考${i + 1}：`, th));
    if (toolCalls.length > 0) {
      for (const call of toolCalls) {
        console.log('执行工具调用：', call.name, call.parameters);
        const toolResult = { data: `模拟 ${call.name} 结果 for ${JSON.stringify(call.parameters)}` };
        console.log('工具结果：', toolResult);
        history += '\n' + text.trim();
        history += `\n<tool_result id="${call.call_id}">${JSON.stringify(toolResult)}</tool_result>`;
      }
    } else {
      done = true;
    }
  }
}

(async () => {
  const llm: ILLM = new OpenAIWrapper(OPENAI_MODELS.GPT_4_TURBO, false);
  await thinkToolExample(llm);
  await thinkTagExample(llm);
  await schedulingLoopExample(llm);
})();