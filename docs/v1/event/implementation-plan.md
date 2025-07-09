# 事件驱动架构实现计划

## 1. 实现阶段概述

```
Phase 1: 基础设施 (1-2 weeks)
├── EventBus核心实现
├── Event类型定义
├── Publisher/Subscriber基类
└── 测试框架

Phase 2: 核心组件迁移 (2-3 weeks)
├── Agent事件化
├── SessionManager事件化
├── LLM事件化
└── ToolExecutor事件化

Phase 3: 客户端迁移 (1-2 weeks)
├── ReactCLIClient事件化
├── 其他客户端事件化
└── 回调接口清理

Phase 4: 增强功能 (1-2 weeks)
├── 事件持久化
├── 性能监控
├── 调试工具
└── 错误恢复
```

## 2. Phase 1: 基础设施实现

### 2.1 核心文件结构

```
packages/core/
├── interfaces/
│   └── events.ts                    # 事件接口定义
├── event-bus/
│   ├── event-bus.ts                 # EventBus核心实现
│   ├── event-publisher.ts           # 事件发布者基类
│   ├── event-subscriber.ts          # 事件订阅者基类
│   └── event-filter.ts              # 事件过滤器
├── __tests__/
│   └── event-bus.test.ts            # 事件总线测试
```

### 2.2 EventBus核心实现

```typescript
// packages/core/event-bus/event-bus.ts
export class EventBus implements IEventBus {
    private subscriptions: Map<string, EventSubscription[]> = new Map();
    private eventHistory: AppEvent[] = [];
    private maxHistorySize: number = 1000;
    private stats: EventBusStats = {
        totalEvents: 0,
        activeSubscriptions: 0,
        eventsByType: {}
    };

    subscribe<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): string {
        const subscriptionId = this.generateSubscriptionId();
        const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
        
        eventTypes.forEach(type => {
            if (!this.subscriptions.has(type)) {
                this.subscriptions.set(type, []);
            }
            
            this.subscriptions.get(type)!.push({
                id: subscriptionId,
                handler: handler as EventHandler,
                filter,
                createdAt: Date.now()
            });
        });
        
        this.stats.activeSubscriptions++;
        return subscriptionId;
    }

    async publish(event: AppEvent): Promise<void> {
        try {
            // 验证事件
            this.validateEvent(event);
            
            // 添加到历史记录
            this.addToHistory(event);
            
            // 更新统计信息
            this.updateStats(event);
            
            // 获取订阅者
            const subscriptions = this.getSubscriptions(event.type);
            
            // 过滤订阅者
            const filteredSubscriptions = subscriptions.filter(sub => 
                this.matchesFilter(event, sub.filter)
            );
            
            // 并行执行处理器
            const promises = filteredSubscriptions.map(sub => 
                this.executeHandler(sub.handler, event)
            );
            
            await Promise.all(promises);
            
        } catch (error) {
            console.error('EventBus publish error:', error);
            throw error;
        }
    }

    unsubscribe(subscriptionId: string): void {
        for (const [eventType, subscriptions] of this.subscriptions.entries()) {
            const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
            if (index !== -1) {
                subscriptions.splice(index, 1);
                this.stats.activeSubscriptions--;
                
                // 清理空的事件类型
                if (subscriptions.length === 0) {
                    this.subscriptions.delete(eventType);
                }
                break;
            }
        }
    }

    getEventHistory(filter?: EventFilter): AppEvent[] {
        if (!filter) {
            return [...this.eventHistory];
        }
        
        return this.eventHistory.filter(event => 
            this.matchesFilter(event, filter)
        );
    }

    getStats(): EventBusStats {
        return { ...this.stats };
    }

    private validateEvent(event: AppEvent): void {
        if (!event.type) {
            throw new Error('Event type is required');
        }
        if (!event.timestamp) {
            throw new Error('Event timestamp is required');
        }
        if (!event.source) {
            throw new Error('Event source is required');
        }
    }

    private addToHistory(event: AppEvent): void {
        this.eventHistory.push(event);
        
        // 限制历史记录大小
        if (this.eventHistory.length > this.maxHistorySize) {
            this.eventHistory.shift();
        }
    }

    private updateStats(event: AppEvent): void {
        this.stats.totalEvents++;
        this.stats.eventsByType[event.type] = (this.stats.eventsByType[event.type] || 0) + 1;
    }

    private getSubscriptions(eventType: string): EventSubscription[] {
        return this.subscriptions.get(eventType) || [];
    }

    private matchesFilter(event: AppEvent, filter?: EventFilter): boolean {
        if (!filter) return true;
        
        if (filter.type && !this.matchesType(event.type, filter.type)) {
            return false;
        }
        
        if (filter.sessionId && event.sessionId !== filter.sessionId) {
            return false;
        }
        
        if (filter.stepIndex && event.stepIndex !== filter.stepIndex) {
            return false;
        }
        
        if (filter.source && event.source !== filter.source) {
            return false;
        }
        
        return true;
    }

    private matchesType(eventType: string, filterType: string | string[]): boolean {
        if (Array.isArray(filterType)) {
            return filterType.includes(eventType);
        }
        return eventType === filterType;
    }

    private async executeHandler(handler: EventHandler, event: AppEvent): Promise<void> {
        try {
            await handler(event);
        } catch (error) {
            console.error(`Error in event handler for ${event.type}:`, error);
            // 可以选择发布错误事件
            await this.publish({
                type: 'error.occurred',
                timestamp: Date.now(),
                source: 'EventBus',
                data: {
                    error: error instanceof Error ? error.message : String(error),
                    context: { originalEvent: event }
                }
            } as ErrorEvent);
        }
    }

    private generateSubscriptionId(): string {
        return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
```

