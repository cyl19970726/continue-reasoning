# 事件驱动架构 (Event-Driven Architecture)

## 概述

Continue-Reasoning 项目已成功从传统的回调模式迁移到现代的事件驱动架构。这种架构通过松耦合的事件发布-订阅机制实现组件间通信，提供了更好的可扩展性、可测试性和维护性。

## 核心组件

### 1. 事件总线 (EventBus)

事件总线是整个事件系统的核心，负责事件的注册、发布和订阅管理。

```typescript
export interface IEventBus {
    // 事件订阅
    subscribe<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): string; // 返回订阅ID
    
    // 事件发布
    publish(event: AppEvent): Promise<void>;
    
    // 取消订阅
    unsubscribe(subscriptionId: string): void;
    
    // 批量取消订阅
    unsubscribeAll(source?: string): void;
    
    // 事件历史查询
    getEventHistory(filter?: EventFilter): AppEvent[];
    
    // 清理事件历史
    clearHistory(olderThan?: number): void;
    
    // 获取统计信息
    getStats(): {
        totalEvents: number;
        activeSubscriptions: number;
        eventsByType: Record<string, number>;
    };
}
```

### 2. 事件发布者 (EventPublisher)

```typescript
export interface IEventPublisher {
    eventBus: IEventBus;
    componentName: string;
    
    // 便捷的事件发布方法
    publishEvent(event: Omit<AppEvent, 'timestamp' | 'source'>): Promise<void>;
}

export class EventPublisher implements IEventPublisher {
    constructor(
        public eventBus: IEventBus, 
        public componentName: string
    ) {}
    
    async publishEvent(event: Omit<AppEvent, 'timestamp' | 'source'>): Promise<void> {
        return this.eventBus.publish({
            ...event,
            timestamp: Date.now(),
            source: this.componentName
        });
    }
}
```

### 3. 事件订阅者 (EventSubscriber)

```typescript
export interface IEventSubscriber {
    eventBus: IEventBus;
    componentName: string;
    subscriptionIds: string[];
    
    // 便捷的事件订阅方法
    subscribeToEvent<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): void;
    
    // 清理订阅
    cleanup(): void;
}
```

## 事件类型系统

### 基础事件接口

所有事件都继承自 `BaseEvent`：

```typescript
export interface BaseEvent {
    type: string;
    timestamp: number;
    sessionId?: string;
    stepIndex?: number;
    source: string; // 事件源组件名称
}
```

### 统一的事件类型

系统定义了7大类事件类型，所有事件字符串都遵循统一的命名规范：

#### 1. 会话事件 (SessionEvent)
```typescript
export interface SessionEvent extends BaseEvent {
    type: 
        | 'session.started'    // 会话开始
        | 'session.ended'      // 会话结束
        | 'session.switched';  // 会话切换
    sessionId: string;
    userId?: string;
    agentId?: string;
    data?: {
        userId?: string;
        agentId?: string;
        userInput?: string;
        maxSteps?: number;
        sessionId?: string;
    };
}
```

#### 2. Agent执行事件 (AgentEvent)
```typescript
export interface AgentEvent extends BaseEvent {
    type: 
        | 'agent.step.started'     // Agent步骤开始
        | 'agent.step.completed'   // Agent步骤完成
        | 'agent.step.failed'      // Agent步骤失败
        | 'agent.stopped'          // Agent停止
        | 'agent.setup.started'    // Agent设置开始
        | 'agent.setup.completed'  // Agent设置完成
        | 'agent.state.changed';   // Agent状态变化
    stepIndex?: number;
    data?: {
        step?: AgentStep<any>;
        error?: string;
        reason?: string;
        agentId?: string;
        agentName?: string;
        previousState?: string;
        newState?: string;
        sessionId?: string;
    };
}
```

#### 3. LLM事件 (LLMEvent)
```typescript
export interface LLMEvent extends BaseEvent {
    type: 
        | 'llm.call.started'           // LLM调用开始
        | 'llm.call.completed'         // LLM调用完成
        | 'llm.text.delta'             // 文本增量输出（流式）
        | 'llm.text.completed'         // 文本生成完成
        | 'llm.tool.call.started'      // 工具调用开始
        | 'llm.tool.call.completed'    // 工具调用完成
        | 'llm.thinking.started'       // 思考开始
        | 'llm.thinking.completed';    // 思考完成
        
    stepIndex?: number;
    data: {
        content?: string;              // 文本内容
        chunkIndex?: number;           // 块索引
        outputIndex?: number;          // 输出索引
        toolCall?: ToolCallParams;     // 工具调用参数
        result?: any;                  // 调用结果
        error?: Error;                 // 错误信息
        
        // 思考相关
        thought?: string;              // 思考内容
        confidence?: number;           // 置信度
        finalThought?: string;         // 最终思考
        
        // 调用模式标识
        isStreaming?: boolean;         // 是否为流式调用
        callType?: 'async' | 'stream'; // 调用类型
        
        // SimpleClient需要的属性
        stepIndex?: number;            // 步骤索引（在data中）
        delta?: string;                // 文本增量
        text?: string;                 // 完整文本
    };
}
```

