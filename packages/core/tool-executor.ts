import { ITaskQueue } from './taskQueue';
import { AnyTool, ToolCallParams, ToolExecutionResult, AgentCallbacks } from './interfaces';
import { logger } from './utils/logger';

export interface ToolExecutionTask {
    id: string;
    toolCall: ToolCallParams;
    tool: AnyTool;
    agent: any; // BaseAgent reference
    startTime: number;
    callbacks?: AgentCallbacks;
}

export interface ToolExecutorOptions {
    maxConcurrency?: number;
    defaultPriority?: number;
    enableParallelExecution?: boolean;
}

export class ToolExecutor {
    private taskQueue: ITaskQueue;
    private runningTasks: Map<string, ToolExecutionTask> = new Map();
    private completedTasks: Map<string, ToolExecutionResult> = new Map();
    private options: Required<ToolExecutorOptions>;

    constructor(taskQueue: ITaskQueue, options: ToolExecutorOptions = {}) {
        this.taskQueue = taskQueue;
        this.options = {
            maxConcurrency: options.maxConcurrency || 5,
            defaultPriority: options.defaultPriority || 5,
            enableParallelExecution: options.enableParallelExecution ?? true
        };
    }

    /**
     * 执行单个工具调用
     */
    async executeToolCall(
        toolCall: ToolCallParams,
        tool: AnyTool,
        agent: any,
        callbacks?: AgentCallbacks,
        priority?: number
    ): Promise<ToolExecutionResult> {
        const taskId = toolCall.call_id || `${tool.name}_${Date.now()}`;
        
        logger.debug(`[ToolExecutor] Queuing tool call: ${tool.name} (${taskId})`);
        
        const executionTask: ToolExecutionTask = {
            id: taskId,
            toolCall,
            tool,
            agent,
            startTime: Date.now(),
            callbacks
        };

        // 将工具执行任务添加到任务队列
        const result = await this.taskQueue.addToolCallTask(
            () => this.executeToolInternal(executionTask),
            priority || this.options.defaultPriority,
            taskId
        );

        return result;
    }

    /**
     * 批量执行多个工具调用
     */
    async executeToolCalls(
        toolCalls: ToolCallParams[],
        tools: AnyTool[],
        agent: any,
        callbacks?: AgentCallbacks,
        priority?: number
    ): Promise<ToolExecutionResult[]> {
        if (!this.options.enableParallelExecution) {
            // 串行执行
            const results: ToolExecutionResult[] = [];
            for (const toolCall of toolCalls) {
                const tool = tools.find(t => t.name === toolCall.name);
                if (tool) {
                    const result = await this.executeToolCall(toolCall, tool, agent, callbacks, priority);
                    results.push(result);
                } else {
                    results.push(this.createErrorResult(toolCall, `Tool ${toolCall.name} not found`));
                }
            }
            return results;
        }

        // 并行执行
        const executionPromises: Promise<ToolExecutionResult>[] = [];
        
        for (const toolCall of toolCalls) {
            const tool = tools.find(t => t.name === toolCall.name);
            if (tool) {
                const promise = this.executeToolCall(toolCall, tool, agent, callbacks, priority);
                executionPromises.push(promise);
            } else {
                // 立即返回错误结果
                executionPromises.push(
                    Promise.resolve(this.createErrorResult(toolCall, `Tool ${toolCall.name} not found`))
                );
            }
        }

        logger.debug(`[ToolExecutor] Executing ${executionPromises.length} tool calls in parallel`);
        
        // 等待所有工具执行完成
        const results = await Promise.allSettled(executionPromises);
        
        return results.map((result, index) => {
            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                logger.error(`[ToolExecutor] Tool execution failed:`, result.reason);
                return this.createErrorResult(
                    toolCalls[index], 
                    `Tool execution failed: ${result.reason?.message || result.reason}`
                );
            }
        });
    }

    /**
     * 内部工具执行方法
     */
    private async executeToolInternal(executionTask: ToolExecutionTask): Promise<ToolExecutionResult> {
        const { toolCall, tool, agent, callbacks, startTime } = executionTask;
        
        try {
            // 标记任务开始执行
            this.runningTasks.set(executionTask.id, executionTask);
            
            // 发布工具执行开始事件
            callbacks?.onToolExecutionStart?.(toolCall);
            
            logger.debug(`[ToolExecutor] Executing tool: ${tool.name} with params:`, toolCall.parameters);
            
            // 执行工具
            const result = await tool.execute(toolCall.parameters, agent);
            const executionTime = Date.now() - startTime;
            
            const toolCallResult: ToolExecutionResult = {
                name: tool.name,
                call_id: toolCall.call_id || executionTask.id,
                params: toolCall.parameters,
                status: 'succeed',
                result: result,
                executionTime
            };
            
            // 存储完成的任务
            this.completedTasks.set(executionTask.id, toolCallResult);
            
            // 发布工具执行结果事件
            callbacks?.onToolExecutionEnd?.(toolCallResult);
            
            logger.debug(`[ToolExecutor] Tool ${tool.name} completed successfully in ${executionTime}ms`);
            
            return toolCallResult;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const errorResult: ToolExecutionResult = {
                name: tool.name,
                call_id: toolCall.call_id || executionTask.id,
                params: toolCall.parameters,
                status: 'failed',
                message: error instanceof Error ? error.message : String(error),
                executionTime
            };
            
            // 存储失败的任务
            this.completedTasks.set(executionTask.id, errorResult);
            // 发布工具执行结果事件
            callbacks?.onToolExecutionEnd?.(errorResult);
            
            logger.error(`[ToolExecutor] Tool ${tool.name} failed:`, errorResult.message);
            
            return errorResult;
            
        } finally {
            // 清理运行中的任务
            this.runningTasks.delete(executionTask.id);
        }
    }

    /**
     * 创建错误结果
     */
    private createErrorResult(toolCall: ToolCallParams, message: string): ToolExecutionResult {
        return {
            name: toolCall.name,
            call_id: toolCall.call_id || `${toolCall.name}_${Date.now()}`,
            params: toolCall.parameters,
            status: 'failed',
            message,
            executionTime: 0
        };
    }

    /**
     * 获取任务状态
     */
    getTaskStatus(taskId: string): 'running' | 'completed' | 'not_found' {
        if (this.runningTasks.has(taskId)) {
            return 'running';
        }
        if (this.completedTasks.has(taskId)) {
            return 'completed';
        }
        return 'not_found';
    }

    /**
     * 获取正在运行的任务数量
     */
    getRunningTaskCount(): number {
        return this.runningTasks.size;
    }

    /**
     * 获取已完成的任务数量
     */
    getCompletedTaskCount(): number {
        return this.completedTasks.size;
    }

    /**
     * 清理已完成的任务
     */
    clearCompletedTasks(): void {
        this.completedTasks.clear();
    }

    /**
     * 设置并行执行选项
     */
    setOptions(options: Partial<ToolExecutorOptions>): void {
        this.options = { ...this.options, ...options };
    }

    /**
     * 获取当前配置
     */
    getOptions(): Required<ToolExecutorOptions> {
        return { ...this.options };
    }
}