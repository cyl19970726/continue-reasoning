# 事件驱动架构方案

## 概述

这个方案旨在解决当前系统中的回调地狱问题，将现有的基于回调的架构转换为基于事件总线的松耦合架构。

## 问题分析

### 当前的回调地狱

```
ReactCLIClient -> AgentCallbacks -> SessionManager -> Agent -> LLM -> ToolExecutor
     ↓              ↓             ↓           ↓       ↓         ↓
 UI Updates    Session Events   Agent Events  LLM Events  Tool Events
```

### 主要问题

1. **紧耦合**: 组件间存在直接依赖
2. **回调链过长**: 事件传播需要经过多个层级
3. **状态同步复杂**: 多个组件需要维护同步状态
4. **难以扩展**: 添加新组件需要修改现有代码
5. **调试困难**: 事件流不透明
6. **内存泄漏风险**: 回调引用可能导致内存泄漏

## 解决方案

### 核心架构

```
                    ┌─────────────────┐
                    │    EventBus     │
                    │  (Central Hub)  │
                    └─────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌─────────┐         ┌─────────┐         ┌─────────┐
   │ Client  │         │ Session │         │  Agent  │
   │         │         │ Manager │         │         │
   └─────────┘         └─────────┘         └─────────┘
```

### 最终架构

```typescript
interface IClient {
    agent: IAgent;
    sessionManager: ISessionManager;
    eventBus: IEventBus;
}
```

## 核心特性

### 1. 事件类型系统

- **SessionEvent**: 会话生命周期事件
- **AgentEvent**: Agent执行事件
- **LLMEvent**: LLM处理事件（支持流式和非流式调用）
- **ToolEvent**: 工具执行事件
- **UIEvent**: UI交互事件
- **ErrorEvent**: 错误处理事件
- **StorageEvent**: 存储操作事件

#### LLM事件设计特色

基于现有的`LLMStreamChunk`设计，支持两种调用模式：

**流式调用 (`callStream`)**:
- `llm.call.started` → `llm.text.delta` (多次) → `llm.tool.call.started` → `llm.tool.call.completed` → `llm.text.completed` → `llm.call.completed`

**非流式调用 (`callAsync`)**:
- `llm.call.started` → `llm.text.completed` → `llm.tool.call.completed` → `llm.call.completed`

事件映射通过`LLMEventMapper`工具类自动处理，确保了与现有`LLMStreamChunk`的完全兼容。

### 2. 事件总线功能

- **类型安全**: 强类型事件定义
- **事件过滤**: 灵活的过滤机制
- **历史记录**: 事件历史追踪
- **性能监控**: 事件统计和监控
- **错误处理**: 完善的错误处理机制

### 3. 组件解耦

- **EventPublisher**: 事件发布者基类
- **EventSubscriber**: 事件订阅者基类
- **无直接依赖**: 组件间通过事件总线通信

## 实现计划

### Phase 1: 基础设施 (1-2 weeks)
- EventBus核心实现
- 事件类型定义
- Publisher/Subscriber基类
- 测试框架

### Phase 2: 核心组件迁移 (2-3 weeks)
- Agent事件化
- SessionManager事件化
- LLM事件化
- ToolExecutor事件化

### Phase 3: 客户端迁移 (1-2 weeks)
- ReactCLIClient事件化
- 其他客户端事件化
- 回调接口清理

### Phase 4: 增强功能 (1-2 weeks)
- 事件持久化
- 性能监控
- 调试工具
- 错误恢复

## 优势

### 1. 解耦优势
- 组件独立开发和测试
- 易于扩展新组件
- 职责单一原则

### 2. 可观测性
- 事件追踪和调试
- 性能监控
- 错误隔离

### 3. 扩展性
- 插件化架构
- 动态订阅机制
- 事件过滤和路由

### 4. 测试友好
- Mock事件总线
- 事件断言
- 组件隔离测试

## 迁移策略

### 1. 向后兼容
- 提供回调桥接器
- 渐进式迁移
- 平滑过渡

### 2. 风险控制
- 阶段性实施
- 充分测试
- 回滚机制

### 3. 性能优化
- 事件批处理
- 内存管理
- 并发控制

## 文档结构

```
docs/v1/event/
├── README.md                    # 本文档
├── event-driven-architecture.md # 详细架构设计
├── event-flow-diagram.md        # 事件流图和订阅关系
└── implementation-plan.md       # 详细实现计划
```

## 相关文件

- `packages/core/interfaces/events.ts` - 事件接口定义
- `packages/core/event-bus/` - 事件总线实现
- `packages/core/interfaces/client.ts` - 客户端接口
- `packages/core/interfaces/session.ts` - 会话管理接口
- `packages/core/interfaces/agent.ts` - Agent接口

## 总结

这个事件驱动架构方案将彻底解决当前的回调地狱问题，提供：

1. **松耦合的组件架构**
2. **类型安全的事件系统**
3. **强大的调试和监控能力**
4. **良好的扩展性和可维护性**
5. **完整的迁移策略**

最终的架构 `IClient{agent:IAgent, sessionManager: ISessionManager, eventBus: IEventBus}` 将为系统提供清晰、可靠、可扩展的基础。 