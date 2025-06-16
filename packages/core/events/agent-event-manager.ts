import { IEventBus } from './eventBus';
import { ToolCallParams, ToolExecutionResult, AgentStatus, AgentStep, StandardExtractorResult } from '../interfaces';
import { logger } from '../utils/logger';
// 导入预定义的事件结构体
import {
    AgentStepEvent,
    AgentStepStartEvent,
    ToolExecutionResultEvent,
    AgentStateChangeEvent,
    TaskQueueEvent,
    AgentReplyEvent,
    AgentThinkingEvent,
    AgentInternalEvent
} from './agentEvents';
import {
    ExecutionModeChangeRequestEvent,
    ExecutionModeChangeResponseEvent,
    UserMessageEvent,
    CrossComponentEvent
} from './crossEvents';

/**
 * Agent 事件管理器
 * 统一管理 Agent 生命周期和执行过程中的所有事件发布
 * 使用预定义的事件结构体确保类型安全和一致性
 */
export class AgentEventManager {
    private eventBus: IEventBus;
    private agentId: string;
    private sessionId: string;

    constructor(eventBus: IEventBus, agentId: string, sessionId?: string) {
        this.eventBus = eventBus;
        this.agentId = agentId;
        this.sessionId = sessionId || `agent-session-${agentId}`;
    }

    /**
     * 生成唯一事件ID
     */
    private generateEventId(): string {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * 更新会话ID
     */
    updateSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    /**
     * 获取当前会话ID
     */
    getSessionId(): string {
        return this.sessionId;
    }

    // ===== Agent 生命周期事件 =====

    /**
     * 发布 Agent 状态变更事件
     */
    async publishStateChange(
        fromState: AgentStatus, 
        toState: AgentStatus, 
        reason?: string,
        currentStep?: number
    ): Promise<void> {
        try {
            const event: AgentStateChangeEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'agent_state_change',
                payload: {
                    fromState,
                    toState,
                    reason,
                    currentStep: currentStep || 0
                }
            };

            await this.eventBus.publish(event);
            logger.debug(`Agent ${this.agentId} state: ${fromState} → ${toState}`);
        } catch (error) {
            logger.error('Failed to publish state change event:', error);
        }
    }

    /**
     * 发布 Agent 启动事件
     */
    async publishAgentStarted(userInput: string, maxSteps: number): Promise<void> {
        try {
            await this.publishCustomEvent('agent_started', {
                agentId: this.agentId,
                userInput,
                maxSteps
            });
        } catch (error) {
            logger.error('Failed to publish agent started event:', error);
        }
    }

    /**
     * 发布 Agent 停止事件
     */
    async publishAgentStopped(reason: 'completed' | 'user_request' | 'error' | 'max_steps', finalStep: number): Promise<void> {
        try {
            await this.publishCustomEvent('agent_stopped', {
                agentId: this.agentId,
                reason,
                finalStep
            });
        } catch (error) {
            logger.error('Failed to publish agent stopped event:', error);
        }
    }

    // ===== Agent 步骤执行事件 =====

