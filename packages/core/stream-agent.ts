import { BaseAgent } from "./base-agent.js";
import { AgentStep, LLMStreamChunk } from "./interfaces/index.js";
import { logger } from "./utils/logger.js";

/**
 * 流式 Agent - 使用流式调用和 stream 架构
 */
export class StreamAgent extends BaseAgent {
    
    /**
     * 处理步骤 - 流式实现
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

            // 使用流式调用
            await this.processStreamResponse(prompt, toolDefs, stepIndex);
            
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
     * 使用新的stream架构处理流式响应
     */
    private async processStreamResponse(
        prompt: string,
        toolDefs: any[],
        stepIndex: number
    ): Promise<void> {
        // 检查LLM是否支持新的stream方法
        if (!this.llm.callStream) {
            throw new Error('LLM does not support stream calling');
        }

        try {
            logger.debug(`[Agent] 开始stream流式处理步骤 ${stepIndex}`);
            
            // 使用stream架构处理流式响应
            for await (const chunk of this.llm.callStream(prompt, toolDefs, { stepIndex })) {
                await this.handleStreamChunk(chunk, stepIndex);
            }
            
            // 确保所有工具调用完成
            if (this.currentStepData && this.currentStepData.toolExecutionPromises.length > 0) {
                logger.debug(`[Agent] 等待步骤 ${stepIndex} 的 ${this.currentStepData.toolExecutionPromises.length} 个工具调用完成...`);
                await Promise.all(this.currentStepData.toolExecutionPromises);
                logger.debug(`[Agent] 步骤 ${stepIndex} 的所有工具调用已完成`);
            }
            
            logger.debug(`[Agent] stream流式处理完成步骤 ${stepIndex}`);
            
        } catch (error) {
            logger.error(`[Agent] stream流式处理失败步骤 ${stepIndex}:`, error);
            throw error;
        }
    }

    /**
     * 处理流式数据块
     */
    private async handleStreamChunk(chunk: LLMStreamChunk, stepIndex: number): Promise<void> {
        try {
            switch (chunk.type) {
                case 'step-start':
                    logger.debug(`[Agent] 步骤 ${stepIndex} 开始`);
                    break;
                
                case 'text-delta':
                    // 处理文本增量
                    this.callbacks?.onLLMTextDelta?.(stepIndex, chunk.chunkIndex || 0, chunk.content);
                    
                    // 更新当前步骤数据 - 累积增量文本
                    if (!this.currentStepData) {
                        this.currentStepData = {
                            stepIndex,
                            rawText: '',
                            toolCalls: [],
                            toolExecutionResults: [],
                            toolExecutionPromises: [],
                            isComplete: false
                        };
                    }
                    this.currentStepData.rawText += chunk.content;
                    break;
                
                case 'text-done':
                    // 处理完整文本 - text-complete包含完整的文本内容
                    this.callbacks?.onLLMTextDone?.(stepIndex, chunk.chunkIndex || 0, chunk.content);
                    
                    // 更新当前步骤数据 - 直接设置完整文本
                    if (!this.currentStepData) {
                        this.currentStepData = {
                            stepIndex,
                            rawText: chunk.content,
                            toolCalls: [],
                            toolExecutionResults: [],
                            toolExecutionPromises: [],
                            isComplete: false
                        };
                    } else {
                        // text-complete包含完整文本，直接替换而不是累积
                        this.currentStepData.rawText += chunk.content;
                    }
                    break;
                
                case 'tool-call-start':
                    // 处理工具调用开始
                    this.callbacks?.onToolCallStart?.(chunk.toolCall);
                    break;
                
                case 'tool-call-done':
                    // 处理工具调用完成
                    if (!this.currentStepData) {
                        this.currentStepData = {
                            stepIndex,
                            rawText: '',
                            toolCalls: [],
                            toolExecutionResults: [],
                            toolExecutionPromises: [],
                            isComplete: false
                        };
                    }
                    
                    // 添加工具调用到当前步骤（转换格式）
                    if (!this.currentStepData.toolCalls) {
                        this.currentStepData.toolCalls = [];
                    }
                    this.currentStepData.toolCalls.push({
                        call_id: chunk.toolCall.call_id,
                        name: chunk.toolCall.name,
                        params: chunk.toolCall.parameters
                    });
                    
                    // 执行工具调用（不等待，收集Promise）
                    const toolPromise = this.executeToolCall(chunk.toolCall, stepIndex);
                    this.currentStepData.toolExecutionPromises.push(toolPromise);
                    break;
                
                case 'tool-call-error':
                    logger.error(`[Agent] 工具调用错误:`, chunk.error);
                    this.callbacks?.onError?.(chunk.error);
                    break;
                
                case 'step-complete':
                    // 处理步骤完成
                    if (this.currentStepData) {
                        // 等待所有工具调用完成
                        if (this.currentStepData.toolExecutionPromises.length > 0) {
                            logger.debug(`[Agent] 等待 ${this.currentStepData.toolExecutionPromises.length} 个工具调用完成...`);
                            await Promise.all(this.currentStepData.toolExecutionPromises);
                            logger.debug(`[Agent] 所有工具调用已完成`);
                        }
                        
                        // 处理步骤完成
                        await this.handleStepCompletion();
                        
                        // 标记步骤完成
                        this.currentStepData.isComplete = true;
                    }
                    break;
                
                case 'error':
                    logger.error(`[Agent] 流式处理错误:`, chunk);
                    this.callbacks?.onError?.(chunk);
                    throw chunk;
                
                default:
                    logger.debug(`[Agent] 未处理的chunk类型: ${(chunk as any).type}`);
            }
        } catch (error) {
            logger.error(`[Agent] 处理chunk失败:`, error);
            throw error;
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
        
        console.log('>>>>>>currentStep<<<<<< /n', currentStep);
        // 发送步骤完成回调
        this.callbacks?.onAgentStep?.(currentStep);
        
        logger.debug(`[Agent] 步骤 ${stepIndex} 处理完成`);
    }
}