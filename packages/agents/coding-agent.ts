import { BaseAgent, AgentOptions, AgentState } from '../core/agent';
import { LogLevel } from '../core/utils/logger';
import { IContext, ToolCallResult } from '../core/interfaces';
import { IEventBus } from '../core/events/eventBus';
import { createCodingContext } from './contexts/coding';
import { createInteractiveContext } from './contexts/interaction';
import { logger } from '../core/utils/logger';

/**
 * 🔧 编程专用智能体
 * 
 * 职责：
 * - 代码生成和编辑
 * - 项目结构管理
 * - 编程工具集成
 * - 开发环境管理
 */
export class CodingAgent extends BaseAgent {
    private workspacePath: string;
    private codingContext: IContext<any>;

    constructor(
        id: string,
        name: string,
        description: string,
        workspacePath: string,
        maxSteps: number = 20,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions,
        contexts?: IContext<any>[],
        eventBus?: IEventBus
    ) {
        // 创建coding context
        const codingContext = createCodingContext(workspacePath);
        
        // 🆕 创建 interactive context 以提供 requestApproval 和 requestUserInput 功能
        const interactiveContext = createInteractiveContext();
        
        super(
            id,
            name,
            description,
            maxSteps,
            logLevel,
            agentOptions,
            contexts,
            eventBus
        );
        
        this.workspacePath = workspacePath;
        this.codingContext = codingContext;
        
        logger.info(`CodingAgent initialized with workspace: ${workspacePath}`);
    }

    /**
     * 🆕 生命周期钩子 - 启动前准备
     */
    async beforeStart(): Promise<void> {
        logger.info(`CodingAgent preparing workspace: ${this.workspacePath}`);
        
        // 确保工作空间存在
        const fs = await import('fs');
        if (!fs.existsSync(this.workspacePath)) {
            fs.mkdirSync(this.workspacePath, { recursive: true });
            logger.info(`Created workspace directory: ${this.workspacePath}`);
        }
        
        // 订阅执行模式变更事件
        this.subscribeToExecutionModeChanges();
        
        // 可以在这里添加其他编程环境准备工作
        // 例如：检查依赖、初始化git仓库等
    }

    /**
     * 🆕 生命周期钩子 - 停止后清理
     */
    async afterStop(): Promise<void> {
        logger.info('CodingAgent cleanup completed');
        // 可以在这里添加清理工作
        // 例如：保存工作状态、清理临时文件等
    }

    /**
     * 🆕 工具调用完成后的处理
     */
    async onToolCallComplete(toolResult: ToolCallResult): Promise<void> {
        // 处理编程相关的工具调用结果
        if (toolResult.type === 'function') {
            const toolName = toolResult.name;
            
            // 记录编程相关的工具使用
            if (toolName.includes('file') || toolName.includes('code') || toolName.includes('edit')) {
                logger.debug(`Coding tool completed: ${toolName}`);
                
                // 可以在这里添加代码质量检查、自动格式化等
                await this.postProcessCodeChange(toolResult);
            }
        }
    }

    /**
     * 🔧 编程专用方法 - 代码变更后处理
     */
    private async postProcessCodeChange(toolResult: ToolCallResult): Promise<void> {
        try {
            // 这里可以添加：
            // 1. 代码格式化
            // 2. 语法检查
            // 3. 自动测试
            // 4. Git提交
            logger.debug('Post-processing code changes...');
            
            // 发布代码变更事件
            if (this.eventBus) {
                await this.publishEvent('code_change', {
                    toolName: toolResult.name,
                    workspace: this.workspacePath,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            logger.error('Error in post-processing code changes:', error);
        }
    }

    /**
     * 🔧 获取工作空间路径
     */
    getWorkspacePath(): string {
        return this.workspacePath;
    }

    /**
     * 🔧 设置新的工作空间
     */
    async setWorkspacePath(newPath: string): Promise<void> {
        this.workspacePath = newPath;
        
        // 重新初始化coding context
        const newCodingContext = createCodingContext(newPath);
        
        // 替换现有的coding context
        const contextIndex = this.contexts.findIndex(ctx => ctx.id === this.codingContext.id);
        if (contextIndex !== -1) {
            this.contexts[contextIndex] = newCodingContext as any;
            this.codingContext = newCodingContext;
            
            // 重新注册context
            this.contextManager.registerContext(newCodingContext as any);
        }
        
        logger.info(`Workspace changed to: ${newPath}`);
        
        // 发布工作空间变更事件
        if (this.eventBus) {
            await this.publishEvent('workspace_change', {
                oldPath: this.workspacePath,
                newPath: newPath,
                timestamp: Date.now()
            });
        }
    }

    /**
     * 🔧 编程Agent专用 - 订阅执行模式变更
     */
    subscribeToExecutionModeChanges(): void {
        if (!this.eventBus) return;

        this.eventBus.subscribe('execution_mode_change_request', async (event: any) => {
            const { toMode, fromMode, reason, requestId } = event.payload;
            
            logger.info(`CodingAgent received execution mode change request: ${fromMode} -> ${toMode} (${reason || 'No reason provided'})`);
            
            try {
                // 更新Agent的执行模式
                this.executionMode = toMode;
                
                logger.info(`CodingAgent execution mode updated to: ${this.executionMode}`);
                
                // 发送响应事件
                if (this.eventBus && requestId) {
                    await this.eventBus.publish({
                        type: 'execution_mode_change_response',
                        source: 'agent',
                        sessionId: event.sessionId,
                        payload: {
                            requestId,
                            mode: toMode,
                            timestamp: Date.now(),
                            success: true,
                            agentType: 'coding'
                        }
                    });
                }
            } catch (error) {
                logger.error(`Failed to change execution mode: ${error}`);
                
                // 发送失败响应
                if (this.eventBus && requestId) {
                    await this.eventBus.publish({
                        type: 'execution_mode_change_response',
                        source: 'agent',
                        sessionId: event.sessionId,
                        payload: {
                            requestId,
                            mode: fromMode, // 保持原模式
                            timestamp: Date.now(),
                            success: false,
                            error: error instanceof Error ? error.message : String(error),
                            agentType: 'coding'
                        }
                    });
                }
            }
        });
    }

} 