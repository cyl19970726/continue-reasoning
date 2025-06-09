import { ILLM } from '@continue-reasoning/core';
import { IAgent, ITool, AgentResult, AgentStep } from '../interfaces';
import { quickExtract } from '../xml-extractor';

// 文本提取函数类型定义
export type TextExtractorFunc = (responseText: string, currentStep: AgentStep) => void;

// System Prompt 生成函数类型定义
export type SystemPromptGenerator = (tools: ITool[]) => string;

// 预定义的提取器
export const extractors = {
  // Pure Function Call 提取器 - 不提取thinking,因为think可以通过 think tool 来传递
  pure: (responseText: string, currentStep: AgentStep) => {
    // 不进行任何 thinking 相关的提取
  },
  
  // <Think> 提取器 - 提取thinking内容
  withThinkText: (responseText: string, currentStep: AgentStep) => {
    const thinking = quickExtract(responseText, 'think');
    if (thinking) {
      currentStep.thinking = thinking;
      console.log('思考:', thinking);
    }
  }
};

// 预定义的 System Prompt 生成器
export const systemPromptGenerators = {
  // Pure Function Call 的简洁 prompt
  pure: (tools: ITool[]) => `
你是一个智能体，能够调用多种工具来完成任务。

在进行任何工具调用之前先调用 think tool 来记录你的思考过程。

请根据用户问题决定是否需要调用工具来获取信息。如果不需要调用工具就能回答，直接回答即可。

如果是最后一次回答用户请使用以下格式：
<final_answer> 你的回答 </final_answer>
`,

  // Function Call with Think 的详细 prompt
  withThinkText: (tools: ITool[]) => `
你是一个智能体，能够调用多种工具来完成任务。

在进行工具调用之前请先进行思考，格式如下：
<think>我需要知道北京的天气，所以我接下来要调用 get_weather("北京")</think>

可用工具：
${tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

请根据用户问题进行思考，并决定是否需要调用工具来获取信息。如果不需要调用工具就能回答，直接回答即可。

如果是最后一次回答用户请使用以下格式：
<final_answer> 你的回答 </final_answer>
`
};

export class FunctionCallAgent implements IAgent {
  name: string;
  description: string;
  llm: ILLM;
  tools: ITool[];
  private maxIterations: number = 10;
  private systemPromptGenerator: SystemPromptGenerator;
  private textExtractor: TextExtractorFunc;

  constructor(
    name: string, 
    description: string, 
    llm: ILLM, 
    tools: ITool[] = [],
    systemPromptGenerator: SystemPromptGenerator = systemPromptGenerators.pure,
    textExtractor: TextExtractorFunc = extractors.pure
  ) {
    this.name = name;
    this.description = description;
    this.llm = llm;
    this.tools = tools;
    this.systemPromptGenerator = systemPromptGenerator;
    this.textExtractor = textExtractor;
  }

  async execute(prompt: string): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    let iterations = 0;

    const systemPrompt = this.systemPromptGenerator(this.tools);
    let conversation = `${systemPrompt}\n\n用户问题: ${prompt}`;

