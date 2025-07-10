# ReactCLIClient 事件架构重构方案

## 概述

根据最新的事件驱动架构设计，需要将 ReactCLIClient 从基于 AgentCallbacks 的回调模式迁移到基于 EventBus 的事件驱动模式。

## 现状分析

### 当前架构问题

1. **紧耦合**: ReactCLIClient 直接依赖 AgentCallbacks 接口
2. **复杂的回调链**: 需要手动初始化和管理多个回调函数
3. **状态同步复杂**: UI 状态更新依赖回调触发
4. **难以扩展**: 添加新的事件类型需要修改多个地方

### 现有代码结构
```typescript
export class ReactCLIClient implements IClient {
  agentCallbacks?: AgentCallbacks;  // ❌ 已废弃
  
  constructor(config: ReactCLIConfig) {
    // ❌ 手动初始化回调
    this.agentCallbacks = {
      onAgentStep: (step) => this.handleAgentStep(step),
      onToolExecutionStart: (toolCall) => this.handleToolExecutionStart(toolCall),
      // ... 更多回调
    };
  }
}
```

## 目标架构

### 新的事件驱动架构
```typescript
export class ReactCLIClient implements IClient {
  eventBus?: IEventBus;  // ✅ 事件总线
  
  constructor(config: ReactCLIConfig) {
    // ✅ 无需手动初始化回调
    // 事件订阅将在 setEventBus 中设置
  }
  
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
    this.setupEventSubscriptions();
  }
}
```

## 重构计划

### Phase 1: 基础设施迁移

#### 1.1 更新接口依赖
```typescript
// 移除
import { AgentCallbacks } from '@continue-reasoning/core';

// 添加
import { 
  IEventBus, 
  AppEvent, 
  SessionEvent, 
  AgentEvent, 
  LLMEvent, 
  ToolEvent, 
  UIEvent,
  ErrorEvent,
  EventHandler 
} from '@continue-reasoning/core';
```

#### 1.2 更新类属性
```typescript
export class ReactCLIClient implements IClient {
  // 移除
  agentCallbacks?: AgentCallbacks;
  
  // 添加
  eventBus?: IEventBus;
  private eventSubscriptionIds: string[] = [];
}
```

#### 1.3 实现 IClient 新接口
```typescript
// 实现新的 setEventBus 方法
setEventBus(eventBus: IEventBus): void {
  this.eventBus = eventBus;
  this.setupEventSubscriptions();
}

// 移除旧的 setAgentCallbacks 方法
// setAgentCallbacks(callbacks: AgentCallbacks): void { ... }
```

### Phase 2: 事件订阅设置

#### 2.1 统一事件订阅管理
```typescript
private setupEventSubscriptions(): void {
  if (!this.eventBus) return;
  
  // 清理现有订阅
  this.cleanupSubscriptions();
  
  // 设置新订阅
  this.subscribeToSessionEvents();
  this.subscribeToAgentEvents();
  this.subscribeToLLMEvents();
  this.subscribeToToolEvents();
  this.subscribeToErrorEvents();
}
```

#### 2.2 分类事件订阅

**会话事件**
```typescript
private subscribeToSessionEvents(): void {
  // 会话开始
  const sessionStartId = this.eventBus!.subscribe(
    'session.started',
    this.handleSessionStarted.bind(this)
  );
  
  // 会话结束
  const sessionEndId = this.eventBus!.subscribe(
    'session.ended',
    this.handleSessionEnded.bind(this)
  );
  
  this.eventSubscriptionIds.push(sessionStartId, sessionEndId);
}

private handleSessionStarted(event: SessionEvent): void {
  if (event.type === 'session.started') {
    this.currentSessionId = event.sessionId;
    this.addMessage({
      id: `session_start_${Date.now()}`,
      content: `🚀 Session started: ${event.sessionId}`,
      type: 'system',
      timestamp: Date.now()
    });
  }
}
```

**Agent事件**
```typescript
private subscribeToAgentEvents(): void {
  // Agent 步骤完成
  const stepId = this.eventBus!.subscribe(
    'agent.step.completed',
    this.handleAgentStepCompleted.bind(this)
  );
  
  this.eventSubscriptionIds.push(stepId);
}

private handleAgentStepCompleted(event: AgentEvent): void {
  if (event.type === 'agent.step.completed' && event.data?.step) {
    const stepMessage: ClientMessage = {
      id: `step_${event.stepIndex}`,
      content: this.formatAgentStep(event.data.step),
      type: 'agent',
      timestamp: Date.now(),
      stepIndex: event.stepIndex,
      metadata: { step: event.data.step }
    };
    
    this.addMessage(stepMessage);
  }
}
```

