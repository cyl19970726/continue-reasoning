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
class StreamAgentEventPublisher extends EventPublisher {}

/**
 * 流式 Agent - 基于事件驱动架构
 * 专门处理流式LLM调用，替代传统的回调机制，使用事件总线进行组件间通信
 * 只支持callStream，不处理callAsync逻辑
 */
export class StreamAgent extends BaseAgent {
    protected eventPublisher: StreamAgentEventPublisher;
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
        this.eventPublisher = new StreamAgentEventPublisher(this.eventBus, 'StreamAgent');
        
        logger.info(`StreamAgent ${this.id}: Initialized with event-driven architecture`);
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
     * 处理步骤 - 事件驱动版本（专注于流式调用）
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
            // logger.debug('Generated prompt', {prompt});

            // 获取工具定义
            const toolDefs = this.promptProcessor.enableToolCallsForStep(stepIndex)
                ? this.getActiveTools().map(tool => tool.toCallParams())
                : [];

            logger.debug('Tool calls enabled for step', { 
                stepIndex, 
                toolDefs: toolDefs.map(t => t.name) 
            });

            // 检查LLM是否支持流式调用
            if (!this.llm.callStream || typeof this.llm.callStream !== 'function') {
                throw new Error('StreamAgentV2 requires LLM with callStream support. Use AsyncAgentV2 for non-streaming LLMs.');
            }

            // 执行流式调用
            let agentStep = await this.processStreamResponse(prompt, toolDefs, stepIndex);
            
           
            logger.debug('[StreamAgentV2] agentStep completed:', agentStep);
            // 事件发布由 BaseAgent 统一处理，避免重复发布

            return {
                continueProcessing: true,
                agentStep
            };

        } catch (error) {
            logger.error('Error in StreamAgentV2 step:', error);

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
     * 处理流式响应 - 专注于实时事件和增量更新
     */
    private async processStreamResponse(
        prompt: string,
        toolDefs: any[],
        stepIndex: number
    ): Promise<AgentStep<any>> {
        const llmEvents = LLMEventMapper.createStreamCallEvents(
            stepIndex,
            this.currentSessionId,
            'StreamAgentV2'
        );

        // 发布LLM调用开始事件
        await this.eventBus.publish(llmEvents.started());

        try {
            logger.debug(`[StreamAgentV2] 开始流式处理步骤 ${stepIndex}`);

            // 初始化当前步骤数据容器
            this.currentStepData = {
                stepIndex,
                rawText: '',
                toolCalls: [],
                toolExecutionResults: [],
                toolExecutionPromises: [],
                isComplete: false
            };

            // 调用流式LLM方法
            let chunkIndex = 0;
            for await (const chunk of this.llm.callStream(prompt, toolDefs, { stepIndex })) {
                try {
                    await this.handleStreamChunk(chunk, stepIndex, chunkIndex, llmEvents);
                    chunkIndex++;
                } catch (error) {
                    logger.error(`[StreamAgentV2] 处理流式chunk失败:`, error);
                }
            }

            // 处理步骤完成
            let currentStep = await this.handleStepCompletion();

            logger.debug(`[StreamAgentV2] 流式处理完成步骤 ${stepIndex}`);
            return currentStep;

        } catch (error) {
            logger.error(`[StreamAgentV2] 流式处理失败步骤 ${stepIndex}:`, error);
            
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
     * 处理流式数据块
     */
    private async handleStreamChunk(
        chunk: any,
        stepIndex: number,
        chunkIndex: number,
        llmEvents: any
    ): Promise<void> {
        if (!this.currentStepData) {
            logger.warn('[StreamAgentV2] currentStepData为空，忽略chunk');
            return;
        }

        // 使用LLMEventMapper转换chunk为事件
        const events = LLMEventMapper.convertChunkToEvents(chunk, stepIndex, this.currentSessionId, 'StreamAgentV2');
        
        for (const event of events) {
            await this.eventBus.publish(event);
            
            // 处理不同类型的事件
            switch (event.type) {
                case 'llm.text.delta':
                    // if (event.data?.content) {
                    //     this.currentStepData.rawText += event.data.content;
                    // }
                    break;
                    
                case 'llm.tool.call.started':
                    break;
                
                case 'llm.tool.call.completed':
                    if (event.data?.toolCall) {
                        // 添加工具调用到当前步骤
                        this.currentStepData.toolCalls!.push({
                            call_id: event.data.toolCall.call_id,
                            name: event.data.toolCall.name,
                            params: event.data.toolCall.parameters
                        });
                        
                        // 执行工具调用
                        const toolPromise = this.handleToolCallExecution(event.data.toolCall, stepIndex);
                        this.currentStepData.toolExecutionPromises.push(toolPromise);
                    }
                    break;

                case 'llm.text.completed':
                    // 流式文本完成，只标记文本完成状态
                    logger.debug('[[[llm.text.completed]]]', event.data.content);
                    this.currentStepData.rawText = event.data.content;
                    break;
            }
        }
    }

    /**
     * 处理步骤完成 - 事件驱动版本
     */
    private async handleStepCompletion(): Promise<AgentStep<any>> {
        if (!this.currentStepData) {
            throw new Error('[StreamAgentV2] handleStepCompletion: currentStepData is null');
        }

        const { stepIndex, rawText, toolCalls } = this.currentStepData;
        
        // 等待所有工具调用完成
        if (this.currentStepData.toolExecutionPromises.length > 0) {
            logger.debug(`[StreamAgentV2] 等待 ${this.currentStepData.toolExecutionPromises.length} 个工具调用完成...`);
            await Promise.all(this.currentStepData.toolExecutionPromises);
            logger.debug(`[StreamAgentV2] 所有工具调用已完成`);
        }
        
        logger.debug(`[StreamAgentV2] 处理步骤 ${stepIndex} 完成: 文本长度 ${rawText?.length || 0}, 工具调用 ${toolCalls?.length || 0} 个`);
        
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
        logger.debug('[StreamAgentV2] ExtractorResult:', extractorResult);
        currentStep.extractorResult = extractorResult;
        
        // 使用 PromptProcessor 处理步骤结果（文本部分+ToolResult）
        this.promptProcessor.processStepResult(currentStep);
        
        // 标记步骤完成
        this.currentStepData.isComplete = true;
        
        // 注意：这里不再通过回调发送步骤完成，而是在processStep中发布事件
        logger.debug(`[StreamAgentV2] 步骤 ${stepIndex} 处理完成`);

        return currentStep;
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
                this.eventBus,
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
        logger.info(`StreamAgentV2 ${this.id}: Disposed`);
    }
} 