import { BaseAgent } from "./base-agent.js";
import { AgentStep } from "./interfaces/index.js";
import { logger } from "./utils/logger.js";
import { 
    EventBus, 
    EventPublisher, 
    LLMEventMapper, 
    IEventBus 
} from "./event-bus/index.js";

/**
 * 具体的EventPublisher实现
 */
class AsyncAgentEventPublisher extends EventPublisher {}

/**
 * 异步 Agent - 基于事件驱动架构
 * 专门处理非流式LLM调用，替代传统的回调机制，使用事件总线进行组件间通信
 * 只支持callAsync，不处理callStream逻辑
 */
export class AsyncAgent extends BaseAgent {
    protected eventPublisher: AsyncAgentEventPublisher;
    private currentSessionId?: string;

    constructor(
        // 继承BaseAgent的所有构造参数
        id: string,
        name: string,
        description: string,
        maxSteps: number,
        promptProcessor: any,
        logLevel: any,
        agentOptions: any,
        contexts: any,
        eventBus?: IEventBus
    ) {
        super(id, name, description, maxSteps, promptProcessor, logLevel, agentOptions, contexts, eventBus);
        
        // 使用继承的eventBus
        this.eventPublisher = new AsyncAgentEventPublisher(this.eventBus, 'AsyncAgent');
        
        logger.info(`AsyncAgent ${this.id}: Initialized with event-driven architecture`);
    }

    /**
     * 启动Agent并设置会话
     */
    async startWithUserInput(
        userInput: string, 
        maxSteps: number, 
        sessionId?: string,
        options?: {
            savePromptPerStep?: boolean;
            promptSaveDir?: string;
            promptSaveFormat?: 'markdown' | 'json' | 'both';
        }
    ): Promise<void> {
        this.currentSessionId = sessionId || `session_${Date.now()}`;
        
        // 会话管理事件由 BaseAgent 统一发布，避免重复
        
        // 调用父类的启动逻辑，但不依赖回调
        await super.startWithUserInput(userInput, maxSteps, this.currentSessionId, options);
    }

