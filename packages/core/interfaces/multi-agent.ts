import { IAgent } from './agent';
import { z } from 'zod';

// ===== 路由策略类型 =====

export type RoutingStrategy = 'keyword' | 'llm' | 'vector' | 'hybrid';

export interface RoutingConfig {
    strategy: RoutingStrategy;
    llmConfig?: {
        provider?: string;
        model?: string;
        temperature?: number;
        maxTokens?: number;
    };
    vectorConfig?: {
        embeddingModel?: string;
        similarityThreshold?: number;
        dimensions?: number;
    };
    hybridConfig?: {
        llmWeight?: number;
        vectorWeight?: number;
        keywordWeight?: number;
    };
}

// ===== 核心数据模型 =====

// 任务选项
export const TaskOptionsSchema = z.object({
    priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
    timeout: z.number().optional(),
    context: z.record(z.any()).optional(),
    sessionId: z.string().optional()
});

export type TaskOptions = z.infer<typeof TaskOptionsSchema>;

// 任务模型 - 简化版
export interface Task {
    id: string;
    description: string;
    agentId: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    timeout?: number;
    context?: Record<string, any>;
    sessionId?: string;
    createdAt: number;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt?: number;
    completedAt?: number;
}

// 任务结果 - 简化版
export interface TaskResult {
    taskId: string;
    status: 'success' | 'error' | 'timeout' | 'cancelled';
    result?: any;
    error?: string;
    executionTime: number;
    agentId: string;
}

// 智能体状态
export interface AgentStatus {
    isAvailable: boolean;
    currentTaskCount: number;
    maxConcurrentTasks: number;
    capabilities: string[];
    lastActivity: number;
}

// ===== 核心接口 =====

// 多智能体接口 - 最小化扩展
export interface IMultiAgent extends IAgent {
    // 核心属性
    capabilities: string[];
    maxConcurrentTasks: number;
    
    // 核心方法
    executeTask(task: Task): Promise<TaskResult>;
    canHandleTask(task: Task): boolean;
    getAgentStatus(): AgentStatus;
    isAvailable(): boolean;
}

// Agent Hub 接口 - 简化版
export interface IAgentHub {
    // 智能体管理
    registerAgent(agent: IMultiAgent): Promise<void>;
    unregisterAgent(agentId: string): Promise<void>;
    
    // 智能体查找
    getAgent(agentId: string): IMultiAgent | null;
    getAvailableAgents(): IMultiAgent[];
    findAgentsByCapability(capability: string): IMultiAgent[];
    
    // 核心功能：任务委托
    delegateTask(agentId: string, task: string, options?: TaskOptions): Promise<TaskResult>;
    
    // 任务查询
    getTaskStatus(taskId: string): Task | null;
    getActiveTasks(): Task[];
    
    // 系统状态
    getSystemStatus(): {
        totalAgents: number;
        availableAgents: number;
        activeTasks: number;
        completedTasks: number;
        failedTasks: number;
    };
}

// 任务管理器接口 - 简化版
export interface ITaskManager {
    // 任务生命周期
    createTask(agentId: string, description: string, options?: TaskOptions): Task;
    executeTask(task: Task, agent: IMultiAgent): Promise<TaskResult>;
    cancelTask(taskId: string): Promise<boolean>;
    
    // 任务查询
    getTask(taskId: string): Task | null;
    getActiveTasks(): Task[];
    
    // 清理
    cleanupCompletedTasks(olderThanMs?: number): number;
}

// ===== 事件类型 =====

export interface MultiAgentEvents {
    // 智能体事件
    'agent_registered': { agentId: string; capabilities: string[] };
    'agent_unregistered': { agentId: string };
    'agent_status_changed': { agentId: string; status: AgentStatus };
    
    // 任务事件
    'task_created': { task: Task };
    'task_started': { taskId: string; agentId: string };
    'task_completed': { taskId: string; result: TaskResult };
    'task_failed': { taskId: string; error: string; agentId: string };
    'task_cancelled': { taskId: string; agentId: string };
    
    // 委托事件
    'task_delegated': { taskId: string; fromAgent?: string; toAgent: string };
}

// ===== 配置 =====

export interface MultiAgentConfig {
    // 任务配置
    defaultTimeout: number;
    maxRetries: number;
    cleanupInterval: number;
    
    // 智能体配置
    defaultMaxConcurrentTasks: number;
    healthCheckInterval: number;
    
    // 路由配置
    routing: RoutingConfig;
    
    // 日志配置
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    logTasks: boolean;
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfig = {
    defaultTimeout: 300000, // 5分钟
    maxRetries: 3,
    cleanupInterval: 60000, // 1分钟
    defaultMaxConcurrentTasks: 3,
    healthCheckInterval: 30000, // 30秒
    routing: {
        strategy: 'keyword',
        llmConfig: {
            model: 'gpt-4o',
            temperature: 0.1,
            maxTokens: 200
        },
        vectorConfig: {
            embeddingModel: 'text-embedding-3-small',
            similarityThreshold: 0.7,
            dimensions: 1536
        },
        hybridConfig: {
            llmWeight: 0.4,
            vectorWeight: 0.4,
            keywordWeight: 0.2
        }
    },
    logLevel: 'info',
    logTasks: true
};

// ===== 工具函数类型 =====

export type CreateMultiAgentOptions = {
    capabilities: string[];
    maxConcurrentTasks?: number;
};

export type DelegateTaskFunction = (
    agentId: string, 
    task: string, 
    options?: TaskOptions
) => Promise<TaskResult>;

export type RegisterAgentFunction = (
    agent: IMultiAgent
) => Promise<void>;

// ===== 错误类型 =====

export class MultiAgentError extends Error {
    constructor(
        message: string,
        public code: string,
        public details?: any
    ) {
        super(message);
        this.name = 'MultiAgentError';
    }
}

export class TaskExecutionError extends MultiAgentError {
    constructor(taskId: string, agentId: string, originalError: Error) {
        super(
            `Task ${taskId} failed on agent ${agentId}: ${originalError.message}`,
            'TASK_EXECUTION_ERROR',
            { taskId, agentId, originalError }
        );
    }
}

export class AgentNotFoundError extends MultiAgentError {
    constructor(agentId: string) {
        super(
            `Agent ${agentId} not found`,
            'AGENT_NOT_FOUND',
            { agentId }
        );
    }
}

export class AgentUnavailableError extends MultiAgentError {
    constructor(agentId: string, reason: string) {
        super(
            `Agent ${agentId} is unavailable: ${reason}`,
            'AGENT_UNAVAILABLE',
            { agentId, reason }
        );
    }
}

export class TaskTimeoutError extends MultiAgentError {
    constructor(taskId: string, timeout: number) {
        super(
            `Task ${taskId} timed out after ${timeout}ms`,
            'TASK_TIMEOUT',
            { taskId, timeout }
        );
    }
} 