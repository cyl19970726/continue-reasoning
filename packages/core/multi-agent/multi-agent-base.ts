import { BaseAgent, AgentOptions } from '../agent';
import { 
    IMultiAgent, 
    Task, 
    TaskResult, 
    AgentStatus,
    TaskExecutionError 
} from '../interfaces/multi-agent';
import { IContext } from '../interfaces';
import { LogLevel } from '../utils/logger';
import { logger } from '../utils/logger';
import { getCapabilityKeywords } from './utils';

/**
 * 🎯 多智能体基础类
 * 
 * 职责：
 * - 继承现有的BaseAgent功能
 * - 实现IMultiAgent接口
 * - 提供任务执行能力
 * - 管理并发任务
 */
export class MultiAgentBase extends BaseAgent implements IMultiAgent {
    public capabilities: string[] = [];
    public maxConcurrentTasks: number = 3;
    
    private currentTasks = new Map<string, Task>();
    private taskHistory: Array<{ taskId: string; result: TaskResult }> = [];
    
    constructor(
        id: string,
        name: string,
        description: string,
        capabilities: string[],
        maxSteps: number = 10,
        options?: {
            maxConcurrentTasks?: number;
            logLevel?: LogLevel;
            agentOptions?: AgentOptions;
            contexts?: IContext<any>[];
        }
    ) {
        // 验证智能体ID
        if (!id || id.trim() === '') {
            throw new Error('Agent ID cannot be empty');
        }
        
        // 调用父类构造函数，传递完整的参数
        super(
            id, 
            name, 
            description, 
            maxSteps,
            options?.logLevel,
            options?.agentOptions,
            options?.contexts
        );
        
        this.capabilities = capabilities;
        this.maxConcurrentTasks = options?.maxConcurrentTasks || 3;
        
        logger.info(`MultiAgentBase created: ${id} with capabilities [${capabilities.join(', ')}]`);
        
        // 如果提供了 contexts，记录一下
        if (options?.contexts && options.contexts.length > 0) {
            const contextIds = options.contexts.map(ctx => ctx.id).join(', ');
            logger.info(`MultiAgentBase ${id} initialized with contexts: [${contextIds}]`);
        }
    }
    
    // ===== IMultiAgent 接口实现 =====
    
    async executeTask(task: Task): Promise<TaskResult> {
        const startTime = Date.now();
        
        try {
            // 检查是否可以处理该任务
            if (!this.canHandleTask(task)) {
                const error = new Error(`Agent ${this.id} cannot handle task: ${task.description}`);
                return this.createFailureResult(task, error, startTime);
            }
            
            // 检查是否有足够的容量
            if (!this.isAvailable()) {
                const error = new Error(`Agent ${this.id} is at capacity (${this.currentTasks.size}/${this.maxConcurrentTasks})`);
                return this.createFailureResult(task, error, startTime);
            }
            
            // 添加到当前任务列表
            this.currentTasks.set(task.id, task);
            
            logger.info(`Agent ${this.id} executing task ${task.id}: "${task.description}"`);
            
            try {
                // 使用现有的BaseAgent功能执行任务
                const result = await this.executeTaskWithBaseAgent(task);
                
                // 移除已完成的任务
                this.currentTasks.delete(task.id);
                
                // 记录成功的任务历史
                const taskResult: TaskResult = {
                    taskId: task.id,
                    status: 'success',
                    result: result,
                    executionTime: Date.now() - startTime,
                    agentId: this.id
                };
                
                this.taskHistory.push({ taskId: task.id, result: taskResult });
                this.limitTaskHistory();
                
                logger.info(`Agent ${this.id} completed task ${task.id} in ${taskResult.executionTime}ms`);
                
                return taskResult;
                
            } catch (error) {
                // 移除失败的任务
                this.currentTasks.delete(task.id);
                
                const taskResult = this.createFailureResult(task, error as Error, startTime);
                this.taskHistory.push({ taskId: task.id, result: taskResult });
                this.limitTaskHistory();
                
                logger.error(`Agent ${this.id} failed task ${task.id}:`, error);
                
                return taskResult;
            }
            
        } catch (error) {
            // 确保任务被清理
            this.currentTasks.delete(task.id);
            
            const taskResult = this.createFailureResult(task, error as Error, startTime);
            logger.error(`Agent ${this.id} exception during task ${task.id}:`, error);
            
            return taskResult;
        }
    }
    
