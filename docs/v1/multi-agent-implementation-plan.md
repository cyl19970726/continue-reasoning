# Continue Reasoning 多智能体系统 - MVP 实现计划

## 概述

本文档详细说明如何基于现有的Continue Reasoning框架实现一个简单而强大的多智能体系统MVP。我们将采用渐进式开发策略，确保每个阶段都有可工作的功能。

## MVP 目标

实现两个核心功能：
1. **`registerAgent(agent)`** - 智能体注册
2. **`delegateTask(agentId, task, options?)`** - 任务委托

## 实现策略

### 第一阶段：核心功能 (1-2周)

#### 1.1 文件结构
```
packages/core/multi-agent/
├── interfaces.ts          # 导出简化接口
├── agent-hub.ts          # 智能体注册中心
├── task-manager.ts       # 任务管理器
├── multi-agent-base.ts   # 增强的智能体基类
├── utils.ts              # 工具函数
└── index.ts              # 统一导出
```

#### 1.2 实现优先级

**高优先级（第一周）**：
- [ ] `IMultiAgent` 接口扩展
- [ ] `SimpleAgentHub` 基础实现
- [ ] `BasicTaskManager` 任务管理
- [ ] `MultiAgentBase` 基类
- [ ] 基础错误处理

**中优先级（第二周）**：
- [ ] 事件系统集成
- [ ] 任务状态跟踪
- [ ] 基础监控和日志
- [ ] 单元测试
- [ ] 集成测试

## 详细实现

### 1. MultiAgentBase 类设计

```typescript
// packages/core/multi-agent/multi-agent-base.ts
export class MultiAgentBase extends BaseAgent implements IMultiAgent {
    public capabilities: string[] = [];
    public maxConcurrentTasks: number = 3;
    private currentTasks = new Map<string, Task>();
    
    constructor(
        id: string,
        name: string,
        description: string,
        capabilities: string[],
        maxSteps: number = 10,
        options?: {
            maxConcurrentTasks?: number;
            // ... 其他选项
        }
    ) {
        super(id, name, description, maxSteps);
        this.capabilities = capabilities;
        this.maxConcurrentTasks = options?.maxConcurrentTasks || 3;
    }
    
    // 实现 IMultiAgent 接口
    async executeTask(task: Task): Promise<TaskResult> {
        // 将任务转换为现有的 startWithUserInput 调用
    }
    
    canHandleTask(task: Task): boolean {
        // 检查能力匹配和当前负载
    }
    
    getAgentStatus(): AgentStatus {
        // 返回当前状态
    }
    
    isAvailable(): boolean {
        // 检查是否可接受新任务
    }
}
```

### 2. SimpleAgentHub 实现

```typescript
// packages/core/multi-agent/agent-hub.ts
export class SimpleAgentHub implements IAgentHub {
    private agents = new Map<string, IMultiAgent>();
    private taskManager: ITaskManager;
    private eventBus?: IEventBus;
    
    constructor(eventBus?: IEventBus, config?: Partial<MultiAgentConfig>) {
        this.taskManager = new BasicTaskManager(config);
        this.eventBus = eventBus;
    }
    
    // 核心方法：注册智能体
    async registerAgent(agent: IMultiAgent): Promise<void> {
        if (this.agents.has(agent.id)) {
            throw new Error(`Agent ${agent.id} already registered`);
        }
        
        this.agents.set(agent.id, agent);
        
        // 发布事件
        await this.publishEvent('agent_registered', {
            agentId: agent.id,
            capabilities: agent.capabilities
        });
        
        logger.info(`Agent registered: ${agent.id}`);
    }
    
    // 核心方法：任务委托
    async delegateTask(
        agentId: string, 
        task: string, 
        options?: TaskOptions
    ): Promise<TaskResult> {
        const agent = this.getAgent(agentId);
        if (!agent) {
            throw new AgentNotFoundError(agentId);
        }
        
        if (!agent.isAvailable()) {
            throw new AgentUnavailableError(
                agentId, 
                `Agent has ${agent.getAgentStatus().currentTaskCount} active tasks`
            );
        }
        
        // 创建和执行任务
        const taskObj = this.taskManager.createTask(agentId, task, options);
        return await this.taskManager.executeTask(taskObj, agent);
    }
}
```