#### 4. 工具事件 (ToolEvent)
```typescript
export interface ToolEvent extends BaseEvent {
    type: 
        | 'tool.execution.started'     // 工具执行开始
        | 'tool.execution.completed'   // 工具执行完成
        | 'tool.execution.failed'      // 工具执行失败
        | 'tool.execution.error';      // 工具执行错误
    stepIndex?: number;
    data: {
        toolCall?: ToolCallParams;
        result?: ToolExecutionResult;
        error?: string;
        executionTime?: number;
        agentId?: string;
        sessionId?: string;
    };
}
```

#### 5. UI事件 (UIEvent)
```typescript
export interface UIEvent extends BaseEvent {
    type: 
        | 'ui.message.added'           // UI消息添加
        | 'ui.state.changed'           // UI状态变化
        | 'ui.input.received'          // UI输入接收
        | 'user.message';              // 用户消息
    data: {
        message?: any;
        state?: any;
        input?: string;
        messageContent?: string;
        userId?: string;
        clientName?: string;
        sessionId?: string;
    };
}
```

#### 6. 错误事件 (ErrorEvent)
```typescript
export interface ErrorEvent extends BaseEvent {
    type: 
        | 'error.occurred';            // 错误发生
    data: {
        error: Error | string;
        context?: any;
    };
}
```

#### 7. 存储事件 (StorageEvent)
```typescript
export interface StorageEvent extends BaseEvent {
    type: 
        | 'storage.save.requested'     // 存储保存请求
        | 'storage.load.requested'     // 存储加载请求
        | 'storage.updated';           // 存储更新完成
    data: {
        storage?: AgentStorage;
        operation?: string;
        sessionId?: string;
        clientName?: string;
    };
}
```

### 联合事件类型

```typescript
export type AppEvent = SessionEvent | AgentEvent | LLMEvent | ToolEvent | UIEvent | ErrorEvent | StorageEvent;
```

## 事件流处理

### 1. 基本的事件发布

```typescript
// 在 BaseAgent 中发布会话开始事件
await this.eventBus.publish({
    type: 'session.started',
    timestamp: Date.now(),
    source: `agent.${this.id}`,
    sessionId: sessionId,
    data: {
        sessionId,
        agentId: this.id,
        userInput,
        maxSteps
    }
});
```

### 2. 类型安全的事件订阅

```typescript
// 在 SimpleClient 中订阅会话事件（带类型守卫）
this.eventBus.subscribe('session.started', (event) => {
    if (event.type === 'session.started') {
        this.onSessionStarted(event.sessionId);
    }
});

// 订阅多个相关事件
this.eventBus.subscribe([
    'llm.text.delta',
    'llm.text.completed'
], (event) => {
    if (event.type === 'llm.text.delta' && event.data?.delta) {
        this.onLLMTextDelta(
            event.data.stepIndex || 0, 
            event.data.chunkIndex || 0, 
            event.data.delta
        );
    } else if (event.type === 'llm.text.completed' && event.data?.text) {
        this.onLLMTextDone(
            event.data.stepIndex || 0, 
            event.data.chunkIndex || 0, 
            event.data.text
        );
    }
});
```

### 3. 事件过滤

```typescript
// 只订阅特定会话的事件
this.eventBus.subscribe('agent.step.completed', handler, {
    sessionId: 'specific-session-id'
});

// 只订阅特定步骤的事件
this.eventBus.subscribe('tool.execution.started', handler, {
    stepIndex: 5
});

// 只订阅来自特定组件的事件
this.eventBus.subscribe('error.occurred', handler, {
    source: 'agent.my-agent'
});
```

## 核心组件的事件处理

### 1. BaseAgent - 事件发布者

BaseAgent 是主要的事件发布者，负责发布Agent生命周期相关的所有事件：