    canHandleTask(task: Task): boolean {
        try {
            // 基础检查：描述是否包含相关能力关键词
            const description = task.description.toLowerCase();
            
            // 如果没有设置特定能力，则不能处理任何任务
            if (this.capabilities.length === 0) {
                return false;
            }
            
            // 检查能力匹配
            for (const capability of this.capabilities) {
                const keywords = this.getCapabilityKeywords(capability);
                if (keywords.some(keyword => description.includes(keyword))) {
                    return true;
                }
            }
            
            // 如果包含通用关键词，也可以尝试处理
            const genericKeywords = ['help', 'assist', 'analyze', 'create', 'generate'];
            return genericKeywords.some(keyword => description.includes(keyword));
            
        } catch (error) {
            logger.error(`Error checking if task can be handled:`, error);
            return false;
        }
    }
    
    getAgentStatus(): AgentStatus {
        return {
            isAvailable: this.isAvailable(),
            currentTaskCount: this.currentTasks.size,
            maxConcurrentTasks: this.maxConcurrentTasks,
            capabilities: [...this.capabilities],
            lastActivity: Date.now()
        };
    }
    
    isAvailable(): boolean {
        return this.currentTasks.size < this.maxConcurrentTasks && !this.isRunning;
    }
    
    // ===== 私有方法 =====
    
    private async executeTaskWithBaseAgent(task: Task): Promise<any> {
        // 使用现有的BaseAgent功能来执行任务
        // 这里将task转换为BaseAgent可以理解的格式
        
        try {
            // 使用BaseAgent的startWithUserInput方法
            const sessionId = task.sessionId || `task-${task.id}`;
            
            await this.startWithUserInput(
                task.description,
                this.maxSteps,
                sessionId
            );
            
            // 返回执行结果 - 在实际实现中，这里应该从session中获取结果
            return {
                message: 'Task completed successfully',
                sessionId: sessionId,
                steps: this.maxSteps,
                context: task.context
            };
            
        } catch (error) {
            throw new TaskExecutionError(
                task.id,
                this.id,
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }
    
    private createFailureResult(task: Task, error: Error, startTime: number): TaskResult {
        return {
            taskId: task.id,
            status: 'error',
            error: error.message,
            executionTime: Date.now() - startTime,
            agentId: this.id
        };
    }
    
    private getCapabilityKeywords(capability: string): string[] {
        return getCapabilityKeywords(capability);
    }
    
    private limitTaskHistory(maxHistory: number = 100): void {
        if (this.taskHistory.length > maxHistory) {
            this.taskHistory = this.taskHistory.slice(-maxHistory);
        }
    }
    
    // ===== 公共工具方法 =====
    
    /**
     * 获取任务执行历史
     */
    getTaskHistory(limit?: number): Array<{ taskId: string; result: TaskResult }> {
        if (limit) {
            return this.taskHistory.slice(-limit);
        }
        return [...this.taskHistory];
    }
    
    /**
     * 获取当前正在执行的任务
     */
    getCurrentTasks(): Task[] {
        return Array.from(this.currentTasks.values());
    }
    
    /**
     * 强制取消特定任务
     */
    async cancelTask(taskId: string): Promise<boolean> {
        const task = this.currentTasks.get(taskId);
        if (!task) {
            return false;
        }
        
        try {
            this.currentTasks.delete(taskId);
            logger.info(`Agent ${this.id} cancelled task ${taskId}`);
            return true;
        } catch (error) {
            logger.error(`Agent ${this.id} failed to cancel task ${taskId}:`, error);
            return false;
        }
    }
} 