### 2.3 事件发布者基类

```typescript
// packages/core/event-bus/event-publisher.ts
export abstract class EventPublisher implements IEventPublisher {
    constructor(
        public eventBus: IEventBus,
        public componentName: string
    ) {}

    async publishEvent(event: Omit<AppEvent, 'timestamp' | 'source'>): Promise<void> {
        const fullEvent: AppEvent = {
            ...event,
            timestamp: Date.now(),
            source: this.componentName
        } as AppEvent;

        await this.eventBus.publish(fullEvent);
    }

    // 便捷方法
    async publishSessionEvent(
        type: SessionEvent['type'],
        sessionId: string,
        data?: Partial<SessionEvent>
    ): Promise<void> {
        await this.publishEvent({
            type,
            sessionId,
            ...data
        });
    }

    async publishAgentEvent(
        type: AgentEvent['type'],
        stepIndex: number,
        sessionId?: string,
        data?: AgentEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            stepIndex,
            sessionId,
            data
        });
    }

    async publishToolEvent(
        type: ToolEvent['type'],
        stepIndex: number,
        sessionId?: string,
        data?: ToolEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            stepIndex,
            sessionId,
            data
        });
    }

    async publishLLMEvent(
        type: LLMEvent['type'],
        stepIndex: number,
        sessionId?: string,
        data?: LLMEvent['data']
    ): Promise<void> {
        await this.publishEvent({
            type,
            stepIndex,
            sessionId,
            data
        });
    }

    async publishErrorEvent(
        error: Error | string,
        context?: any,
        sessionId?: string,
        stepIndex?: number
    ): Promise<void> {
        await this.publishEvent({
            type: 'error.occurred',
            sessionId,
            stepIndex,
            data: {
                error: error instanceof Error ? error.message : error,
                context
            }
        });
    }
}
```

### 2.4 事件订阅者基类