    /**
     * 处理步骤 - 事件驱动版本（专注于异步调用）
     */
    protected async processStep(
        userInput: string,
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }> {
        // 步骤开始事件由 BaseAgent 统一发布，避免重复

        try {
            // 生成prompt
            const prompt = await this.promptProcessor.formatPrompt(stepIndex);
            logger.debug('Generated prompt', { length: prompt.length });

            // 获取工具定义
            const toolDefs = this.promptProcessor.enableToolCallsForStep(stepIndex)
                ? this.getActiveTools().map(tool => tool.toCallParams())
                : [];

            logger.debug('Tool calls enabled for step', { 
                stepIndex, 
                toolDefs: toolDefs.map(t => t.name) 
            });

            // 检查LLM是否支持异步调用
            if (!this.llm.callAsync || typeof this.llm.callAsync !== 'function') {
                throw new Error('AsyncAgentV2 requires LLM with callAsync support. Use StreamAgentV2 for streaming LLMs.');
            }

            // 执行异步调用
            await this.processAsyncResponse(prompt, toolDefs, stepIndex);
            
            // 等待 LLM 调用完成和工具执行完成
            let waitCount = 0;
            const maxWait = 300; // 30秒超时
            
            while ((!this.currentStepData || !this.currentStepData.isComplete) && waitCount < maxWait) {
                await new Promise(resolve => setTimeout(resolve, 100));
                waitCount++;
            }
            
            if (waitCount >= maxWait) {
                logger.warn(`[AsyncAgentV2] 步骤 ${stepIndex} 超时，强制继续`);
            }
            
            // 构建结果
            const rawText = this.currentStepData?.rawText || '';
            const toolCallsCount = this.currentStepData?.toolCalls?.length || 0;
            
            logger.debug(`[AsyncAgentV2] 步骤 ${stepIndex} 完成: 文本长度 ${rawText.length}, 工具调用 ${toolCallsCount} 个`);

            // 创建AgentStep
            const agentStep: AgentStep<any> = {
                stepIndex: stepIndex,
                rawText: rawText,
                toolCalls: this.currentStepData?.toolCalls?.map(call => ({
                    name: call.name,
                    call_id: call.call_id,
                    params: call.params
                })) || [],
                toolExecutionResults: this.currentStepData?.toolExecutionResults || []
            };

            // 事件发布由 BaseAgent 统一处理，避免重复发布

            return {
                continueProcessing: true,
                agentStep
            };

        } catch (error) {
            logger.error('Error in AsyncAgentV2 step:', error);

            // 步骤失败事件由 BaseAgent 统一发布，避免重复

            // add error to prompt
            this.promptProcessor.renderErrorToPrompt(
                error instanceof Error ? error.message : String(error), 
                stepIndex
            );

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
     * 处理异步响应 - 专注于批量处理和完整结果事件
     */
    private async processAsyncResponse(
        prompt: string,
        toolDefs: any[],
        stepIndex: number
    ): Promise<void> {
        const llmEvents = LLMEventMapper.createAsyncCallEvents(
            stepIndex,
            this.currentSessionId,
            'AsyncAgentV2'
        );

        // 发布LLM调用开始事件
        await this.eventBus.publish(llmEvents.started());

        try {
            logger.debug(`[AsyncAgentV2] 开始async异步处理步骤 ${stepIndex}`);

            // 初始化当前步骤数据容器
            this.currentStepData = {
                stepIndex,
                rawText: '',
                toolCalls: [],
                toolExecutionResults: [],
                toolExecutionPromises: [],
                isComplete: false
            };

            // 调用异步LLM方法
            const result = await this.llm.callAsync(prompt, toolDefs, { stepIndex });

            // 发布文本完成事件
            if (result.text) {
                this.currentStepData.rawText = result.text;
                await this.eventBus.publish(llmEvents.textCompleted(result.text));
            }

            // 发布工具调用完成事件并执行工具
            if (result.toolCalls && result.toolCalls.length > 0) {
                logger.debug(`[AsyncAgentV2] 开始执行 ${result.toolCalls.length} 个工具调用`);

                for (const toolCall of result.toolCalls) {
                    await this.eventBus.publish(llmEvents.toolCompleted(toolCall));
                    
                    // 添加工具调用到当前步骤
                    this.currentStepData.toolCalls!.push({
                        call_id: toolCall.call_id,
                        name: toolCall.name,
                        params: toolCall.parameters
                    });
                    
                    // 执行工具调用
                    const toolPromise = this.handleToolCallExecution(toolCall, stepIndex);
                    this.currentStepData.toolExecutionPromises.push(toolPromise);
                }

                // 等待所有工具调用完成
                if (this.currentStepData.toolExecutionPromises.length > 0) {
                    logger.debug(`[AsyncAgentV2] 等待 ${this.currentStepData.toolExecutionPromises.length} 个工具调用完成...`);
                    await Promise.all(this.currentStepData.toolExecutionPromises);
                    logger.debug(`[AsyncAgentV2] 所有工具调用已完成`);
                }
            }

            // 处理步骤完成
            await this.handleStepCompletion();

            // 发布LLM调用完成事件
            await this.eventBus.publish(llmEvents.completed(result));

            logger.debug(`[AsyncAgentV2] async异步处理完成步骤 ${stepIndex}`);

        } catch (error) {
            logger.error(`[AsyncAgentV2] async异步处理失败步骤 ${stepIndex}:`, error);
            
            await this.eventPublisher.publishErrorEvent(
                error instanceof Error ? error : new Error(String(error)),
                { stepIndex, prompt },
                this.currentSessionId,
                stepIndex
            );
            throw error;
        }
    }

    /**
     * 处理步骤完成 - 事件驱动版本
     */
    private async handleStepCompletion(): Promise<void> {
        if (!this.currentStepData) {
            return;
        }

        const { stepIndex, rawText, toolCalls } = this.currentStepData;
        
        logger.debug(`[AsyncAgentV2] 处理步骤 ${stepIndex} 完成: 文本长度 ${rawText?.length || 0}, 工具调用 ${toolCalls?.length || 0} 个`);
        
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
            
            logger.debug(`[AsyncAgentV2] 处理了 ${this.currentStepData.toolExecutionResults.length} 个工具调用结果`);
        }
        
        // 标记步骤完成
        this.currentStepData.isComplete = true;
        
        // 注意：这里不再通过回调发送步骤完成，而是在processStep中发布事件
        logger.debug(`[AsyncAgentV2] 步骤 ${stepIndex} 处理完成`);
    }

    /**
     * 执行工具调用并发布相关事件
     */
    private async handleToolCallExecution(
        toolCall: any,
        stepIndex: number
    ): Promise<void> {
        try {
            // 工具执行事件由 BaseAgent 统一发布，避免重复

            // 找到对应的工具
            const tool = this.getActiveTools().find(t => t.name === toolCall.name);
            if (!tool) {
                throw new Error(`Tool not found: ${toolCall.name}`);
            }

            // 执行工具调用（使用父类的工具执行器）
            const result = await this.toolExecutor.executeToolCall(
                toolCall,
                tool,
                this,
                this.eventBus, // 不再需要回调
                this.toolExecutionPriority
            );

            // 保存结果到当前步骤数据
            if (this.currentStepData) {
                if (!this.currentStepData.toolExecutionResults) {
                    this.currentStepData.toolExecutionResults = [];
                }
                this.currentStepData.toolExecutionResults.push(result);
            }

            // 工具执行完成和失败事件由 BaseAgent 统一发布，避免重复

        } catch (error) {
            // 工具执行失败事件由 BaseAgent 统一发布，避免重复

            // 重新抛出错误以保持原有的错误处理逻辑
            throw error;
        }
    }

    /**
     * 停止Agent并发布相关事件
     */
    stop(): void {
        super.stop();
        
        // 发布Agent停止事件
        this.eventPublisher.publishAgentEvent(
            'agent.stopped',
            this.currentStep || 0,
            this.currentSessionId,
            { reason: 'Manual stop requested' }
        ).catch(error => {
            logger.error('Failed to publish agent stopped event:', error);
        });
    }

    /**
     * 获取事件总线实例（用于外部订阅）
     */
    // getEventBus method is inherited from BaseAgent

    /**
     * 清理资源
     */
    dispose(): void {
        // 事件发布者和订阅者会在各自的组件中处理清理
        logger.info(`AsyncAgentV2 ${this.id}: Disposed`);
    }
} 