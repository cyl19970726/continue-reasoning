import { BaseAgent } from "./base-agent.js";
import { AgentStep } from "./interfaces/index.js";
import { logger } from "./utils/logger.js";

/**
 * 非流式 Agent - 使用传统的非流式调用
 */
export class NoStreamAgent extends BaseAgent {
    
    /**
     * 处理步骤 - 非流式实现
     */
    protected async processStep(
        userInput: string, // Currently unused but may be needed for future processing
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }> {
        try {
            // 生成 prompt
            const prompt = await this.promptProcessor.formatPrompt(stepIndex);
            logger.debug('Generated prompt', { length: prompt.length });

            // 获取工具定义
            const toolDefs = this.promptProcessor.enableToolCallsForStep(stepIndex)
                ? this.getActiveTools().map(tool => tool.toCallParams())
                : [];

            logger.debug('Tool calls enabled for step', { stepIndex, toolDefs: toolDefs.map(t => t.name) });

            // 使用非流式调用
            await this.processNonStreamResponse(prompt, toolDefs, stepIndex);
            
            // 等待 LLM 调用完成和工具执行完成
            let waitCount = 0;
            const maxWait = 300; // 30秒超时
            
            while ((!this.currentStepData || !this.currentStepData.isComplete) && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            if (waitCount >= maxWait) {
                logger.warn(`[Agent] 步骤 ${stepIndex} 超时，强制继续`);
            }
            
            // 现在所有的步骤处理都在 handleStepCompletion 中完成
            const rawText = this.currentStepData?.rawText || '';
            const toolCallsCount = this.currentStepData?.toolCalls?.length || 0;
            
            logger.debug(`[Agent] 步骤 ${stepIndex} LLM 调用完成: 文本长度 ${rawText.length}, 工具调用 ${toolCallsCount} 个`);

            // 创建一个简化的 AgentStep 用于返回
            const simpleStep: AgentStep<any> = {
                stepIndex: stepIndex,
                rawText: rawText,
                toolCalls: [],
                toolExecutionResults: []
            };

            const continueProcessing = true;

            return {
                continueProcessing,
                agentStep: simpleStep
            };

        } catch (error) {
            logger.error('Error in prompt processor step:', error);

            // add error to prompt
            this.promptProcessor.renderErrorToPrompt(error instanceof Error ? error.message : String(error), stepIndex);

            // 创建错误步骤
            const errorStep: AgentStep = {
                stepIndex: stepIndex,
                error: error instanceof Error ? error.message : String(error)
            };

            return {
                continueProcessing: false,
                agentStep: errorStep
            };
        }
    }

    /**
     * 处理非流式响应
     */
    private async processNonStreamResponse(
        prompt: string,
        toolDefs: any[],
        stepIndex: number
    ): Promise<void> {
        // 检查LLM是否支持新的async方法
        if (this.llm.callAsync) {
            try {
                logger.debug(`[Agent] 开始async非流式处理步骤 ${stepIndex}`);
                
                // 初始化当前步骤数据容器
                this.currentStepData = {
                    stepIndex,
                    rawText: '',
                    toolCalls: [],
                    toolExecutionResults: [],
                    toolExecutionPromises: [],
                    isComplete: false
                };
                
                const result = await this.llm.callAsync(prompt, toolDefs, { stepIndex });
                
                // 处理文本结果
                if (result.text) {
                    this.currentStepData.rawText = result.text;
                    
                    // 发送文本完成回调
                    this.callbacks?.onLLMTextDone?.(stepIndex, 0, result.text);
                }
                
                // 处理工具调用
                if (result.toolCalls && result.toolCalls.length > 0) {
                    logger.debug(`[Agent] 开始执行 ${result.toolCalls.length} 个工具调用`);
                    
                    for (const toolCall of result.toolCalls) {
                        // 添加工具调用到当前步骤
                        this.currentStepData.toolCalls!.push({
                            call_id: toolCall.call_id,
                            name: toolCall.name,
                            params: toolCall.parameters
                        });
                        
                        // 执行工具调用（不等待，收集Promise）
                        const toolPromise = this.executeToolCall(toolCall, stepIndex);
                        this.currentStepData.toolExecutionPromises.push(toolPromise);
                    }
                    
                    // 等待所有工具调用完成
                    if (this.currentStepData.toolExecutionPromises.length > 0) {
                        logger.debug(`[Agent] 等待 ${this.currentStepData.toolExecutionPromises.length} 个工具调用完成...`);
                        await Promise.all(this.currentStepData.toolExecutionPromises);
                        logger.debug(`[Agent] 所有工具调用已完成`);
                    }
                }
                
                // 处理步骤完成
                await this.handleStepCompletion();
                
                logger.debug(`[Agent] async非流式处理完成步骤 ${stepIndex}`);
                
            } catch (error) {
                logger.error(`[Agent] async非流式处理失败步骤 ${stepIndex}:`, error);
                throw error;
            }
        } else {
            throw new Error('LLM does not support callAsync method');
        }
    }

    /**
     * 处理步骤完成
     */
    private async handleStepCompletion(): Promise<void> {
        if (!this.currentStepData) {
            return;
        }

        const { stepIndex, rawText, toolCalls } = this.currentStepData;
        
        logger.debug(`[Agent] 处理步骤 ${stepIndex} 完成: 文本长度 ${rawText?.length || 0}, 工具调用 ${toolCalls?.length || 0} 个`);
        
        // 创建 AgentStep
        const currentStep: AgentStep<any> = {
            stepIndex,
            rawText: rawText || '',
            toolCalls: toolCalls?.map(call => ({
                name: call.name,
                call_id: call.call_id,
                params: call.params
            })) || [],
            toolExecutionResults: this.currentStepData.toolExecutionResults || []
        };
        
        // 提取结果并处理文本内容
        const extractorResult = this.promptProcessor.textExtractor(rawText || '');
        currentStep.extractorResult = extractorResult;
        
        // 使用 PromptProcessor 处理步骤结果（文本部分）
        this.promptProcessor.processStepResult(currentStep);
        
        // 如果有工具调用结果，处理工具调用结果
        if (this.currentStepData.toolExecutionResults && this.currentStepData.toolExecutionResults.length > 0) {
            // 使用 PromptProcessor 处理工具调用结果
            this.promptProcessor.renderToolCallToPrompt(currentStep.toolExecutionResults, stepIndex);
            
            logger.debug(`[Agent] 处理了 ${this.currentStepData.toolExecutionResults.length} 个工具调用结果`);
        }
        
        // 发送步骤完成回调
        this.callbacks?.onAgentStep?.(currentStep);
        
        // 标记步骤完成
        this.currentStepData.isComplete = true;
        
        logger.debug(`[Agent] 步骤 ${stepIndex} 处理完成`);
    }
}