```typescript
// packages/core/event-bus/event-subscriber.ts
export abstract class EventSubscriber implements IEventSubscriber {
    public subscriptionIds: string[] = [];

    constructor(
        public eventBus: IEventBus,
        public componentName: string
    ) {}

    subscribeToEvent<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): void {
        const subscriptionId = this.eventBus.subscribe(eventType, handler, filter);
        this.subscriptionIds.push(subscriptionId);
    }

    // 便捷订阅方法
    subscribeToSessionEvents(
        handler: EventHandler<SessionEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['session.started', 'session.ended', 'session.switched'],
            handler,
            filter
        );
    }

    subscribeToAgentEvents(
        handler: EventHandler<AgentEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['agent.step.started', 'agent.step.completed', 'agent.step.failed', 'agent.stopped'],
            handler,
            filter
        );
    }

    subscribeToToolEvents(
        handler: EventHandler<ToolEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['tool.call.started', 'tool.execution.started', 'tool.execution.completed', 'tool.execution.failed'],
            handler,
            filter
        );
    }

    subscribeToLLMEvents(
        handler: EventHandler<LLMEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(
            ['llm.text.delta', 'llm.text.completed', 'llm.thinking.started', 'llm.thinking.completed'],
            handler,
            filter
        );
    }

    subscribeToErrorEvents(
        handler: EventHandler<ErrorEvent>,
        filter?: EventFilter
    ): void {
        this.subscribeToEvent(['error.occurred'], handler, filter);
    }

    cleanup(): void {
        this.subscriptionIds.forEach(id => {
            this.eventBus.unsubscribe(id);
        });
        this.subscriptionIds = [];
    }
}
```

## 3. Phase 2: 核心组件迁移

### 3.1 Agent组件事件化

```typescript
// packages/core/stream-agent-v2.ts
export class StreamAgentV2 extends EventPublisher implements IAgent {
    private eventSubscriber: EventSubscriber;

    constructor(
        // ... 原有参数
        eventBus: IEventBus
    ) {
        super(eventBus, 'StreamAgent');
        this.eventSubscriber = new EventSubscriber(eventBus, 'StreamAgent');
        this.setupEventSubscriptions();
    }

    private setupEventSubscriptions(): void {
        // 订阅会话事件
        this.eventSubscriber.subscribeToSessionEvents(
            this.handleSessionEvent.bind(this),
            { /* filter */ }
        );
    }

    private async handleSessionEvent(event: SessionEvent): Promise<void> {
        switch (event.type) {
            case 'session.started':
                await this.handleSessionStart(event);
                break;
            case 'session.ended':
                await this.handleSessionEnd(event);
                break;
        }
    }

    async startWithUserInput(
        userInput: string,
        maxSteps: number,
        sessionId: string,
        options?: any
    ): Promise<void> {
        // 发布会话开始事件
        await this.publishSessionEvent('session.started', sessionId, {
            userId: this.userId,
            agentId: this.id
        });

        // 原有逻辑...
        await this.stepsLoop(userInput, maxSteps, options);
    }

    protected async processStep(
        userInput: string,
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }> {
        // 发布步骤开始事件
        await this.publishAgentEvent(
            'agent.step.started',
            stepIndex,
            this.sessionId
        );

        try {
            // 生成prompt
            const prompt = await this.promptProcessor.formatPrompt(stepIndex);
            const toolDefs = this.promptProcessor.enableToolCallsForStep(stepIndex)
                ? this.getActiveTools().map(tool => tool.toCallParams())
                : [];

            // 根据LLM配置选择调用模式
            if (this.llm.streaming && this.llm.callStream) {
                // 流式调用
                await this.processStreamResponse(prompt, toolDefs, stepIndex);
            } else {
                // 非流式调用
                await this.processNonStreamResponse(prompt, toolDefs, stepIndex);
            }

            // 构建结果
            const agentStep: AgentStep = {
                stepIndex,
                rawText: this.currentStepData?.rawText || '',
                toolCalls: this.currentStepData?.toolCalls || [],
                toolExecutionResults: this.currentStepData?.toolExecutionResults || []
            };

            // 发布步骤完成事件
            await this.publishAgentEvent(
                'agent.step.completed',
                stepIndex,
                this.sessionId,
                { step: agentStep }
            );

            return {
                continueProcessing: true,
                agentStep
            };

        } catch (error) {
            // 发布步骤失败事件
            await this.publishAgentEvent(
                'agent.step.failed',
                stepIndex,
                this.sessionId,
                { error: error instanceof Error ? error.message : String(error) }
            );

            throw error;
        }
    }

    // 处理流式响应
    private async processStreamResponse(
        prompt: string,
        toolDefs: any[],
        stepIndex: number
    ): Promise<void> {
        for await (const chunk of this.llm.callStream(prompt, toolDefs, { stepIndex })) {
            await this.handleStreamChunk(chunk, stepIndex);
        }
    }

    private async handleStreamChunk(chunk: LLMStreamChunk, stepIndex: number): Promise<void> {
        // 使用LLMEventMapper将LLMStreamChunk转换为LLMEvent
        const llmEvent = LLMEventMapper.mapStreamChunkToEvent(
            chunk, 
            stepIndex, 
            this.sessionId, 
            'StreamAgent'
        );
        
        if (llmEvent) {
            await this.eventBus.publish(llmEvent);
        }

        // 处理特定的chunk类型业务逻辑
        switch (chunk.type) {
            case 'tool-call-start':
                // 发布工具调用开始事件（业务层面）
                await this.publishToolEvent(
                    'tool.call.started',
                    stepIndex,
                    this.sessionId,
                    { toolCall: chunk.toolCall }
                );
                break;

            case 'tool-call-done':
                // 发布工具执行开始事件（业务层面）
                await this.publishToolEvent(
                    'tool.execution.started',
                    stepIndex,
                    this.sessionId,
                    { toolCall: chunk.toolCall }
                );

                // 异步执行工具
                this.executeToolCall(chunk.toolCall, stepIndex);
                break;
        }
    }

    // 新增：处理非流式调用的事件发布
    private async processNonStreamResponse(
        prompt: string,
        toolDefs: any[],
        stepIndex: number
    ): Promise<void> {
        const llmEvents = LLMEventMapper.createAsyncCallEvents(
            stepIndex,
            this.sessionId,
            'StreamAgent'
        );

        // 发布LLM调用开始事件
        await this.eventBus.publish(llmEvents.started());

        try {
            // 调用非流式LLM方法
            const result = await this.llm.callAsync(prompt, toolDefs, { stepIndex });

            // 发布文本完成事件
            if (result.text) {
                await this.eventBus.publish(llmEvents.textCompleted(result.text));
            }

            // 发布工具调用完成事件
            if (result.toolCalls && result.toolCalls.length > 0) {
                for (const toolCall of result.toolCalls) {
                    await this.eventBus.publish(llmEvents.toolCompleted(toolCall));
                    
                    // 执行工具调用
                    await this.executeToolCall(toolCall, stepIndex);
                }
            }

            // 发布LLM调用完成事件
            await this.eventBus.publish(llmEvents.completed(result));

        } catch (error) {
            await this.publishErrorEvent(
                error instanceof Error ? error : new Error(String(error)),
                { stepIndex, prompt },
                this.sessionId,
                stepIndex
            );
            throw error;
        }
    }

    private async executeToolCall(
        toolCall: ToolCallParams,
        stepIndex: number
    ): Promise<void> {
        try {
            const result = await this.toolExecutor.executeToolCall(
                toolCall,
                this.getToolByName(toolCall.name),
                this,
                undefined, // 不再需要回调
                this.toolExecutionPriority
            );

            // 发布工具执行完成事件
            await this.publishToolEvent(
                'tool.execution.completed',
                stepIndex,
                this.sessionId,
                { result }
            );

        } catch (error) {
            // 发布工具执行失败事件
            await this.publishToolEvent(
                'tool.execution.failed',
                stepIndex,
                this.sessionId,
                { error: error instanceof Error ? error.message : String(error) }
            );
        }
    }

    cleanup(): void {
        this.eventSubscriber.cleanup();
    }
}
```