**LLM事件**
```typescript
private subscribeToLLMEvents(): void {
  if (!this.isStreamingMode()) return;
  
  // 文本增量 (流式模式)
  const textDeltaId = this.eventBus!.subscribe(
    'llm.text.delta',
    this.handleLLMTextDelta.bind(this)
  );
  
  // 文本完成
  const textCompleteId = this.eventBus!.subscribe(
    'llm.text.completed',
    this.handleLLMTextCompleted.bind(this)
  );
  
  this.eventSubscriptionIds.push(textDeltaId, textCompleteId);
}

private handleLLMTextDelta(event: LLMEvent): void {
  if (event.type === 'llm.text.delta' && event.data?.content) {
    this.handleStreamDelta(event.data.content);
  }
}
```

**工具事件**
```typescript
private subscribeToToolEvents(): void {
  // 工具执行开始
  const toolStartId = this.eventBus!.subscribe(
    'tool.execution.started',
    this.handleToolExecutionStarted.bind(this)
  );
  
  // 工具执行完成
  const toolEndId = this.eventBus!.subscribe(
    'tool.execution.completed',
    this.handleToolExecutionCompleted.bind(this)
  );
  
  this.eventSubscriptionIds.push(toolStartId, toolEndId);
}

private handleToolExecutionStarted(event: ToolEvent): void {
  if (event.type === 'tool.execution.started' && event.data?.toolCall) {
    const paramsStr = event.data.toolCall.parameters && 
      Object.keys(event.data.toolCall.parameters).length > 0
        ? JSON.stringify(event.data.toolCall.parameters, null, 2)
        : 'No parameters';
    
    const message: ClientMessage = {
      id: `tool_start_${event.data.toolCall.call_id}`,
      content: `🔧 **${event.data.toolCall.name}**\n\`\`\`json\n${paramsStr}\n\`\`\``,
      type: 'tool',
      timestamp: Date.now(),
      metadata: { toolCall: event.data.toolCall, status: 'running' }
    };
    
    this.addMessage(message);
  }
}
```

### Phase 3: UI事件发布

#### 3.1 用户输入事件
```typescript
private handleUserSubmit(message: string): void {
  // 发布用户消息事件
  if (this.eventBus) {
    this.eventBus.publish({
      type: 'user.message',
      timestamp: Date.now(),
      source: 'ReactCLIClient',
      sessionId: this.currentSessionId,
      data: {
        messageContent: message,
        userId: this.config.userId,
        clientName: this.name,
        sessionId: this.currentSessionId
      }
    } as UIEvent);
  }
  
  // 继续现有逻辑
  if (this.resolveInput) {
    this.resolveInput(message);
    this.resolveInput = undefined;
  } else {
    this.sendMessageToAgent(message).catch(console.error);
  }
}
```

#### 3.2 UI状态变化事件
```typescript
private handleUIStateChange(state: Partial<UIState>): void {
  this.uiState = { ...this.uiState, ...state };
  
  // 发布UI状态变化事件
  if (this.eventBus) {
    this.eventBus.publish({
      type: 'ui.state.changed',
      timestamp: Date.now(),
      source: 'ReactCLIClient',
      sessionId: this.currentSessionId,
      data: {
        state: this.uiState,
        clientName: this.name
      }
    } as UIEvent);
  }
  
  this.onUIUpdate?.(this.uiState);
}
```

### Phase 4: 资源管理

#### 4.1 订阅清理
```typescript
private cleanupSubscriptions(): void {
  if (this.eventBus && this.eventSubscriptionIds.length > 0) {
    this.eventSubscriptionIds.forEach(id => {
      this.eventBus!.unsubscribe(id);
    });
    this.eventSubscriptionIds = [];
  }
}

