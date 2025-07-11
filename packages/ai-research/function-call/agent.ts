import { ILLM } from '@continue-reasoning/core';
import { IAgent, ITool, AgentResult, AgentStep as IAgentStep, ToolCallDefinition } from '../interfaces.js';
import { quickExtract } from '../xml-extractor.js';
import { logger } from '../utils/logger.js';

// 导入 PromptProcessor 相关类型
type ChatMessage = {
    role: 'user' | 'agent';
    step: number;
    content: string;
    timestamp: string;
}

type ToolCallResult = {
  name: string,
  call_id: string,
  params: any,
  status: 'pending' |  'succeed' | 'failed',
  result?: any,
  message?: string, // record error or success message
}

type ToolCall = {
    name: string,
    call_id: string,
    params: any,
}

type AgentStep = {
    stepIndex: number;
    rawText?: string;
    error?: string;
    toolCalls?: Array<ToolCall>;
    toolCallResults?: Array<ToolCallResult>;
    extractorResult?: any;
}       

function formatToIAgentStep(step: AgentStep, promptProcessor: PromptProcessor<any>): IAgentStep {
    const extractorResult = promptProcessor.textExtractor(step.rawText || '');
    let think = '';
    let finalAnswer = '';
    if (extractorResult) {
        think = extractorResult.thinking || '';
        finalAnswer = extractorResult.finalAnswer || '';
    }
    return {
        content: step.rawText || '',
        thinking: think,
        finalAnswer: finalAnswer,
        toolCalls: step.toolCallResults?.map(call => ({
            tool: call.name,
            params: call.params,
            result: call.result
        })),
    }
}

abstract class PromptProcessor<ExtractorResult extends { finalAnswer?: string }> {
    systemPrompt: string = '';
    currentPrompt: string = '';
    chatMessagesHistory: ChatMessage[] = [];
    finalAnswer: string | null = null;
    enableToolCallsForStep: (stepIndex: number) => boolean = () => true;

    setEnableToolCallsForStep(enableToolCallsForStep: (stepIndex: number) => boolean): void {
        this.enableToolCallsForStep = enableToolCallsForStep;
    }

    abstract textExtractor(responseText: string): ExtractorResult;
    abstract renderExtractorResultToPrompt(extractorResult: ExtractorResult, stepIndex: number): void;

    abstract renderChatMessageToPrompt(messages: ChatMessage[]): void;  
    abstract renderToolCallToPrompt(toolResults: ToolCallResult[], stepIndex: number): void;

    resetFinalAnswer(): void {
        this.finalAnswer = null;
    }
    setFinalAnswer(finalAnswer: string): void {
        this.finalAnswer = finalAnswer;
    }
    getFinalAnswer(): string | null {
        return this.finalAnswer;
    }

    abstract formatPrompt(stepIndex: number):string;
    processStepResult(step: AgentStep): void {
        let extractorResult = this.textExtractor(step.rawText || ''); 
        logger.debug("ExtractorResult", extractorResult);
        if (extractorResult) {
            this.renderExtractorResultToPrompt(extractorResult, step.stepIndex); 
            if (extractorResult.finalAnswer) {
                this.setFinalAnswer(extractorResult.finalAnswer);
            }
        }

        logger.debug("ToolCallResults", step.toolCallResults);
        this.renderToolCallToPrompt(step.toolCallResults || [], step.stepIndex);
    }
}


/**
 * 模块化的 FunctionCall Agent
 * 使用 PromptProcessor 进行步骤感知的提示管理
 */
export class ModularFunctionCallAgent implements IAgent {
  name: string;
  description: string;
  llm: ILLM;
  tools: ITool[];
  private maxStep: number = 10;
  private promptProcessor: PromptProcessor<any>;

  constructor(
    name: string, 
    description: string, 
    llm: ILLM, 
    tools: ITool[] = [],
    promptProcessor: PromptProcessor<any>
  ) {
    this.name = name;
    this.description = description;
    this.llm = llm;
    this.tools = tools;
    this.promptProcessor = promptProcessor;
    
    logger.info(`Initialized ModularFunctionCallAgent: ${name}`, {
      description,
      toolsCount: tools.length,
      tools: tools.map(t => t.name)
    });
  }

