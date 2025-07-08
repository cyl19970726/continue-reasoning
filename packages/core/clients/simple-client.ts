import { logger } from "../utils/logger";
import { AgentStep, IClient, ISessionManager, ToolCallParams, ToolExecutionResult, ClientStatus, ClientType, AgentCallbacks, AgentStorage, ClientConfig } from "../interfaces";

/**
 * 简单的客户端实现
 * 用于基础的 Agent 交互，主要用于测试和简单场景
 */
export class SimpleClient implements IClient {
    name: string = 'simple-client';
    readonly type: ClientType = 'custom';
    currentSessionId?: string;
    sessionManager?: ISessionManager;
    agentCallbacks?: AgentCallbacks;
    private config: ClientConfig;

    constructor(name?: string, config?: ClientConfig) {
        if (name) {
            this.name = name;
        }
        
        // 默认配置
        this.config = {
            enableStreaming: false, // 默认非流式模式
            maxSteps: 10,
            ...config
        };
        
        // 设置默认的 agentCallbacks
        this.agentCallbacks = {
            onAgentStep: (step: AgentStep<any>) => {
                logger.info(`SimpleClient: Agent step ${step.stepIndex}`);
                
                // 处理思考内容
                if (step.extractorResult?.thinking) {
                    logger.info(`Thinking: ${step.extractorResult.thinking}`);
                }

                // 处理最终答案
                if (step.extractorResult?.response) {
                    logger.info(`Response: ${step.extractorResult.response}`);
                }

                // 处理错误
                if (step.error) {
                    logger.error(`Step Error: ${step.error}`);
                }
            },
            
            onToolCallStart: (toolCall: ToolCallParams) => {
                // 只在流式模式下启用
                if (this.isStreamingMode()) {
                    logger.info(`SimpleClient: Tool call started: ${toolCall.name} (${toolCall.call_id})`);
                    logger.debug(`Tool parameters:`, toolCall.parameters);
                }
            },
            
            onToolExecutionEnd: (result: ToolExecutionResult) => {
                const status = result.status === 'succeed' ? '✅' : '❌';
                logger.info(`SimpleClient: Tool execution ended: ${status} ${result.name} (${result.call_id})`);
                
                if (result.status === 'succeed' && result.result) {
                    logger.debug(`Tool result:`, result.result);
                } else if (result.status === 'failed' && result.message) {
                    logger.error(`Tool error: ${result.message}`);
                }
            },
            
            onSessionStart: (sessionId: string) => {
                logger.info(`SimpleClient: Session started: ${sessionId}`);
            },
            
            onSessionEnd: (sessionId: string) => {
                logger.info(`SimpleClient: Session ended: ${sessionId}`);
            },
            
            onError: (error: any) => {
                logger.error(`SimpleClient: Agent error: ${error.message || error}`);
            },
            
            loadAgentStorage: async (sessionId: string): Promise<AgentStorage | null> => {
                logger.info(`SimpleClient: Loading agent storage for session: ${sessionId}`);
                // SimpleClient 没有自定义存储逻辑，返回 null 让 SessionManager 使用本地存储
                return null;
            },
            
            // 流式模式专用回调
            onLLMTextDelta: (stepIndex: number, chunkIndex: number, delta: string) => {
                // 只在流式模式下启用
                if (this.isStreamingMode()) {
                    process.stdout.write(delta); // 实时显示
                }
            },
            
            onLLMTextDone: (stepIndex: number, chunkIndex: number, text: string) => {
                logger.info(`SimpleClient: LLM text completed for step ${stepIndex}, chunk ${chunkIndex}`);
            }
        };
    }

    /**
     * 检查是否为流式模式
     */
    isStreamingMode(): boolean {
        return this.config.enableStreaming === true;
    }

    /**
     * 设置 Agent 回调
     */
    setAgentCallbacks(callbacks: AgentCallbacks): void {
        this.agentCallbacks = callbacks;
        logger.info('SimpleClient: Agent callbacks set');
    }

    /**
     * 设置会话管理器 - 依赖注入
     */
    setSessionManager(sessionManager: ISessionManager): void {
        this.sessionManager = sessionManager;
        
        // 将客户端注册到 sessionManager
        sessionManager.setClient(this);
        
        logger.info('SimpleClient: Session manager set');
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
    getStatus(): ClientStatus {
        return {
            name: this.name,
            type: 'custom',
            isInitialized: !!this.sessionManager,
            isRunning: !!this.currentSessionId,
            hasSessionManager: !!this.sessionManager,
            currentSessionId: this.currentSessionId,
            messageCount: 0, // SimpleClient doesn't track messages
            lastActivity: undefined
        };
    }
}