async stop(): Promise<void> {
  this.isRunning = false;
  
  // 清理事件订阅
  this.cleanupSubscriptions();
  
  if (this.inkInstance) {
    this.inkInstance.unmount();
    this.inkInstance = undefined;
  }
}
```

#### 4.2 错误处理
```typescript
private subscribeToErrorEvents(): void {
  const errorId = this.eventBus!.subscribe(
    'error.occurred',
    this.handleError.bind(this),
    { sessionId: this.currentSessionId } // 只处理当前会话的错误
  );
  
  this.eventSubscriptionIds.push(errorId);
}

private handleError(event: ErrorEvent): void {
  if (event.type === 'error.occurred') {
    const errorMessage = event.data.error instanceof Error 
      ? event.data.error.message 
      : String(event.data.error);
    
    this.addMessage({
      id: `error_${Date.now()}`,
      content: `❌ Error: ${errorMessage}`,
      type: 'error',
      timestamp: Date.now(),
      metadata: { context: event.data.context }
    });
  }
}
```

## 代码兼容性

### 保持现有 UI 组件不变
```typescript
// App, MessageList, InputArea 等组件保持不变
// 只更新事件处理逻辑，UI 组件接口不变

// 移除的方法
// - setAgentCallbacks
// - 构造函数中的 agentCallbacks 初始化

// 添加的方法  
// - setEventBus
// - setupEventSubscriptions
// - cleanupSubscriptions
// - 各种事件处理方法
```

### 向后兼容处理
```typescript
// 如果需要支持旧的回调模式（临时兼容）
setAgentCallbacks(callbacks: AgentCallbacks): void {
  // 发出弃用警告
  console.warn('setAgentCallbacks is deprecated. Use event-driven architecture instead.');
  
  // 可以提供回调到事件的桥接
  // 但推荐直接使用事件模式
}
```

## 测试策略

### 单元测试
```typescript
describe('ReactCLIClient Event Handling', () => {
  let client: ReactCLIClient;
  let mockEventBus: IEventBus;
  
  beforeEach(() => {
    mockEventBus = new MockEventBus();
    client = new ReactCLIClient(config);
    client.setEventBus(mockEventBus);
  });
  
  it('should subscribe to session events', () => {
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      'session.started',
      expect.any(Function)
    );
  });
  
  it('should handle agent step events', async () => {
    const stepEvent: AgentEvent = {
      type: 'agent.step.completed',
      timestamp: Date.now(),
      source: 'TestAgent',
      stepIndex: 1,
      data: { step: mockStep }
    };
    
    await client.handleAgentStepCompleted(stepEvent);
    
    expect(client.getMessages()).toHaveLength(1);
    expect(client.getMessages()[0].type).toBe('agent');
  });
});
```

## 迁移时间表

### Week 1: 基础架构
- [ ] 更新接口依赖
- [ ] 实现 setEventBus 方法
- [ ] 设置事件订阅框架

### Week 2: 核心事件处理
- [ ] 实现会话事件处理
- [ ] 实现 Agent 事件处理
- [ ] 实现工具事件处理

### Week 3: 流式和 UI 事件
- [ ] 实现 LLM 事件处理
- [ ] 实现 UI 事件发布
- [ ] 错误处理和资源清理

### Week 4: 测试和优化
- [ ] 编写单元测试
- [ ] 集成测试
- [ ] 性能优化
- [ ] 文档更新

## 风险和缓解措施

### 风险识别
1. **事件丢失**: 订阅时机问题导致事件丢失
2. **内存泄漏**: 未正确清理事件订阅
3. **事件顺序**: 异步事件处理可能导致顺序问题

### 缓解措施
1. **事件重放**: EventBus 提供事件历史查询功能
2. **自动清理**: 在组件销毁时强制清理订阅
3. **序列化处理**: 对关键事件进行序列化处理

## 预期收益

### 短期收益
- 解耦 ReactCLIClient 和 Agent
- 简化回调管理
- 提高代码可维护性

### 长期收益
- 更好的扩展性
- 统一的事件处理模式
- 强大的调试和监控能力
- 支持插件化架构

## 总结

通过这个重构方案，ReactCLIClient 将：

1. **完全事件驱动**: 移除所有硬编码的回调依赖
2. **类型安全**: 利用 TypeScript 确保事件处理的正确性
3. **易于扩展**: 新的事件类型可以轻松添加
4. **资源安全**: 自动管理事件订阅生命周期
5. **调试友好**: 通过事件历史追踪系统行为

这个方案确保了平滑的迁移过程，同时为未来的功能扩展奠定了坚实的基础。