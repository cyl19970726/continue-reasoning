import { 
    ITaskManager, 
    Task, 
    TaskResult, 
    TaskOptions, 
    IMultiAgent, 
    MultiAgentConfig, 
    DEFAULT_MULTI_AGENT_CONFIG,
    TaskExecutionError 
} from '../interfaces/multi-agent.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * 🎯 基础任务管理器
 * 
 * 职责：
 * - 任务创建和生命周期管理
 * - 任务状态跟踪
 * - 任务执行协调
 * - 简单的清理机制
 */
export class BasicTaskManager implements ITaskManager {
    private tasks = new Map<string, Task>();
    private activeTasks = new Map<string, Task>();
    private completedTasks = new Map<string, Task>();
    private failedTasks = new Map<string, Task>();
    private config: MultiAgentConfig;
    
    // 统计信息
    private stats = {
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0,
        cancelledTasks: 0
    };
    
    constructor(config?: Partial<MultiAgentConfig>) {
        this.config = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
        
        // 启动定期清理
        this.startCleanupTimer();
        
        logger.info('BasicTaskManager initialized');
    }
    
    // 任务生命周期管理
    createTask(agentId: string, description: string, options?: TaskOptions): Task {
        const task: Task = {
            id: uuidv4(),
            description,
            agentId,
            priority: options?.priority || 'medium',
            timeout: options?.timeout || this.config.defaultTimeout,
            context: options?.context,
            sessionId: options?.sessionId,
            createdAt: Date.now(),
            status: 'pending'
        };
        
        this.tasks.set(task.id, task);
        this.stats.totalTasks++;
        
        if (this.config.logTasks) {
            logger.info(`Task created: ${task.id} for agent ${agentId} - "${description}"`);
        }
        
        return task;
    }
    
    async executeTask(task: Task, agent: IMultiAgent): Promise<TaskResult> {
        const startTime = Date.now();
        
        try {
            if (this.config.logTasks) {
                logger.info(`Executing task ${task.id} on agent ${agent.id}`);
            }
            
            // 更新任务状态为运行中
            task.status = 'running';
            task.startedAt = startTime;
            this.activeTasks.set(task.id, task);
            
            // 设置超时处理
            const timeoutPromise = this.createTimeoutPromise(task);
            
            // 执行任务
            const executionPromise = agent.executeTask(task);
            
            // 等待任务完成或超时
            const result = await Promise.race([executionPromise, timeoutPromise]);
            
            // 更新任务状态为完成
            task.status = 'completed';
            task.completedAt = Date.now();
            this.activeTasks.delete(task.id);
            this.completedTasks.set(task.id, task);
            this.stats.completedTasks++;
            
            if (this.config.logTasks) {
                logger.info(`Task ${task.id} completed in ${Date.now() - startTime}ms`);
            }
            
            return result;
            
        } catch (error) {
            // 更新任务状态为失败
            task.status = 'failed';
            task.completedAt = Date.now();
            this.activeTasks.delete(task.id);
            this.failedTasks.set(task.id, task);
            this.stats.failedTasks++;
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Task ${task.id} failed: ${errorMessage}`);
            
            throw new TaskExecutionError(
                task.id,
                agent.id,
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }
    
    async cancelTask(taskId: string): Promise<boolean> {
        const task = this.activeTasks.get(taskId);
        if (!task) {
            return false; // 任务不存在或不在运行中
        }
        
        try {
            task.status = 'cancelled';
            task.completedAt = Date.now();
            this.activeTasks.delete(taskId);
            this.stats.cancelledTasks++;
            
            if (this.config.logTasks) {
                logger.info(`Task ${taskId} cancelled`);
            }
            
            return true;
        } catch (error) {
            logger.error(`Failed to cancel task ${taskId}:`, error);
            return false;
        }
    }
    
    // 任务查询
    getTask(taskId: string): Task | null {
        return this.tasks.get(taskId) || null;
    }
    
    getActiveTasks(): Task[] {
        return Array.from(this.activeTasks.values());
    }
    
    // 清理完成的任务
    cleanupCompletedTasks(olderThanMs: number = 24 * 60 * 60 * 1000): number {
        const cutoffTime = Date.now() - olderThanMs;
        let cleanedCount = 0;
        
        // 清理已完成的任务
        for (const [taskId, task] of Array.from(this.completedTasks.entries())) {
            if (task.completedAt && task.completedAt < cutoffTime) {
                this.completedTasks.delete(taskId);
                this.tasks.delete(taskId);
                cleanedCount++;
            }
        }
        
        // 清理失败的任务
        for (const [taskId, task] of Array.from(this.failedTasks.entries())) {
            if (task.completedAt && task.completedAt < cutoffTime) {
                this.failedTasks.delete(taskId);
                this.tasks.delete(taskId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} old tasks`);
        }
        
        return cleanedCount;
    }
    
    // 获取任务统计
    getStats() {
        return {
            ...this.stats,
            activeTasks: this.activeTasks.size,
            totalTasksInMemory: this.tasks.size
        };
    }
    
    // 私有方法
    private createTimeoutPromise(task: Task): Promise<TaskResult> {
        if (!task.timeout) {
            // 如果没有设置超时，返回一个永远不会resolve的Promise
            return new Promise(() => {});
        }
        
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Task ${task.id} timed out after ${task.timeout}ms`));
            }, task.timeout);
        });
    }
    
    private startCleanupTimer(): void {
        setInterval(() => {
            this.cleanupCompletedTasks();
        }, this.config.cleanupInterval);
    }
} 