### 3.2 SessionManager组件事件化

```typescript
// packages/core/session/session-manager-v2.ts
export class SessionManagerV2 extends EventPublisher implements ISessionManager {
    private eventSubscriber: EventSubscriber;

    constructor(
        agent: IAgent,
        eventBus: IEventBus
    ) {
        super(eventBus, 'SessionManager');
        this.eventSubscriber = new EventSubscriber(eventBus, 'SessionManager');
        this.setupEventSubscriptions();
    }

    private setupEventSubscriptions(): void {
        // 订阅UI输入事件
        this.eventSubscriber.subscribeToEvent(
            ['ui.input.received'],
            this.handleUIInput.bind(this)
        );

        // 订阅Agent步骤完成事件
        this.eventSubscriber.subscribeToAgentEvents(
            this.handleAgentEvent.bind(this),
            { type: ['agent.step.completed'] }
        );
    }

    private async handleUIInput(event: UIEvent): Promise<void> {
        if (event.type === 'ui.input.received' && event.data.input) {
            await this.sendMessageToAgent(
                event.data.input,
                this.maxSteps,
                this.currentSessionId || this.createSession()
            );
        }
    }

    private async handleAgentEvent(event: AgentEvent): Promise<void> {
        switch (event.type) {
            case 'agent.step.completed':
                await this.handleAgentStepCompleted(event);
                break;
        }
    }

    private async handleAgentStepCompleted(event: AgentEvent): Promise<void> {
        // 保存会话状态
        if (event.sessionId && event.data?.step) {
            await this.publishEvent({
                type: 'storage.save.requested',
                sessionId: event.sessionId,
                data: {
                    storage: this.getCurrentStorage(event.sessionId),
                    operation: 'save_step'
                }
            });
        }
    }

    async sendMessageToAgent(
        message: string,
        maxSteps: number,
        sessionId: string
    ): Promise<string> {
        // 发布会话开始事件
        await this.publishSessionEvent('session.started', sessionId, {
            userId: this.userId,
            agentId: this.agentId
        });

        // 启动Agent
        await this.agent.startWithUserInput(message, maxSteps, sessionId);

        return sessionId;
    }

    cleanup(): void {
        this.eventSubscriber.cleanup();
    }
}
```