  async execute(user_message: string): Promise<AgentResult> {
    logger.info(`Starting agent execution`, { userMessage: user_message });
    
    // 将 string 转换为 ChatMessage
    const userMessage: ChatMessage = {
      role: 'user',
      step: 0,
      content: user_message,
      timestamp: new Date().toISOString()
    };

    // 添加用户消息到聊天历史
    this.promptProcessor.chatMessagesHistory.push(userMessage);

    const steps: AgentStep[] = [];
    let stepIndex = 0;

    try {
      while (stepIndex < this.maxStep) {
        
        logger.info(`=== STEP_${stepIndex} ===`);
        
        // 调用 LLM，传递工具定义让 LLM 自己决定是否调用
        const prompt = this.promptProcessor.formatPrompt(stepIndex);
        logger.debug('Generated prompt', { length: prompt.length, preview: prompt.substring(0, 200) + '...' });
        logger.debug('Available tools', this.tools.map(t => t.name));
        
        let toolDefs = this.tools.map(tool => tool.toCallDefinition());
        if (!this.promptProcessor.enableToolCallsForStep(stepIndex)) {

            toolDefs = [];
        }
        logger.debug('Tool definitions count', toolDefs.length);
        
        try {
          logger.info('Calling LLM...');
          if (!this.llm) {
            throw new Error('LLM not initialized');
          }
          const llmResponse = await this.llm.callAsync(prompt, toolDefs);
          logger.info('LLM response received', {
            textLength: llmResponse.text?.length || 0,
            toolCallsCount: llmResponse.toolCalls?.length || 0
          });
          
          const responseText = llmResponse.text;
          const toolCalls = llmResponse.toolCalls || [];

          // 创建当前轮次的步骤
          const currentStep: AgentStep = {
              stepIndex: stepIndex,
              rawText: responseText,
              toolCalls: toolCalls.map(call => ({
                name: call.name,
                call_id: call.call_id,
                params: call.parameters
              })),
              toolCallResults: []
            };

          // 执行工具调用
          const toolResults: ToolCallResult[] = [];
          
          for (const toolCall of toolCalls) {
            const tool = this.tools.find(t => t.name === toolCall.name);
            
            if (!tool) {
              const errorMsg = `未找到工具: ${toolCall.name}`;
              logger.error(errorMsg);
              const errorResult: ToolCallResult = { 
                name: toolCall.name,
                call_id: toolCall.call_id || `${toolCall.name}_${Date.now()}`,
                params: toolCall.parameters,
                status: 'failed',
                message: errorMsg
              };
              toolResults.push(errorResult);
              continue;
            }

            try {
              logger.info(`Executing tool: ${tool.name}`, toolCall.parameters);
              
              const toolResult = await tool.execute_func(toolCall.parameters);
              logger.debug('Tool result', { tool: tool.name, result: toolResult });
              
              const toolCallResult: ToolCallResult = {
                name: tool.name,
                call_id: toolCall.call_id || `${tool.name}_${Date.now()}`,
                params: toolCall.parameters,
                status: 'succeed',
                result: toolResult
              };
              
              toolResults.push(toolCallResult);

            } catch (error) {
              const errorMsg = `工具执行失败: ${error instanceof Error ? error.message : String(error)}`;
              logger.error(errorMsg, { tool: tool.name, params: toolCall.parameters, error });
              
              const errorResult: ToolCallResult = {
                name: tool.name,
                call_id: toolCall.call_id || `${tool.name}_${Date.now()}`,
                params: toolCall.parameters,
                status: 'failed',
                message: errorMsg
              };
              toolResults.push(errorResult);
            }
          }

          currentStep.toolCallResults = toolResults;
          steps.push(currentStep);
          
          this.promptProcessor.processStepResult(currentStep);

          if (this.promptProcessor.getFinalAnswer()) {
            logger.info('Final answer reached', { finalAnswer: this.promptProcessor.getFinalAnswer() });
            return {
              success: true,
              finalAnswer: this.promptProcessor.getFinalAnswer() || '',
              steps: steps.map(step => formatToIAgentStep(step, this.promptProcessor))
            };
          }
        } catch (error) {
          logger.error('LLM call failed', error);
          throw error;
        }

        stepIndex++;
      }

      logger.warn(`Reached maximum iterations (${this.maxStep})`);
      return {
        success: false,
        error: `达到最大迭代次数 (${this.maxStep}) 或收到停止信号`,
        steps: steps.map(step => formatToIAgentStep(step, this.promptProcessor))
      };

    } catch (error) {
      logger.error('Agent execution failed', error);
      return {
        success: false,
        error: `执行过程中出错: ${error instanceof Error ? error.message : String(error)}`,
        steps: steps.map(step => formatToIAgentStep(step, this.promptProcessor))
      };
    }
  }