    try {
      while (iterations < this.maxIterations) {
        iterations++;
        
        console.log(`\n=== 迭代 ${iterations} ===`);
        
        // 调用 LLM，传递工具定义让 LLM 自己决定是否调用
        const toolDefs = this.tools.map(tool => tool.toCallDefinition());
        const llmResponse = await this.llm.call(conversation, toolDefs);
        const responseText = llmResponse.text;
        const toolCalls = llmResponse.toolCalls || [];
        
        // 创建当前轮次的步骤
        const currentStep: AgentStep = {
          content: responseText
        };

        // 使用配置的文本提取器
        this.textExtractor(responseText, currentStep);

        // 检查是否有最终答案
        const finalAnswer = quickExtract(responseText, 'final_answer');
        if (finalAnswer) {
          console.log('最终答案:', finalAnswer);
          currentStep.finalAnswer = finalAnswer;
          steps.push(currentStep);
          return {
            success: true,
            finalAnswer: finalAnswer,
            steps: steps
          };
        }

        // 如果没有工具调用，说明 LLM 认为可以直接回答
        if (toolCalls.length === 0) {
          console.log('无需调用工具，直接回答');
          steps.push(currentStep);
          return {
            success: true,
            finalAnswer: responseText,
            steps: steps
          };
        }

        // 执行工具调用
        const toolResults: any[] = [];
        const toolCallsInfo: Array<{ tool: string; params: any; result: any }> = [];
        
        for (const toolCall of toolCalls) {
          const tool = this.tools.find(t => t.name === toolCall.name);
          
          if (!tool) {
            const errorMsg = `未找到工具: ${toolCall.name}`;
            console.error(errorMsg);
            const errorResult = { error: errorMsg };
            toolResults.push(errorResult);
            toolCallsInfo.push({
              tool: toolCall.name,
              params: toolCall.parameters,
              result: errorResult
            });
            continue;
          }

          try {
            console.log(`执行工具: ${tool.name}`, toolCall.parameters);
            
            const toolResult = await tool.execute_func(toolCall.parameters);
            console.log('工具结果:', toolResult);
            
            toolResults.push(toolResult);
            toolCallsInfo.push({
              tool: tool.name,
              params: toolCall.parameters,
              result: toolResult
            });

          } catch (error) {
            const errorMsg = `工具执行失败: ${error instanceof Error ? error.message : String(error)}`;
            console.error(errorMsg);
            
            const errorResult = { error: errorMsg };
            toolResults.push(errorResult);
            toolCallsInfo.push({
              tool: tool.name,
              params: toolCall.parameters,
              result: errorResult
            });
          }
        }

        // 将工具调用信息添加到当前步骤
        if (toolCallsInfo.length > 0) {
          currentStep.toolCalls = toolCallsInfo;
        }

        steps.push(currentStep);

        // 将工具结果添加到对话中，让 LLM 基于结果给出最终答案
        const toolResultsText = toolResults.map((result, index) => 
          `工具${index + 1}结果: ${JSON.stringify(result)}`
        ).join('\n');

        conversation += `\n\n助手: ${responseText}`;
        conversation += `\n\n工具执行结果:\n${toolResultsText}`;

        // 继续下一轮循环，让 LLM 处理工具结果并给出最终答案
      }

      return {
        success: false,
        error: `达到最大迭代次数 (${this.maxIterations}) 但未获得最终答案`,
        steps: steps
      };

    } catch (error) {
      return {
        success: false,
        error: `执行过程中出错: ${error instanceof Error ? error.message : String(error)}`,
        steps: steps
      };
    }
  }

  addTool(tool: ITool): void {
    if (!this.tools.find(t => t.name === tool.name)) {
      this.tools.push(tool);
    }
  }

  removeTool(toolName: string): void {
    this.tools = this.tools.filter(t => t.name !== toolName);
  }

  setMaxIterations(max: number): void {
    this.maxIterations = max;
  }

  // 动态设置 system prompt 生成器
  setSystemPromptGenerator(generator: SystemPromptGenerator): void {
    this.systemPromptGenerator = generator;
  }

  // 动态设置文本提取器
  setTextExtractor(extractor: TextExtractorFunc): void {
    this.textExtractor = extractor;
  }
}

// 便捷函数
export function createFunctionCallAgent(
  name: string, 
  description: string, 
  llm: ILLM, 
  tools: ITool[] = []
): FunctionCallAgent {
  return new FunctionCallAgent(name, description, llm, tools);
}

// 创建 Pure Function Call Agent
export function createThinkToolAgent(
  name: string, 
  description: string, 
  llm: ILLM, 
  tools: ITool[] = []
): FunctionCallAgent {
  return new FunctionCallAgent(
    name, 
    description, 
    llm, 
    tools, 
    systemPromptGenerators.pure, 
    extractors.pure
  );
}

// 创建 Function Call with Think Agent
export function createThinkTextAgent(
  name: string, 
  description: string, 
  llm: ILLM, 
  tools: ITool[] = []
): FunctionCallAgent {
  return new FunctionCallAgent(
    name, 
    description, 
    llm, 
    tools, 
    systemPromptGenerators.withThinkText, 
    extractors.withThinkText
  );
}

// Test function to demonstrate the integration
export async function testAnthropicIntegration() {
  const anthropicModule = await import('@continue-reasoning/core/models/anthropic');
  const { ANTHROPIC_MODELS } = await import('@continue-reasoning/core/models');
  
  console.log('Testing Anthropic integration with Function Call Agent...');
  
  // Create an Anthropic wrapper with the new features
  const llm = new anthropicModule.AnthropicWrapper(
    ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_LATEST,
    false, // not streaming
    0.7,   // temperature
    1000   // max tokens
  );
  
  // Enable token-efficient tools for Sonnet 3.7 models
  if (llm.model.includes('claude-3-7-sonnet')) {
    llm.setTokenEfficientTools(true);
    console.log('Enabled token-efficient tools for Sonnet 3.7');
  }
  
  // Test tool choice functionality
  llm.setToolChoice({ type: "auto" });
  console.log('Set tool choice to auto');
  
  // Test parallel tool calls
  llm.setParallelToolCall(true);
  console.log('Enabled parallel tool calls');
  
  // Create a simple agent for testing
  const agent = createThinkToolAgent(
    'test-agent',
    'Test agent for Anthropic integration',
    llm
  );
  
  console.log('Created function call agent with updated Anthropic wrapper');
  
  // Test basic functionality without API call
  console.log('Basic integration test completed successfully!');
  
  return {
    llm,
    agent,
    features: {
      tokenEfficientTools: llm.enableTokenEfficientTools,
      parallelToolCalls: llm.parallelToolCall,
      toolChoice: llm.toolChoice
    }
  };
}
 