    /**
     * 发布 Agent 步骤事件 (统一格式)
     */
    async publishAgentStep<T extends StandardExtractorResult = StandardExtractorResult>(
        agentStep: AgentStep<T>
    ): Promise<void> {
        try {
            const event: AgentStepEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'agent_step',
                payload: {
                    ...agentStep,
                    agentId: this.agentId,
                    action: agentStep.error ? 'error' : 'complete'
                }
            };

            await this.eventBus.publish(event);
            logger.debug(`Agent ${this.agentId} step ${agentStep.stepIndex} published`);
        } catch (error) {
            logger.error('Error publishing agent step event:', error);
        }
    }

    /**
     * 发布步骤开始事件
     */
    async publishStepStarted(stepIndex: number): Promise<void> {
        try {
            const event: AgentStepStartEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'agent_step_start',
                payload: {
                    stepIndex,
                    agentId: this.agentId
                }
            };

            await this.eventBus.publish(event);
            logger.debug(`Agent ${this.agentId} step ${stepIndex} started`);
        } catch (error) {
            logger.error('Failed to publish step started event:', error);
        }
    }

    /**
     * 发布步骤错误事件
     */
    async publishStepError(
        stepIndex: number, 
        error: Error
    ): Promise<void> {
        try {
            const agentStep: AgentStep = {
                stepIndex,
                error: error.message
            };

            // 直接调用 publishAgentStep，避免重复代码
            await this.publishAgentStep(agentStep);
            logger.debug(`Agent ${this.agentId} step ${stepIndex} error published`);
        } catch (err) {
            logger.error('Failed to publish step error event:', err);
        }
    }

    // ===== Agent 思考和回复事件 =====

    /**
     * 发布思考事件
     */
    async publishThinking(
        stepNumber: number,
        thinking: {
            analysis: string;
            plan: string;
            reasoning: string;
            nextAction: string;
        },
        toolCalls?: ToolCallParams[],
        rawThinking?: string
    ): Promise<void> {
        try {
            const event: AgentThinkingEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'agent_thinking',
                payload: {
                    stepNumber,
                    thinking,
                    toolCalls: toolCalls || [],
                    rawThinking
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish thinking event:', error);
        }
    }

    /**
     * 发布回复事件
     */
    async publishReply(
        content: string,
        replyType: 'text' | 'tool_result' | 'final_answer' = 'text',
        metadata?: {
            reasoning?: string;
            confidence?: number;
            stepNumber?: number;
            [key: string]: any;
        }
    ): Promise<void> {
        try {
            // 映射replyType到AgentReplyEvent的格式
            const mappedReplyType = replyType === 'tool_result' ? 'structured' : 
                                   replyType === 'final_answer' ? 'text' : 'text';

            const event: AgentReplyEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'agent_reply',
                payload: {
                    content,
                    replyType: mappedReplyType,
                    metadata
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish reply event:', error);
        }
    }

    // ===== 工具执行事件 =====

    /**
     * 发布工具执行开始事件
     */
    async publishToolExecutionStarted(
        toolName: string,
        callId: string,
        params: any,
        stepNumber: number
    ): Promise<void> {
        try {
            const event: ToolExecutionResultEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'tool_execution_result',
                payload: {
                    toolName,
                    callId,
                    success: false, // 开始时设为false，完成时更新
                    executionTime: 0
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish tool execution started event:', error);
        }
    }

    /**
     * 发布工具执行结果事件
     */
    async publishToolExecutionResult(
        toolName: string,
        callId: string,
        success: boolean,
        result?: any,
        error?: string,
        executionTime?: number,
        stepNumber?: number
    ): Promise<void> {
        try {
            const event: ToolExecutionResultEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'tool_execution_result',
                payload: {
                    toolName,
                    callId,
                    success,
                    result,
                    error,
                    executionTime: executionTime || 0
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish tool execution result event:', error);
        }
    }

    // ===== 任务队列事件 =====

    /**
     * 发布任务队列事件
     */
    async publishTaskQueue(
        action: 'add' | 'start' | 'complete' | 'error',
        taskId: string,
        taskType: 'processStep' | 'toolCall' | 'custom',
        priority?: number,
        error?: string
    ): Promise<void> {
        try {
            const event: TaskQueueEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'task_queue',
                payload: {
                    action,
                    taskId,
                    taskType,
                    priority,
                    error
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish task queue event:', error);
        }
    }

    // ===== 执行模式事件 =====

    /**
     * 发布执行模式变更请求事件
     */
    async publishExecutionModeChangeRequest(
        fromMode: 'auto' | 'manual' | 'supervised',
        toMode: 'auto' | 'manual' | 'supervised',
        reason?: string
    ): Promise<void> {
        try {
            const event: ExecutionModeChangeRequestEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'execution_mode_change_request',
                payload: {
                    requestId: this.generateEventId(),
                    fromMode,
                    toMode,
                    reason
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish execution mode change request event:', error);
        }
    }

    /**
     * 发布执行模式变更响应事件
     */
    async publishExecutionModeChangeResponse(
        requestId: string,
        mode: 'auto' | 'manual' | 'supervised',
        success: boolean,
        error?: string
    ): Promise<void> {
        try {
            const event: ExecutionModeChangeResponseEvent = {
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: 'execution_mode_change_response',
                payload: {
                    requestId,
                    mode,
                    timestamp: Date.now(),
                    success,
                    error
                }
            };

            await this.eventBus.publish(event);
        } catch (error) {
            logger.error('Failed to publish execution mode change response event:', error);
        }
    }

    /**
     * 发布执行模式变更事件（向后兼容）
     */
    async publishExecutionModeChange(
        fromMode: 'auto' | 'manual' | 'supervised',
        toMode: 'auto' | 'manual' | 'supervised',
        reason?: string
    ): Promise<void> {
        // 发布请求和响应事件
        await this.publishExecutionModeChangeRequest(fromMode, toMode, reason);
        await this.publishExecutionModeChangeResponse(
            this.generateEventId(),
            toMode,
            true
        );
    }

    // ===== 通用事件发布方法 =====

    /**
     * 发布自定义事件
     */
    async publishCustomEvent(eventType: string, payload: any): Promise<void> {
        try {
            await this.eventBus.publish({
                id: this.generateEventId(),
                timestamp: Date.now(),
                source: 'agent',
                sessionId: this.sessionId,
                type: eventType as any,
                payload: {
                    agentId: this.agentId,
                    ...payload
                }
            } as any);
        } catch (error) {
            logger.error(`Failed to publish custom event ${eventType}:`, error);
        }
    }

    // ===== 批量事件处理 =====

    /**
     * 批量发布多个事件
     */
    async publishBatch(events: Array<{
        type: string;
        payload: any;
    }>): Promise<void> {
        const promises = events.map(event => 
            this.publishCustomEvent(event.type, event.payload)
        );
        
        try {
            await Promise.allSettled(promises);
        } catch (error) {
            logger.error('Failed to publish batch events:', error);
        }
    }
} 