```typescript
export abstract class BaseAgent implements IAgent {
    eventBus: IEventBus;
    protected eventPublisher: EventPublisher;

    constructor(...args, eventBus?: IEventBus) {
        // 初始化 EventBus（使用传入的或创建新的）
        this.eventBus = eventBus || new EventBus(1000);
        
        // 初始化 EventPublisher
        this.eventPublisher = new AgentEventPublisher(this.eventBus, `agent.${this.id}`);
    }

    async startWithUserInput(userInput: string, maxSteps: number, sessionId: string) {
        // 发布会话开始事件
        await this.eventBus.publish({
            type: 'session.started',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            sessionId: sessionId,
            data: { sessionId, agentId: this.id, userInput, maxSteps }
        });

        // 执行步骤循环...
        
        // 发布步骤完成事件
        await this.eventBus.publish({
            type: 'agent.step.completed',
            timestamp: Date.now(),
            source: `agent.${this.id}`,
            stepIndex: this.currentStep,
            data: { step: result.agentStep, sessionId: this.sessionId }
        });
    }
}
```

### 2. StreamAgent & AsyncAgent - 专门化的Agent实现

```typescript
export class StreamAgent extends BaseAgent {
    protected eventPublisher: StreamAgentEventPublisher;

    async processStreamResponse(prompt: string, toolDefs: any[], stepIndex: number) {
        // 创建LLM事件映射器
        const llmEvents = LLMEventMapper.createStreamCallEvents(
            stepIndex,
            this.currentSessionId,
            'StreamAgent'
        );

        // 发布LLM调用开始事件
        await this.eventBus.publish(llmEvents.started());

        // 处理流式响应并发布增量事件
        await this.llm.callStream(prompt, toolDefs, async (chunk) => {
            const events = LLMEventMapper.convertChunkToEvents(
                chunk, stepIndex, this.currentSessionId, 'StreamAgent'
            );
            
            for (const event of events) {
                await this.eventBus.publish(event);
            }
        });
    }
}
```

### 3. SimpleClient - 事件订阅者

SimpleClient 展示了如何安全地订阅和处理各种事件：

```typescript
export class SimpleClient implements IClient {
    private setupEventListeners(): void {
        if (!this.eventBus) return;
        
        // 类型安全的会话事件处理
        this.eventBus.subscribe('session.started', (event) => {
            if (event.type === 'session.started') {
                this.onSessionStarted(event.sessionId);
            }
        });
        
        // 带数据验证的Agent步骤事件处理
        this.eventBus.subscribe('agent.step.completed', (event) => {
            if (event.type === 'agent.step.completed' && event.data?.step) {
                this.onAgentStep(event.data.step);
            }
        });
        
        // 带条件检查的LLM事件处理
        this.eventBus.subscribe('llm.text.delta', (event) => {
            if (event.type === 'llm.text.delta' && 
                event.data?.stepIndex !== undefined && 
                event.data?.chunkIndex !== undefined && 
                event.data?.delta) {
                this.onLLMTextDelta(
                    event.data.stepIndex, 
                    event.data.chunkIndex, 
                    event.data.delta
                );
            }
        });
    }
}
```

### 4. SessionManager - 会话状态管理

SessionManager 通过事件监听来管理会话状态：

```typescript
export class SessionManager implements ISessionManager {
    private setupEventSubscriptions(): void {
        // 监听会话事件
        this.eventSubscriber.subscribeToEvent('session.started', 
            this.handleSessionEvent.bind(this));
        
        // 监听Agent事件
        this.eventSubscriber.subscribeToEvent([
            'agent.step.completed',
            'agent.step.failed',
            'agent.stopped'
        ], this.handleAgentEvent.bind(this));
    }

    private async handleAgentEvent(event: AgentEvent): Promise<void> {
        if (!event.sessionId) return;
        
        const session = this.sessions.get(event.sessionId);
        if (session) {
            // 根据事件类型更新会话状态
            session.currentStep = event.stepIndex || 0;
            session.lastActiveTime = Date.now();
            
            if (event.type === 'agent.step.completed' && event.data?.step) {
                if (!session.agentSteps) session.agentSteps = [];
                session.agentSteps.push(event.data.step);
            }
            
            await this.saveSession(event.sessionId, session);
        }
    }
}
```

## LLM事件映射器

LLMEventMapper 负责将LLM的流式输出转换为标准化的事件：

```typescript
export class LLMEventMapper {
    static convertChunkToEvents(
        chunk: any,
        stepIndex: number,
        sessionId?: string,
        source: string = 'Agent'
    ): LLMEvent[] {
        const events: LLMEvent[] = [];
        
        if (chunk.content) {
            // 文本增量事件
            events.push({
                type: 'llm.text.delta',
                timestamp: Date.now(),
                source,
                stepIndex,
                sessionId,
                data: {
                    content: chunk.content,
                    delta: chunk.content,
                    chunkIndex: chunk.chunkIndex || 0,
                    stepIndex
                }
            });
        }
        
        if (chunk.toolCall) {
            // 工具调用事件
            events.push({
                type: 'llm.tool.call.started',
                timestamp: Date.now(),
                source,
                stepIndex,
                sessionId,
                data: {
                    toolCall: chunk.toolCall,
                    stepIndex
                }
            });
        }
        
        return events;
    }
}
```