## 4. Phase 3: 客户端迁移

### 4.1 ReactCLIClient事件化

```typescript
// packages/react-cli/src/ReactCLIClientV2.tsx
export class ReactCLIClientV2 extends EventPublisher implements IClient {
    private eventSubscriber: EventSubscriber;

    constructor(
        config: ReactCLIConfig,
        eventBus: IEventBus
    ) {
        super(eventBus, 'ReactCLIClient');
        this.eventSubscriber = new EventSubscriber(eventBus, 'ReactCLIClient');
        this.setupEventSubscriptions();
    }

    private setupEventSubscriptions(): void {
        // 订阅Agent步骤事件
        this.eventSubscriber.subscribeToAgentEvents(
            this.handleAgentEvent.bind(this)
        );

        // 订阅工具执行事件
        this.eventSubscriber.subscribeToToolEvents(
            this.handleToolEvent.bind(this)
        );

        // 订阅LLM文本事件
        this.eventSubscriber.subscribeToLLMEvents(
            this.handleLLMEvent.bind(this)
        );

        // 订阅会话事件
        this.eventSubscriber.subscribeToSessionEvents(
            this.handleSessionEvent.bind(this)
        );

        // 订阅错误事件
        this.eventSubscriber.subscribeToErrorEvents(
            this.handleErrorEvent.bind(this)
        );
    }

    private async handleAgentEvent(event: AgentEvent): Promise<void> {
        switch (event.type) {
            case 'agent.step.completed':
                if (event.data?.step) {
                    this.handleAgentStep(event.data.step);
                }
                break;
        }
    }

    private async handleToolEvent(event: ToolEvent): Promise<void> {
        switch (event.type) {
            case 'tool.execution.started':
                if (event.data?.toolCall) {
                    this.handleToolExecutionStart(event.data.toolCall);
                }
                break;
            case 'tool.execution.completed':
                if (event.data?.result) {
                    this.handleToolExecutionEnd(event.data.result);
                }
                break;
        }
    }

    private async handleLLMEvent(event: LLMEvent): Promise<void> {
        switch (event.type) {
            case 'llm.text.delta':
                if (event.data?.content) {
                    this.handleTextDelta(event.data.content);
                }
                break;
        }
    }

    private async handleSessionEvent(event: SessionEvent): Promise<void> {
        switch (event.type) {
            case 'session.started':
                this.currentSessionId = event.sessionId;
                this.addMessage({
                    id: `session_start_${Date.now()}`,
                    content: `🚀 Session started: ${event.sessionId}`,
                    type: 'system',
                    timestamp: Date.now()
                });
                break;
            case 'session.ended':
                this.addMessage({
                    id: `session_end_${Date.now()}`,
                    content: `👋 Session ended: ${event.sessionId}`,
                    type: 'system',
                    timestamp: Date.now()
                });
                break;
        }
    }

    private async handleErrorEvent(event: ErrorEvent): Promise<void> {
        this.addMessage({
            id: `error_${Date.now()}`,
            content: `❌ Error: ${event.data.error}`,
            type: 'error',
            timestamp: Date.now()
        });
    }

    async sendMessageToAgent(message: string): Promise<void> {
        if (!this.currentSessionId) {
            this.currentSessionId = this.createSession();
        }

        // 添加用户消息
        this.addMessage({
            id: `user_${Date.now()}`,
            content: message,
            type: 'user',
            timestamp: Date.now()
        });

        // 发布UI输入事件
        await this.publishEvent({
            type: 'ui.input.received',
            sessionId: this.currentSessionId,
            data: { input: message }
        });

        // 更新UI状态
        this.updateUIState({ isProcessing: true });
    }

    cleanup(): void {
        this.eventSubscriber.cleanup();
    }
}
```