### 3. BasicTaskManager 实现

```typescript
// packages/core/multi-agent/task-manager.ts
export class BasicTaskManager implements ITaskManager {
    private tasks = new Map<string, Task>();
    private activeTasks = new Map<string, Task>();
    private config: MultiAgentConfig;
    
    constructor(config?: Partial<MultiAgentConfig>) {
        this.config = { ...DEFAULT_MULTI_AGENT_CONFIG, ...config };
    }
    
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
        return task;
    }
    
    async executeTask(task: Task, agent: IMultiAgent): Promise<TaskResult> {
        const startTime = Date.now();
        
        try {
            // 更新任务状态
            task.status = 'running';
            task.startedAt = startTime;
            this.activeTasks.set(task.id, task);
            
            // 执行任务
            const result = await agent.executeTask(task);
            
            // 更新完成状态
            task.status = 'completed';
            task.completedAt = Date.now();
            this.activeTasks.delete(task.id);
            
            return result;
            
        } catch (error) {
            task.status = 'failed';
            task.completedAt = Date.now();
            this.activeTasks.delete(task.id);
            
            throw new TaskExecutionError(
                task.id, 
                agent.id, 
                error instanceof Error ? error : new Error(String(error))
            );
        }
    }
}
```

## 使用示例

### 1. 基础使用

```typescript
import { SimpleAgentHub, MultiAgentBase } from '@continue-reasoning/core/multi-agent';

// 创建智能体
const codingAgent = new MultiAgentBase(
    'coding-agent-1',
    'Coding Assistant',
    'Specialized in code generation and review',
    ['code_generation', 'code_review', 'debugging']
);

// 创建Hub
const agentHub = new SimpleAgentHub();

// 注册智能体
await agentHub.registerAgent(codingAgent);

// 委托任务
const result = await agentHub.delegateTask(
    'coding-agent-1',
    'Create a React component for user login',
    {
        priority: 'high',
        timeout: 120000, // 2分钟
        context: { framework: 'React', styling: 'TailwindCSS' }
    }
);

console.log('Task result:', result);
```

### 2. 扩展现有智能体

```typescript
import { CodingAgent } from '@continue-reasoning/agents';

class CodingMultiAgent extends CodingAgent implements IMultiAgent {
    public capabilities = ['code_generation', 'code_review', 'debugging'];
    public maxConcurrentTasks = 3;
    private currentTasks = new Map<string, Task>();
    
    async executeTask(task: Task): Promise<TaskResult> {
        const startTime = Date.now();
        
        try {
            // 使用现有的处理逻辑
            await this.startWithUserInput(
                task.description,
                10, // maxSteps
                task.sessionId
            );
            
            return {
                taskId: task.id,
                status: 'success',
                result: 'Task completed successfully',
                executionTime: Date.now() - startTime,
                agentId: this.id
            };
        } catch (error) {
            return {
                taskId: task.id,
                status: 'error',
                error: error instanceof Error ? error.message : String(error),
                executionTime: Date.now() - startTime,
                agentId: this.id
            };
        }
    }
    
    canHandleTask(task: Task): boolean {
        // 检查任务描述是否包含编程相关关键词
        const codingKeywords = ['code', 'function', 'class', 'component', 'debug'];
        return codingKeywords.some(keyword => 
            task.description.toLowerCase().includes(keyword)
        );
    }
    
    getAgentStatus(): AgentStatus {
        return {
            isAvailable: this.currentTasks.size < this.maxConcurrentTasks,
            currentTaskCount: this.currentTasks.size,
            maxConcurrentTasks: this.maxConcurrentTasks,
            capabilities: this.capabilities,
            lastActivity: Date.now()
        };
    }
    
    isAvailable(): boolean {
        return this.getAgentStatus().isAvailable && !this.isRunning;
    }
}
```