## 事件过滤和路由

### 条件订阅

```typescript
// 只处理特定会话的错误
this.eventBus.subscribe('error.occurred', (event) => {
    // 处理错误
}, {
    sessionId: this.currentSessionId
});

// 只处理来自特定Agent的事件
this.eventBus.subscribe([
    'agent.step.started',
    'agent.step.completed'
], (event) => {
    // 处理Agent步骤
}, {
    source: 'agent.my-specific-agent'
});
```

### 事件历史和统计

```typescript
// 获取事件历史
const recentEvents = this.eventBus.getEventHistory({
    type: 'llm.text.delta',
    sessionId: 'session-123'
});

// 获取系统统计
const stats = this.eventBus.getStats();
console.log(`总事件数: ${stats.totalEvents}`);
console.log(`活跃订阅数: ${stats.activeSubscriptions}`);
console.log('事件类型分布:', stats.eventsByType);
```

## 最佳实践

### 1. 事件命名规范

- 使用 `类别.对象.动作` 的格式
- 动作使用过去分词（如 `started`, `completed`, `failed`）
- 保持命名的一致性和可预测性

### 2. 类型安全

- 总是使用类型守卫验证事件类型
- 检查可选属性是否存在
- 提供合理的默认值

```typescript
// ✅ 好的实践
this.eventBus.subscribe('llm.text.delta', (event) => {
    if (event.type === 'llm.text.delta' && event.data?.delta) {
        this.handleTextDelta(event.data.delta);
    }
});

// ❌ 避免的实践
this.eventBus.subscribe('llm.text.delta', (event) => {
    this.handleTextDelta(event.data.delta); // 可能undefined
});
```

### 3. 资源管理

- 始终在组件销毁时清理事件订阅
- 使用EventSubscriber基类简化订阅管理
- 避免内存泄漏

```typescript
export class MyComponent extends EventSubscriber {
    constructor(eventBus: IEventBus) {
        super(eventBus, 'MyComponent');
        this.setupSubscriptions();
    }
    
    dispose() {
        this.cleanup(); // 自动清理所有订阅
    }
}
```

### 4. 错误处理

- 事件处理器应该捕获和处理自己的错误
- 不要让单个事件处理器的错误影响其他订阅者
- 使用专门的错误事件报告系统错误

```typescript
this.eventBus.subscribe('some.event', async (event) => {
    try {
        await this.handleEvent(event);
    } catch (error) {
        // 发布错误事件而不是让错误传播
        await this.eventBus.publish({
            type: 'error.occurred',
            timestamp: Date.now(),
            source: this.componentName,
            data: {
                error: error instanceof Error ? error : new Error(String(error)),
                context: { originalEvent: event }
            }
        });
    }
});
```

## 性能优化

### 1. 事件批处理

对于高频事件（如文本增量），考虑使用批处理：

```typescript
class BatchedEventPublisher {
    private pendingEvents: LLMEvent[] = [];
    private batchTimer?: NodeJS.Timeout;
    
    publishTextDelta(content: string, stepIndex: number) {
        this.pendingEvents.push(this.createTextDeltaEvent(content, stepIndex));
        
        if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushBatch();
            }, 10); // 10ms批处理窗口
        }
    }
    
    private flushBatch() {
        if (this.pendingEvents.length > 0) {
            // 合并连续的文本增量事件
            const mergedEvent = this.mergeTextDeltas(this.pendingEvents);
            this.eventBus.publish(mergedEvent);
            this.pendingEvents = [];
        }
        this.batchTimer = undefined;
    }
}
```

### 2. 选择性订阅

使用过滤器减少不必要的事件处理：

```typescript
// 只订阅当前活跃会话的事件
const activeSessionFilter = { sessionId: this.currentSessionId };

this.eventBus.subscribe('agent.step.completed', this.handleStep, activeSessionFilter);
```

### 3. 事件历史管理

定期清理旧事件历史，避免内存积累：

```typescript
// 清理1小时前的事件
const oneHourAgo = Date.now() - 60 * 60 * 1000;
this.eventBus.clearHistory(oneHourAgo);
```

## 总结

事件驱动架构为Continue-Reasoning提供了：

1. **松耦合**: 组件之间通过事件通信，减少直接依赖
2. **可扩展性**: 新组件可以轻松接入现有事件流
3. **可测试性**: 事件发布和订阅可以独立测试
4. **可观测性**: 完整的事件历史提供系统行为洞察
5. **类型安全**: TypeScript类型系统确保事件处理的正确性

通过统一的事件类型、清晰的命名规范和完善的处理模式，系统实现了高效、可靠的组件间通信机制。 