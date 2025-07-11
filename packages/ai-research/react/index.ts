import { ILLM } from '@continue-reasoning/core';
import { IAgent, ITool, AgentResult, AgentStep } from '../interfaces.js';
import { SimpleXmlExtractor } from '../xml-extractor.js';
import { zodToJsonNostrict } from '@continue-reasoning/core';

export class ReactAgent implements IAgent {
  name: string;
  description: string;
  llm: ILLM;
  tools: ITool[];
  private maxIterations: number = 10;
  private xmlExtractor: SimpleXmlExtractor;

  constructor(name: string, description: string, llm: ILLM, tools: ITool[] = []) {
    this.name = name;
    this.description = description;
    this.llm = llm;
    this.tools = tools;
    this.xmlExtractor = new SimpleXmlExtractor();
  }

  async execute(prompt: string): Promise<AgentResult> {
    const steps: AgentStep[] = [];
    let iterations = 0;

    const toolsDescription = this.tools.map(tool => {
      // 使用 zodToJsonNostrict 将 Zod schema 转换为友好的 JSON 格式
      const paramSchema = zodToJsonNostrict(tool.params);
      const paramStr = JSON.stringify(paramSchema, null, 2);
      return `- ${tool.name}: ${tool.description}\n  参数格式: ${paramStr}`;
    }).join('\n');

    const systemPrompt = `你是一个调用工具的 Agent，以下是你可以调用的工具列表：

${toolsDescription}

在你进行任何工具调用之前请先进行思考。
<think> [你的思考内容，比如为了完成任务你要设计怎样的tool执行计划也可以是为什么接下来要进行以下工具的调用] </think> 

你可以按照以下格式进行工具调用: 
<tool name="[tool_name]"> [tool arguments using the schema as JSON] </tool>

同时需要注意我们的在一个回复里可以有多个<think>和多个<tool>。

当你有足够信息回答用户问题时，请使用：
<final_answer> [你的最终答案] </final_answer>

请根据用户问题进行思考和工具调用来获取必要信息，然后提供最终答案。`;

    // 打印完整的system prompt进行调试
    console.log('\n🔍 完整System Prompt:');
    console.log('==========================================');
    console.log(systemPrompt);
    console.log('==========================================\n');

    let conversation = `${systemPrompt}\n\n用户问题: ${prompt}`;

    try {
      while (iterations < this.maxIterations) {
        iterations++;
        
        console.log(`\n=== ReAct 迭代 ${iterations} ===`);
        
        // 调用 LLM（不传递工具定义，因为 ReAct 是文本驱动的）
        if (!this.llm) {
          throw new Error('LLM not initialized');
        }
        const response = await this.llm.callAsync(conversation, []);
        const responseText = response.text;
        
        console.log('LLM 响应:', responseText);

        // 创建当前步骤
        const currentStep: AgentStep = {
          content: responseText
        };

        // 使用 SimpleXmlExtractor 提取所有思考内容
        const thoughts = this.xmlExtractor.extractAll(responseText, 'think');
        if (thoughts.length > 0) {
          currentStep.thinking = thoughts.join('\n\n');
          console.log('思考过程:', thoughts);
        }

        // 使用 SimpleXmlExtractor 检查是否有最终答案
        const finalAnswerResult = this.xmlExtractor.extract(responseText, 'final_answer');
        if (finalAnswerResult.success && finalAnswerResult.content) {
          console.log('最终答案:', finalAnswerResult.content);
          currentStep.finalAnswer = finalAnswerResult.content;
          steps.push(currentStep);
          return {
            success: true,
            finalAnswer: finalAnswerResult.content,
            steps: steps
          };
        }

        // 提取并执行所有工具调用
        const toolMatches = responseText.match(/<tool name="([^"]+)">([\s\S]*?)<\/tool>/g);
        if (toolMatches && toolMatches.length > 0) {
          console.log(`发现 ${toolMatches.length} 个工具调用`);
          
          const toolCallsInfo: Array<{ tool: string; params: any; result: any }> = [];
          let allToolResults = '';

          for (const toolMatch of toolMatches) {
            const nameMatch = toolMatch.match(/<tool name="([^"]+)">/);
            const contentMatch = toolMatch.match(/<tool name="[^"]+">([\s\S]*?)<\/tool>/);
            
            if (!nameMatch || !contentMatch) {
              console.error('工具调用格式错误:', toolMatch);
              continue;
            }

            const toolName = nameMatch[1];
            const paramsStr = contentMatch[1].trim();

            try {
              const toolResult = await this.executeToolCall(toolName, paramsStr);
              console.log(`工具 ${toolName} 执行结果:`, toolResult);
              
              toolCallsInfo.push({
                tool: toolName,
                params: JSON.parse(paramsStr),
                result: toolResult
              });

              allToolResults += `工具 ${toolName} 执行结果: ${JSON.stringify(toolResult)}\n`;

            } catch (error) {
              const errorMsg = `工具 ${toolName} 执行失败: ${error instanceof Error ? error.message : String(error)}`;
              console.error(errorMsg);
              
              toolCallsInfo.push({
                tool: toolName,
                params: paramsStr,
                result: { error: errorMsg }
              });

              allToolResults += `工具 ${toolName} 执行错误: ${errorMsg}\n`;
            }
          }

          if (toolCallsInfo.length > 0) {
            currentStep.toolCalls = toolCallsInfo;
          }

          steps.push(currentStep);

          // 将工具结果添加到对话中
          conversation += `\n\n助手: ${responseText}`;
          conversation += `\n\n工具执行结果:\n${allToolResults}`;

        } else {
          // 没有工具调用，但也没有最终答案
          steps.push(currentStep);
          console.log('没有检测到工具调用或最终答案，继续对话');
          conversation += `\n\n助手: ${responseText}`;
        }
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

  private async executeToolCall(toolName: string, paramsStr: string): Promise<any> {
    const tool = this.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`未找到工具: ${toolName}`);
    }

    // 解析参数
    let params: any;
    try {
      params = JSON.parse(paramsStr);
    } catch (error) {
      throw new Error(`工具参数解析失败: ${paramsStr}. 错误: ${error instanceof Error ? error.message : String(error)}`);
    }

    // 验证参数
    try {
      const validatedParams = tool.params.parse(params);
      return await tool.execute_func(validatedParams);
    } catch (error) {
      throw new Error(`工具执行失败: ${error instanceof Error ? error.message : String(error)}`);
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
}

// 便捷函数
export function createReactAgent(
  name: string, 
  description: string, 
  llm: ILLM, 
  tools: ITool[] = []
): ReactAgent {
  return new ReactAgent(name, description, llm, tools);
} 