import { 
    IAgentHub, 
    IMultiAgent, 
    ITaskManager, 
    Task, 
    TaskResult, 
    TaskOptions, 
    MultiAgentConfig, 
    DEFAULT_MULTI_AGENT_CONFIG,
    AgentNotFoundError,
    AgentUnavailableError,
    MultiAgentEvents 
} from '../interfaces/multi-agent.js';
import { BasicTaskManager } from './task-manager.js';
import { IEventBus } from './event-bus.js';
import { logger } from '../utils/logger.js';
import { RoutingStrategyFactory, IRoutingStrategy } from './routing-strategies.js';

/**
 * 🎯 简单智能体注册中心
 * 
 * 职责：
 * - 智能体注册和管理
 * - 任务委托和调度
 * - 事件发布
 * - 系统状态监控
 */
export class SimpleAgentHub implements IAgentHub {
    private agents = new Map<string, IMultiAgent>();
    private taskManager: ITaskManager;
    private eventBus?: IEventBus;
    private config: MultiAgentConfig;
    private routingStrategy: IRoutingStrategy;
    
    // 统计信息
    private stats = {
        totalAgents: 0,
        totalTasks: 0,
        completedTasks: 0,
        failedTasks: 0
    };
    
    constructor(eventBus?: IEventBus, config?: Partial<MultiAgentConfig>) {
        this.eventBus = eventBus;
        this.config = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
        this.taskManager = new BasicTaskManager(this.config);
        this.routingStrategy = RoutingStrategyFactory.create(this.config.routing);
        
        logger.info(`SimpleAgentHub initialized with ${this.config.routing.strategy} routing strategy`);
    }
    
    // ===== 智能体管理 =====
    
    async registerAgent(agent: IMultiAgent): Promise<void> {
        if (this.agents.has(agent.id)) {
            throw new Error(`Agent ${agent.id} already registered`);
        }
        
        try {
            this.agents.set(agent.id, agent);
            this.stats.totalAgents++;
            
            // 发布事件
            await this.publishEvent('agent_registered', {
                agentId: agent.id,
                capabilities: agent.capabilities
            });
            
            logger.info(`Agent registered: ${agent.id} with capabilities [${agent.capabilities.join(', ')}]`);
            
        } catch (error) {
            logger.error(`Failed to register agent ${agent.id}:`, error);
            // 清理失败的注册
            this.agents.delete(agent.id);
            throw error;
        }
    }
    
    async unregisterAgent(agentId: string): Promise<void> {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new AgentNotFoundError(agentId);
        }
        
