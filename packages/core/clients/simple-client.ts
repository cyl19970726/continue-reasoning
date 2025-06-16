import { logger } from "../utils/logger";
import { AgentStep, IClient, ISessionManager, ISessionManagerCallbacks, ToolCallParams, ToolExecutionResult } from "../interfaces";

/**
 * 简单的客户端实现
 * 用于基础的 Agent 交互，主要用于测试和简单场景
 */
export class SimpleClient implements IClient {
    name: string = 'simple-client';
    currentSessionId?: string;
    sessionManager?: ISessionManager;

    constructor(name?: string) {
        if (name) {
            this.name = name;
        }
    }

    /**
     * 设置会话管理器 - 依赖注入
     */
    setSessionManager(sessionManager: ISessionManager): void {
        this.sessionManager = sessionManager;
        
        // 设置回调
        sessionManager.setCallbacks({
            onAgentStep: (step) => this.handleAgentStep(step),
            onToolCall: (toolCall) => this.handleToolCall(toolCall),
            onToolCallResult: (result) => this.handleToolCallResult(result),
            onSessionStart: (sessionId) => {
                logger.info(`SimpleClient: Session started: ${sessionId}`);
            },
            onSessionEnd: (sessionId) => {
                logger.info(`SimpleClient: Session ended: ${sessionId}`);
            }
        });
    }

    /**
     * 处理 Agent 步骤事件
     */
    handleAgentStep(step: AgentStep<any>): void {
        logger.info(`SimpleClient handleAgentStep: Step ${step.stepIndex}`);
        
        // 处理思考内容
        if (step.extractorResult?.thinking) {
            logger.info(`Thinking: ${step.extractorResult.thinking}`);
        }

        // 处理最终答案
        if (step.extractorResult?.finalAnswer) {
            logger.info(`Final Answer: ${step.extractorResult.finalAnswer}`);
        }

        // 处理错误
        if (step.error) {
            logger.error(`Step Error: ${step.error}`);
        }
    }

    /**
     * 处理工具调用开始事件
     */
    handleToolCall(toolCall: ToolCallParams): void {
        logger.info(`SimpleClient handleToolCall: ${toolCall.name} (${toolCall.call_id})`);
        logger.debug(`Tool parameters:`, toolCall.parameters);
    }

    /**
     * 处理工具调用结果事件
     */
    handleToolCallResult(result: ToolExecutionResult): void {
        const status = result.status === 'succeed' ? '✅' : '❌';
        logger.info(`SimpleClient handleToolCallResult: ${status} ${result.name} (${result.call_id})`);
        
        if (result.status === 'succeed' && result.result) {
            logger.debug(`Tool result:`, result.result);
        } else if (result.status === 'failed' && result.message) {
            logger.error(`Tool error: ${result.message}`);
        }
    }

    /**
     * 发送消息给 Agent - 简化的方法签名
     */
    async sendMessageToAgent(message: string): Promise<void> {
        if (!this.sessionManager) {
            logger.error('SimpleClient: No session manager configured');
            return;
        }

        if (!this.currentSessionId) {
            logger.error('SimpleClient: No active session');
            return;
        }

        try {
            logger.info(`SimpleClient: Sending message to agent: "${message}"`);
            
            // 使用会话管理器发送消息
            await this.sessionManager.sendMessageToAgent(
                message, 
                10, // maxSteps
                this.currentSessionId
            );
            
            logger.info('SimpleClient: Message sent successfully');
        } catch (error) {
            logger.error(`SimpleClient: Failed to send message: ${error}`);
        }
    }

    /**
     * 创建新会话 - 简化的方法签名
     */
    newSession(): void {
        if (!this.sessionManager) {
            logger.error('SimpleClient: No session manager configured');
            return;
        }

        try {
            // 使用会话管理器创建新会话
            this.currentSessionId = this.sessionManager.createSession(
                'simple-user', // userId
                'simple-agent' // agentId
            );
            
            logger.info(`SimpleClient: New session created: ${this.currentSessionId}`);
        } catch (error) {
            logger.error(`SimpleClient: Failed to create session: ${error}`);
        }
    }

    /**
     * 获取当前状态信息
     */
    getStatus(): {
        name: string;
        hasSessionManager: boolean;
        currentSessionId?: string;
    } {
        return {
            name: this.name,
            hasSessionManager: !!this.sessionManager,
            currentSessionId: this.currentSessionId
        };
    }
}