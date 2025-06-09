// PromptProcessor 示例实现 - 展示如何根据 stepIndex 生成不同格式的提示
import { PromptProcessor, ChatMessage, ToolCall, ToolCallResult } from './index';

// 思考结果类型
type ThinkingResult = {
  thinking?: string;
  plan?: string;
  nextAction?: string;
}

export class StepAwarePromptProcessor implements PromptProcessor<ThinkingResult, (responseText: string) => ThinkingResult | null> {
  systemPrompt: string;
  currentPrompt: string = '';
  outputExtractor: (responseText: string) => ThinkingResult | null;
  chatMessagesHistory: ChatMessage[] = [];
  
  // 存储所有步骤的数据
  ExtractorResults: Array<ThinkingResult> = [];
  ToolCalls: Array<ToolCall> = [];
  ToolCallResults: Array<ToolCallResult> = [];
  
  private stopSignal: boolean = false;

  constructor(systemPrompt: string) {
    this.systemPrompt = systemPrompt;
    this.outputExtractor = (responseText: string) => {
      // 简单的提取逻辑
      const thinking = this.extractBetweenTags(responseText, 'think');
      const plan = this.extractBetweenTags(responseText, 'plan');
      const nextAction = this.extractBetweenTags(responseText, 'next_action');
      
      if (thinking || plan || nextAction) {
        return { thinking, plan, nextAction };
      }
      return null;
    };
  }

  private extractBetweenTags(text: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}>(.*?)</${tag}>`, 's');
    const match = text.match(regex);
    return match ? match[1].trim() : undefined;
  }

  setStopSignal(stop: boolean): void {
    this.stopSignal = stop;
  }

  getStopSignal(): boolean {
    return this.stopSignal;
  }

  renderChatMessageToPrompt(messages: ChatMessage[]): void {
    // 将聊天消息添加到当前提示
    const messageText = messages.map(m => {
      return `**${m.role}**: ${m.content}`;
    }).join('\n\n');
    
    this.currentPrompt += `\n\n${messageText}`;
  }

  renderExtractorResultToPrompt(extractorResult: ThinkingResult, stepIndex: number): void {
    // 根据步骤索引决定如何渲染思考结果
    if (stepIndex === 0) {
      // 第一步：详细展示思考过程
      this.currentPrompt += '\n\n=== 第一步思考 ===';
      if (extractorResult.thinking) {
        this.currentPrompt += `\n💭 思考: ${extractorResult.thinking}`;
      }
      if (extractorResult.plan) {
        this.currentPrompt += `\n📋 计划: ${extractorResult.plan}`;
      }
      if (extractorResult.nextAction) {
        this.currentPrompt += `\n⚡ 下一步: ${extractorResult.nextAction}`;
      }
    } else {
      // 后续步骤：简化格式
      this.currentPrompt += `\n\n=== 第${stepIndex + 1}步思考 ===`;
      if (extractorResult.thinking) {
        this.currentPrompt += `\n思考: ${extractorResult.thinking}`;
      }
    }
  }

  renderToolCallToPrompt(toolResults: ToolCallResult[], stepIndex: number): void {
    // 根据步骤索引决定如何渲染工具调用结果
    if (stepIndex === 0) {
      // 第一步：详细展示工具调用
      this.currentPrompt += '\n\n=== 第一步工具执行 ===';
      toolResults.forEach((result, index) => {
        this.currentPrompt += `\n🔧 工具 ${index + 1}: ${result.name}`;
        this.currentPrompt += `\n   结果: ${JSON.stringify(result.result, null, 2)}`;
        if (result.error) {
          this.currentPrompt += `\n   ❌ 错误: ${result.error}`;
        }
      });
    } else if (stepIndex === 1) {
      // 第二步：中等详细程度
      this.currentPrompt += `\n\n=== 第${stepIndex + 1}步工具执行 ===`;
      toolResults.forEach((result, index) => {
        this.currentPrompt += `\n工具${index + 1}(${result.name}): ${JSON.stringify(result.result)}`;
      });
    } else {
      // 第三步及以后：简化格式
      this.currentPrompt += `\n\n=== 第${stepIndex + 1}步工具执行 ===`;
      const resultSummary = toolResults.map(r => `${r.name}: 完成`).join(', ');
      this.currentPrompt += `\n${resultSummary}`;
    }
  }

  formatPrompt(userMessage: string, stepIndex: number): string {
    // 根据步骤索引生成不同的提示格式
    if (stepIndex === 0) {
      // 第一步：详细的系统提示
      this.currentPrompt = `${this.systemPrompt}

🎯 **任务开始** - 第1步
请仔细分析用户问题，制定详细计划，并开始执行。

格式要求：
<think>详细分析问题和思考过程</think>
<plan>制定执行计划</plan>
<next_action>下一步具体行动</next_action>

用户问题: ${userMessage}`;
    } else {
      // 后续步骤：简化的提示格式
      this.currentPrompt = `继续执行任务 - 第${stepIndex + 1}步

基于前面的结果，请继续执行或给出最终答案。

格式要求：
<think>当前思考</think>
如果完成请使用: <final_answer>最终答案</final_answer>`;
    }

    return this.currentPrompt;
  }
}

// 使用示例
export function createExamplePromptProcessor(): StepAwarePromptProcessor {
  const systemPrompt = `你是一个智能助手，能够：
1. 分析问题并制定计划
2. 调用工具获取信息
3. 综合信息给出答案

请按步骤思考和执行。`;

  return new StepAwarePromptProcessor(systemPrompt);
}

// 演示如何使用
export function demonstratePromptProcessor() {
  const promptProcessor = createExamplePromptProcessor();
  
  console.log('=== 演示 PromptProcessor 的步骤感知功能 ===\n');
  
  // 第一步
  console.log('第1步的提示格式:');
  const step1Prompt = promptProcessor.formatPrompt('查询北京的天气', 0);
  console.log(step1Prompt);
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 模拟第一步的思考结果
  const thinkingResult1: ThinkingResult = {
    thinking: '用户想了解北京的天气，我需要调用天气工具',
    plan: '1. 调用天气工具查询北京天气 2. 分析结果 3. 给出答案',
    nextAction: '调用 get_weather 工具'
  };
  
  promptProcessor.ExtractorResults.push(thinkingResult1);
  promptProcessor.renderExtractorResultToPrompt(thinkingResult1, 0);
  
  // 模拟工具调用结果
  const toolResult1: ToolCallResult = {
    name: 'get_weather',
    call_id: 'step_0_weather_001',
    result: { city: '北京', temperature: '15°C', weather: '晴天' }
  };
  
  promptProcessor.ToolCallResults.push(toolResult1);
  promptProcessor.renderToolCallToPrompt([toolResult1], 0);
  
  console.log('第1步执行后的 currentPrompt:');
  console.log(promptProcessor.currentPrompt);
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 第二步
  console.log('第2步的提示格式:');
  const step2Prompt = promptProcessor.formatPrompt('', 1);
  console.log(step2Prompt);
  
  return promptProcessor;
} 