## 测试策略

### 1. 单元测试

```typescript
// tests/multi-agent/agent-hub.test.ts
describe('SimpleAgentHub', () => {
    let hub: SimpleAgentHub;
    let mockAgent: IMultiAgent;
    
    beforeEach(() => {
        hub = new SimpleAgentHub();
        mockAgent = createMockAgent('test-agent-1');
    });
    
    test('should register agent successfully', async () => {
        await hub.registerAgent(mockAgent);
        expect(hub.getAgent('test-agent-1')).toBe(mockAgent);
    });
    
    test('should delegate task successfully', async () => {
        await hub.registerAgent(mockAgent);
        const result = await hub.delegateTask('test-agent-1', 'Test task');
        expect(result.status).toBe('success');
    });
    
    test('should throw error for non-existent agent', async () => {
        await expect(
            hub.delegateTask('non-existent', 'Test task')
        ).rejects.toThrow(AgentNotFoundError);
    });
});
```

### 2. 集成测试

```typescript
// tests/multi-agent/integration.test.ts
describe('Multi-Agent System Integration', () => {
    test('should handle real agent workflow', async () => {
        const codingAgent = new CodingMultiAgent(/* ... */);
        const hub = new SimpleAgentHub();
        
        await hub.registerAgent(codingAgent);
        
        const result = await hub.delegateTask(
            codingAgent.id,
            'Create a simple TypeScript function that adds two numbers'
        );
        
        expect(result.status).toBe('success');
        expect(result.result).toBeTruthy();
    });
});
```

## 部署和配置

### 1. 环境配置

```typescript
// config/multi-agent.ts
export const multiAgentConfig: MultiAgentConfig = {
    defaultTimeout: process.env.TASK_TIMEOUT ? 
        parseInt(process.env.TASK_TIMEOUT) : 300000,
    maxRetries: 3,
    cleanupInterval: 60000,
    defaultMaxConcurrentTasks: 3,
    healthCheckInterval: 30000,
    logLevel: (process.env.LOG_LEVEL as any) || 'info',
    logTasks: process.env.LOG_TASKS === 'true'
};
```

### 2. 启动脚本

```typescript
// examples/multi-agent-example.ts
import { SimpleAgentHub, MultiAgentBase } from '@continue-reasoning/core/multi-agent';
import { EventBus } from '@continue-reasoning/core/events';

async function main() {
    const eventBus = new EventBus();
    const hub = new SimpleAgentHub(eventBus);
    
    // 创建和注册智能体
    const agents = [
        new MultiAgentBase('coding', 'Coding Agent', 'Code helper', ['coding']),
        new MultiAgentBase('research', 'Research Agent', 'Research helper', ['research']),
    ];
    
    for (const agent of agents) {
        await hub.registerAgent(agent);
    }
    
    // 委托任务示例
    const result = await hub.delegateTask(
        'coding', 
        'Create a TypeScript function to validate email addresses'
    );
    
    console.log('Task completed:', result);
}

main().catch(console.error);
```

## 成功指标

MVP完成时应该能够：

1. ✅ 成功注册智能体
2. ✅ 成功委托和执行任务
3. ✅ 处理基本错误情况
4. ✅ 跟踪任务状态
5. ✅ 与现有框架无缝集成
6. ✅ 通过所有单元测试和集成测试
7. ✅ 提供清晰的使用文档和示例

## 后续扩展计划

MVP完成后，可以考虑以下增强功能：

1. **智能路由**：根据能力自动选择最佳智能体
2. **负载均衡**：智能分配任务到可用智能体
3. **任务编排**：支持复杂的多步骤任务流程
4. **监控面板**：可视化系统状态和指标
5. **分布式支持**：跨进程/机器的智能体协作

这个实现计划确保我们从最基本的功能开始，逐步构建一个稳定可靠的多智能体系统。 