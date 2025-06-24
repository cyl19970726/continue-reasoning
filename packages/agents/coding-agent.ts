import { BaseAgent, AgentOptions } from '../core/agent';
import { LogLevel } from '../core/utils/logger';
import { AnyTool, IContext, ToolCallResult } from '../core/interfaces';
import { IEventBus } from '../core/events/eventBus';
import { createCodingContext } from './contexts/coding';
import { createInteractiveContext } from './contexts/interaction';
import { logger } from '../core/utils/logger';
import { SnapshotManager } from './contexts/coding/snapshot/snapshot-manager';
import { ICodingContext } from './contexts/coding/coding-context';

/**
 * 🔧 编程专用智能体
 * 
 * 职责：
 * - 代码生成和编辑
 * - 项目结构管理
 * - 编程工具集成
 * - 开发环境管理
 * - 快照管理和版本控制
 */
export class CodingAgent extends BaseAgent {
    private workspacePath: string;
    private codingContext: ICodingContext;

    constructor(
        id: string,
        name: string,
        description: string,
        workspacePath: string,
        maxSteps: number = 20,
        logLevel?: LogLevel,
        agentOptions?: AgentOptions,
        contexts?: IContext<any>[],
    ) {

        // 创建coding context
        const codingContext = createCodingContext(workspacePath);
        
        super(
            id,
            name,
            description,
            maxSteps,
            logLevel,
            agentOptions,
            [...(contexts || []),codingContext],
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
            if (toolName.includes('file') || toolName.includes('code') || toolName.includes('edit') || toolName.includes('create') || toolName.includes('delete') || toolName.includes('Bash') || toolName.includes('Apply'))  {
                logger.debug(`Coding tool completed: ${toolName}`);
                logger.debug(`Coding tool result: ${JSON.stringify(toolResult)}`);
            }
        }
    }

    /**
     * 🔧 获取工作空间路径
     */
    getWorkspacePath(): string {
        return this.workspacePath;
    }

    /**
     * 🔧 获取快照管理器
     * 提供对快照系统的统一访问
     */
    getSnapshotManager(): SnapshotManager {
        return this.codingContext.getSnapshotManager();
    }

    /**
     * 🔧 设置新的工作空间
     */
    async setWorkspacePath(newPath: string): Promise<void> {
        this.workspacePath = newPath;
        
        // 重新初始化coding context
        const newCodingContext = createCodingContext(newPath);
        
        // 替换现有的coding context
        const contextIndex = this.contexts.findIndex(ctx => ctx.id === 'coding-context');
        if (contextIndex !== -1) {
            this.contexts[contextIndex] = newCodingContext as any;
            
            // 重新注册context
            this.contextManager.registerContext(newCodingContext as any);
        }
        
        logger.info(`Workspace changed to: ${newPath}`);
        
    }


} 