## 5. Phase 4: 增强功能

### 5.1 事件持久化

```typescript
// packages/core/event-bus/event-persistence.ts
export class EventPersistence {
    constructor(private eventBus: IEventBus) {}

    async saveEventsToFile(
        filePath: string,
        filter?: EventFilter
    ): Promise<void> {
        const events = this.eventBus.getEventHistory(filter);
        const json = JSON.stringify(events, null, 2);
        await fs.writeFile(filePath, json);
    }

    async loadEventsFromFile(filePath: string): Promise<AppEvent[]> {
        const json = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(json);
    }

    async replayEvents(events: AppEvent[]): Promise<void> {
        for (const event of events) {
            await this.eventBus.publish(event);
        }
    }
}
```

### 5.2 性能监控

```typescript
// packages/core/event-bus/event-monitor.ts
export class EventMonitor {
    private metrics: Map<string, EventMetrics> = new Map();

    constructor(private eventBus: IEventBus) {
        this.setupMonitoring();
    }

    private setupMonitoring(): void {
        this.eventBus.subscribe('*', (event) => {
            this.recordEvent(event);
        });
    }

    private recordEvent(event: AppEvent): void {
        const eventType = event.type;
        const metrics = this.metrics.get(eventType) || {
            count: 0,
            totalTime: 0,
            avgTime: 0,
            lastSeen: 0
        };

        metrics.count++;
        metrics.lastSeen = event.timestamp;
        this.metrics.set(eventType, metrics);
    }

    getMetrics(): Map<string, EventMetrics> {
        return new Map(this.metrics);
    }

    getEventFrequency(eventType: string): number {
        const metrics = this.metrics.get(eventType);
        if (!metrics) return 0;

        const now = Date.now();
        const timeSpan = now - metrics.lastSeen;
        return metrics.count / (timeSpan / 1000); // events per second
    }
}
```

## 6. 迁移策略

### 6.1 向后兼容性

```typescript
// packages/core/compatibility/callback-bridge.ts
export class CallbackBridge {
    constructor(private eventBus: IEventBus) {}

    // 将旧的回调转换为事件订阅
    bridgeAgentCallbacks(callbacks: AgentCallbacks): void {
        if (callbacks.onAgentStep) {
            this.eventBus.subscribe(['agent.step.completed'], (event) => {
                if (event.type === 'agent.step.completed' && event.data?.step) {
                    callbacks.onAgentStep!(event.data.step);
                }
            });
        }

        if (callbacks.onToolExecutionStart) {
            this.eventBus.subscribe(['tool.execution.started'], (event) => {
                if (event.type === 'tool.execution.started' && event.data?.toolCall) {
                    callbacks.onToolExecutionStart!(event.data.toolCall);
                }
            });
        }

        // ... 其他回调转换
    }
}
```

### 6.2 渐进式迁移