  addTool(tool: ITool): void {
    if (!this.tools.find(t => t.name === tool.name)) {
      this.tools.push(tool);
      logger.info(`Added tool: ${tool.name}`);
    }
  }

  removeTool(toolName: string): void {
    this.tools = this.tools.filter(t => t.name !== toolName);
    logger.info(`Removed tool: ${toolName}`);
  }

  setMaxIterations(max: number): void {
    this.maxStep = max;
    logger.info(`Set max iterations to: ${max}`);
  }

  // 动态设置 PromptProcessor
  setPromptProcessor(promptProcessor: PromptProcessor<any>): void {
    this.promptProcessor = promptProcessor;
    logger.info('PromptProcessor updated');
  }

  // 获取当前的 PromptProcessor
  getPromptProcessor(): PromptProcessor<any> {
    return this.promptProcessor;
  }

  // 停止 Agent 执行
  stop(): void {
    this.promptProcessor.setFinalAnswer("[Agent.stop]the agent stopped by calling Agent.stop()");
    logger.info('Agent stopped');
  }

  // 重置 Agent 状态
  reset(): void {
    this.promptProcessor.setFinalAnswer('null');
    this.promptProcessor.chatMessagesHistory = [];
    logger.info('Agent reset');
  }

  // 获取执行历史
  getExecutionHistory(): {
    extractorResults: any[];
    toolCalls: ToolCall[];
    toolCallResults: ToolCallResult[];
    chatMessages: ChatMessage[];
  } {
    return {
      extractorResults: [],
      toolCalls: [],
      toolCallResults: [],
      chatMessages: this.promptProcessor.chatMessagesHistory
    };
  }
}

export class DefaultPromptProcessor extends PromptProcessor<{ thinking?: string, finalAnswer?: string }> {
  constructor(systemPrompt: string) {
    super();
    this.systemPrompt = systemPrompt || `你是一个智能助手，能够调用工具来完成任务。

请根据用户问题进行思考，并决定是否需要调用工具。

如果是最后一次回答用户请使用以下格式：
<final_answer> 你的回答 </final_answer>`;
  }


  textExtractor(responseText: string): { thinking?: string, finalAnswer?: string } {
    const thinking = quickExtract(responseText, 'think');
    const finalAnswer = quickExtract(responseText, 'final_answer');
    return { 
      thinking: thinking, 
      finalAnswer: finalAnswer 
    };
  }
  
  resetFinalAnswer(): void {
      this.finalAnswer = null;
  }
  setFinalAnswer(finalAnswer: string): void {
      this.finalAnswer = finalAnswer;
  }
  getFinalAnswer(): string | null {
      return this.finalAnswer;
  }
  
  renderChatMessageToPrompt(messages: ChatMessage[]): void {
    this.chatMessagesHistory.push(...messages);
  }

  renderExtractorResultToPrompt(extractorResult: { thinking?: string, finalAnswer?: string }, stepIndex: number): void {
    if (extractorResult) {
      if (extractorResult.thinking) {
        this.chatMessagesHistory.push({
          role: 'agent',
          step: stepIndex,
          content: `<think> ${extractorResult.thinking} </think>`,
          timestamp: new Date().toISOString()
        });
      }
      if (extractorResult.finalAnswer) {
        this.chatMessagesHistory.push({
          role: 'agent',
          step: stepIndex,
          content: `<final_answer> ${extractorResult.finalAnswer} </final_answer>`,
          timestamp: new Date().toISOString()
        });
        this.setFinalAnswer(extractorResult.finalAnswer);
      }
    }
  }
  
  renderToolCallToPrompt(toolResults: ToolCallResult[], stepIndex: number): void {
    const toolResultsText = toolResults.map((result, index) => 
    `
    <tool_call_result name="${result.name}" call_id="${result.call_id}">
     params=${JSON.stringify(result.params)} result=${JSON.stringify(result.result)} status=${result.status} message=${result.message}
    </tool_call_result>
    `
    ).join('\n');
    this.chatMessagesHistory.push({
      role: 'agent',
      step: stepIndex,
      content: toolResultsText,
      timestamp: new Date().toISOString()
    });
  }

  formatPrompt(stepIndex: number): string {
    let prompt = this.systemPrompt + '\n ## Chat History List \n';
    this.chatMessagesHistory.forEach(message => {
      prompt += `\n
      <chat_history>
      step: ${message.step}
      timestamp: ${message.timestamp}
      ${message.role}: ${message.content}
      </chat_history>
      `;
    });
    return prompt;
  }
}



// 导出类型
export type { PromptProcessor, ChatMessage, ToolCall, ToolCallResult }; 