        try {
            // 检查是否有正在运行的任务
            if (!agent.isAvailable() && agent.getAgentStatus().currentTaskCount > 0) {
                logger.warn(`Unregistering agent ${agentId} with ${agent.getAgentStatus().currentTaskCount} active tasks`);
            }
            
            this.agents.delete(agentId);
            this.stats.totalAgents--;
            
            // 发布事件
            await this.publishEvent('agent_unregistered', { agentId });
            
            logger.info(`Agent unregistered: ${agentId}`);
            
        } catch (error) {
            logger.error(`Failed to unregister agent ${agentId}:`, error);
            throw error;
        }
    }
    
    // ===== 智能体查找 =====
    
    getAgent(agentId: string): IMultiAgent | null {
        return this.agents.get(agentId) || null;
    }
    
    getAvailableAgents(): IMultiAgent[] {
        return Array.from(this.agents.values()).filter(agent => agent.isAvailable());
    }
    
    findAgentsByCapability(capability: string): IMultiAgent[] {
        return Array.from(this.agents.values()).filter(agent => 
            agent.capabilities.includes(capability)
        );
    }
    
    // ===== 核心功能：任务委托 =====
    
    async delegateTask(
        agentId: string, 
        taskDescription: string, 
        options?: TaskOptions
    ): Promise<TaskResult> {
        const startTime = Date.now();
        
        try {
            // 查找智能体
            const agent = this.getAgent(agentId);
            if (!agent) {
                throw new AgentNotFoundError(agentId);
            }
            
            // 检查智能体可用性
            if (!agent.isAvailable()) {
                const status = agent.getAgentStatus();
                throw new AgentUnavailableError(
                    agentId, 
                    `Agent has ${status.currentTaskCount}/${status.maxConcurrentTasks} active tasks`
                );
            }
            
            // 创建任务
            const task = this.taskManager.createTask(agentId, taskDescription, options);
            this.stats.totalTasks++;
            
            // 发布任务创建事件
            await this.publishEvent('task_created', { task });
            
            // 发布任务委托事件
            await this.publishEvent('task_delegated', { 
                taskId: task.id, 
                toAgent: agentId 
            });
            
            logger.info(`Task ${task.id} delegated to agent ${agentId}: "${taskDescription}"`);
            
            try {
                // 执行任务
                await this.publishEvent('task_started', { taskId: task.id, agentId });
                
                const result = await this.taskManager.executeTask(task, agent);
                
                // 更新统计
                if (result.status === 'success') {
                    this.stats.completedTasks++;
                    await this.publishEvent('task_completed', { taskId: task.id, result });
                } else {
                    this.stats.failedTasks++;
                    await this.publishEvent('task_failed', { 
                        taskId: task.id, 
                        error: result.error || 'Unknown error', 
                        agentId 
                    });
                }
                
                logger.info(`Task ${task.id} completed with status: ${result.status} in ${Date.now() - startTime}ms`);
                
                return result;
                
            } catch (error) {
                this.stats.failedTasks++;
                
                const errorMessage = error instanceof Error ? error.message : String(error);
                await this.publishEvent('task_failed', { 
                    taskId: task.id, 
                    error: errorMessage, 
                    agentId 
                });
                
                logger.error(`Task ${task.id} failed on agent ${agentId}:`, error);
                throw error;
            }
            
        } catch (error) {
            logger.error(`Failed to delegate task to agent ${agentId}:`, error);
            throw error;
        }
    }
    
    // ===== 任务查询 =====
    
    getTaskStatus(taskId: string): Task | null {
        return this.taskManager.getTask(taskId);
    }
    
    getActiveTasks(): Task[] {
        return this.taskManager.getActiveTasks();
    }
    
    // ===== 系统状态 =====
    
    getSystemStatus() {
        const activeTasks = this.getActiveTasks();
        const availableAgents = this.getAvailableAgents();
        
        return {
            totalAgents: this.stats.totalAgents,
            availableAgents: availableAgents.length,
            activeTasks: activeTasks.length,
            completedTasks: this.stats.completedTasks,
            failedTasks: this.stats.failedTasks,
            totalTasksProcessed: this.stats.totalTasks
        };
    }
    
    // ===== 辅助方法 =====
    
    /**
     * 获取所有智能体的详细状态
     */
    getAllAgentStatuses(): Record<string, any> {
        const statuses: Record<string, any> = {};
        
        for (const [agentId, agent] of Array.from(this.agents.entries())) {
            statuses[agentId] = {
                ...agent.getAgentStatus(),
                name: agent.name,
                description: agent.description
            };
        }
        
        return statuses;
    }
    
    /**
     * 智能路由 - 根据能力和可用性选择最佳智能体
     */
    findBestAgentForTask(taskDescription: string, requiredCapability?: string): IMultiAgent | null {
        let candidates = Array.from(this.agents.values());
        
        // 过滤可用的智能体
        candidates = candidates.filter(agent => agent.isAvailable());
        
        if (candidates.length === 0) {
            return null;
        }
        
        // 如果指定了特定能力，进行能力匹配
        if (requiredCapability) {
            const capableAgents = candidates.filter(agent => 
                agent.capabilities.includes(requiredCapability)
            );
            if (capableAgents.length > 0) {
                candidates = capableAgents;
            }
        }
        
        // 创建临时任务对象用于匹配测试
        const tempTask: Task = {
            id: 'temp',
            description: taskDescription,
            agentId: '',
            priority: 'medium',
            createdAt: Date.now(),
            status: 'pending'
        };
        
        // 过滤能处理该任务的智能体
        const suitableAgents = candidates.filter(agent => agent.canHandleTask(tempTask));
        
        if (suitableAgents.length === 0) {
            // 如果没有合适的智能体能处理该任务，返回null
            return null;
        }
        
        // 选择当前任务数最少的智能体
        return suitableAgents.reduce((best, current) => {
            const bestLoad = best.getAgentStatus().currentTaskCount;
            const currentLoad = current.getAgentStatus().currentTaskCount;
            return currentLoad < bestLoad ? current : best;
        });
    }
    
    /**
     * 智能委托 - 自动选择最佳智能体
     */
    async smartDelegateTask(
        taskDescription: string, 
        options?: TaskOptions & { requiredCapability?: string }
    ): Promise<TaskResult> {
        const bestAgent = await this.findBestAgentForTaskAsync(
            taskDescription, 
            options?.requiredCapability
        );
        
        if (!bestAgent) {
            throw new Error('No suitable agent available for the task');
        }
        
        logger.info(`Smart delegation selected agent ${bestAgent.id} for task: "${taskDescription}"`);
        
        return this.delegateTask(bestAgent.id, taskDescription, options);
    }
    
    /**
     * 异步智能路由 - 使用配置的路由策略选择最佳智能体
     */
    async findBestAgentForTaskAsync(taskDescription: string, requiredCapability?: string): Promise<IMultiAgent | null> {
        const candidates = Array.from(this.agents.values());
        
        if (candidates.length === 0) {
            return null;
        }
        
        // 创建临时任务用于路由策略
        const tempTask: Task = {
            id: 'temp',
            agentId: '',
            description: taskDescription,
            status: 'pending',
            priority: 'medium',
            createdAt: Date.now()
        };
        
        try {
            // 使用配置的路由策略选择最佳智能体
            const selectedAgent = await this.routingStrategy.selectAgent(
                tempTask, 
                candidates, 
                requiredCapability
            );
            
            if (selectedAgent) {
                logger.info(`路由策略 ${this.config.routing.strategy} 选择智能体: ${selectedAgent.id}`);
            }
            
            return selectedAgent;
            
        } catch (error) {
            logger.error('路由策略选择失败，使用后备策略:', error);
            // 后备到同步方法
            return this.findBestAgentForTask(taskDescription, requiredCapability);
        }
    }
    
    // ===== 私有方法 =====
    
    private async publishEvent<K extends keyof MultiAgentEvents>(
        eventType: K, 
        data: MultiAgentEvents[K]
    ): Promise<void> {
        // 记录事件
        if (this.config.logLevel === 'debug' || this.config.logLevel === 'info') {
            logger.info(`Multi-Agent Event [${eventType}]:`, data);
        }
        
        // 通过 eventBus 发布事件
        if (this.eventBus) {
            try {
                await this.eventBus.publish({
                    type: `multi_agent_${eventType}` as any,
                    source: 'system',
                    payload: data,
                    sessionId: 'multi-agent-hub'
                });
            } catch (error) {
                logger.error(`Failed to publish event ${eventType} through eventBus:`, error);
            }
        }
    }
    
    /**
     * 健康检查 - 定期检查智能体状态
     */
    private async performHealthCheck(): Promise<void> {
        for (const [agentId, agent] of Array.from(this.agents.entries())) {
            try {
                const status = agent.getAgentStatus();
                await this.publishEvent('agent_status_changed', { agentId, status });
            } catch (error) {
                logger.error(`Health check failed for agent ${agentId}:`, error);
            }
        }
    }
    
    /**
     * 启动健康检查定时器
     */
    startHealthCheck(): void {
        if (this.config.healthCheckInterval > 0) {
            setInterval(() => {
                this.performHealthCheck();
            }, this.config.healthCheckInterval);
            
            logger.info(`Health check started with interval ${this.config.healthCheckInterval}ms`);
        }
    }
    
    /**
     * 获取Hub统计信息
     */
    getHubStats() {
        return {
            ...this.stats,
            taskManagerStats: (this.taskManager as BasicTaskManager).getStats?.() || {},
            systemStatus: this.getSystemStatus()
        };
    }
} 