```typescript
// packages/core/migration/hybrid-agent.ts
export class HybridAgent extends StreamAgent {
    private eventBus?: IEventBus;
    private eventPublisher?: EventPublisher;

    constructor(
        // ... 原有参数
        eventBus?: IEventBus
    ) {
        super(/* 原有参数 */);
        
        if (eventBus) {
            this.eventBus = eventBus;
            this.eventPublisher = new EventPublisher(eventBus, 'HybridAgent');
        }
    }

    protected async processStep(
        userInput: string,
        stepIndex: number,
    ): Promise<{
        continueProcessing: boolean;
        agentStep: AgentStep;
    }> {
        // 如果有事件总线，使用事件驱动
        if (this.eventPublisher) {
            await this.eventPublisher.publishAgentEvent(
                'agent.step.started',
                stepIndex,
                this.sessionId
            );
        }

        // 执行原有逻辑
        const result = await super.processStep(userInput, stepIndex);

        // 如果有事件总线，发布完成事件
        if (this.eventPublisher) {
            await this.eventPublisher.publishAgentEvent(
                'agent.step.completed',
                stepIndex,
                this.sessionId,
                { step: result.agentStep }
            );
        }

        // 如果有旧的回调，也要调用
        if (this.callbacks?.onAgentStep) {
            this.callbacks.onAgentStep(result.agentStep);
        }

        return result;
    }
}
```

## 7. 测试策略

### 7.1 单元测试

```typescript
// packages/core/__tests__/event-bus.test.ts
describe('EventBus', () => {
    let eventBus: EventBus;

    beforeEach(() => {
        eventBus = new EventBus();
    });

    test('should subscribe and publish events', async () => {
        const handler = jest.fn();
        
        eventBus.subscribe(['test.event'], handler);
        
        await eventBus.publish({
            type: 'test.event',
            timestamp: Date.now(),
            source: 'test'
        });

        expect(handler).toHaveBeenCalledTimes(1);
    });

    test('should filter events correctly', async () => {
        const handler = jest.fn();
        
        eventBus.subscribe(['test.event'], handler, {
            sessionId: 'session1'
        });
        
        await eventBus.publish({
            type: 'test.event',
            timestamp: Date.now(),
            source: 'test',
            sessionId: 'session2'
        });

        expect(handler).not.toHaveBeenCalled();
    });
});
```

### 7.2 集成测试

```typescript
// packages/core/__tests__/event-integration.test.ts
describe('Event Integration', () => {
    let eventBus: EventBus;
    let agent: StreamAgentV2;
    let client: ReactCLIClientV2;

    beforeEach(() => {
        eventBus = new EventBus();
        agent = new StreamAgentV2(/* params */, eventBus);
        client = new ReactCLIClientV2(/* config */, eventBus);
    });

    test('should handle complete user input flow', async () => {
        const messages: any[] = [];
        
        // 监听UI消息
        eventBus.subscribe(['ui.message.added'], (event) => {
            messages.push(event);
        });

        // 发送用户输入
        await client.sendMessageToAgent('Hello');

        // 验证事件流
        expect(messages).toContainEqual(
            expect.objectContaining({
                type: 'ui.input.received'
            })
        );
    });
});
```

## 8. 性能考虑

### 8.1 事件优化

```typescript
// packages/core/event-bus/event-optimizer.ts
export class EventOptimizer {
    private batchSize = 100;
    private batchTimeout = 10; // ms
    private eventBatch: AppEvent[] = [];
    private batchTimer?: NodeJS.Timeout;

    constructor(private eventBus: IEventBus) {}

    async publishBatch(events: AppEvent[]): Promise<void> {
        this.eventBatch.push(...events);
        
        if (this.eventBatch.length >= this.batchSize) {
            await this.flushBatch();
        } else if (!this.batchTimer) {
            this.batchTimer = setTimeout(() => {
                this.flushBatch();
            }, this.batchTimeout);
        }
    }

    private async flushBatch(): Promise<void> {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }

        const batch = this.eventBatch.slice();
        this.eventBatch = [];

        // 并行处理批次
        await Promise.all(batch.map(event => this.eventBus.publish(event)));
    }
}
```

这个实现计划提供了：

1. **完整的阶段划分**：清晰的4个阶段，每个阶段都有明确的目标
2. **详细的实现代码**：每个组件的具体实现示例
3. **向后兼容性**：提供渐进式迁移策略
4. **性能优化**：批处理和监控机制
5. **测试策略**：单元测试和集成测试
6. **错误处理**：完善的错误处理和恢复机制

你觉得这个方案怎么样？关于最终架构 `IClient{agent:IAgent, sessionManager: ISessionManager, eventBus: IEventBus}` 我完全同意，这样的架构确实更加合理和清晰。 