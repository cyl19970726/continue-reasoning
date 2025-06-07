# InteractiveMemory 实现计划 v2.0 - 客户端架构

## 架构重新设计概述

基于用户的重要反馈，我们将 InteractiveMemory 从 Agent 端移动到客户端，这样：
- 用户数据属于用户，存储在客户端
- Agent 通过事件机制向客户端请求对话历史
- 保持架构清晰，各组件职责分明
- 支持多 Agent 为同一用户服务的场景

## 实施阶段

### 阶段 1: 事件系统扩展 ✅
- [x] 定义对话历史请求/响应事件
- [x] 更新 crossEvents.ts 包含新事件类型
- [x] 🆕 更新 UserMessageEvent 添加 conversationHistory 参数
- [x] 确保事件类型的完整性

### 阶段 2: Agent 端历史接收能力 ✅
- [x] 🆕 更新 IAgent 接口的 startWithUserInput 方法添加 conversationHistory 参数
- [x] 🆕 更新 IAgent 接口的 processUserInput 方法添加 conversationHistory 参数
- [x] 🆕 在 BaseAgent 中实现对话历史存储和 prompt 构建
- [x] 🆕 更新 handleUserMessage 处理事件中的历史参数
- [x] 🆕 增强 getPrompt 方法自动包含对话历史
- [x] 🆕 **思考系统集成**: 更新 ThinkingOrchestrator.processUserInput 支持历史参数
- [x] 🆕 **思考系统集成**: 在 BaseAgent.processStepWithThinking 中传递历史给思考系统

### 阶段 3: BaseInteractiveLayer 增强 (进行中)
- [ ] 集成 InteractiveMemory 到 BaseInteractiveLayer
- [ ] 实现对话历史请求处理机制（备用方案）
- [ ] 添加自动对话记录功能
- [ ] 实现抽象方法供子类实现

### 阶段 4: 具体客户端实现
- [ ] 增强 CLIClient 实现
- [ ] 添加历史查看和搜索命令
- [ ] 🆕 实现 sendUserMessageWithHistory 方法
- [ ] 实现用户友好的显示格式
- [ ] 确保跨会话数据持久化

### 阶段 5: 测试和优化
- [ ] 单元测试
- [ ] 集成测试
- [ ] 性能测试
- [ ] 文档完善

## 🎯 架构优化亮点

### 完整的思考系统历史支持

新架构不仅支持直接参数传递，还完全集成了思考系统：

```typescript
// ✅ 思考系统自动接收历史
await thinkingSystem.processUserInput(userInput, sessionId, tools, conversationHistory);

// ✅ BaseAgent 自动转换格式并传递
const thinkingConversationHistory = this.currentConversationHistory?.map(record => ({
  id: record.id,
  role: record.role === 'agent' ? 'agent' as const : record.role,
  content: record.content,
  timestamp: record.timestamp,
  metadata: record.metadata
}));
```

### 思考系统 Prompt 结构

思考系统会在 buildPrompt 方法中自动包含对话历史：

```
# System Prompt
...

# Context Section  
...

## Conversation History      ← 🆕 自动包含
**user**: 之前的对话内容
**assistant**: 之前的回复内容

## Execution History         ← 思考和工具调用历史
...

## Thinking Protocol
...

## Current Step Input        ← 当前用户输入
...
```

### 简化的历史传递机制

相比之前的异步请求/响应模式，新架构采用**直接参数传递**：

```typescript
// ❌ 旧方案：复杂的异步请求
Agent.getConversationHistory() -> EventBus -> Client -> EventBus -> Agent

// ✅ 新方案：简单的参数传递  
Client -> UserMessageEvent(with history) -> Agent.handleUserMessage()
```

### 核心改进

1. **🚀 性能提升**：
   - 无需异步请求，减少延迟
   - 历史在 prompt 构建时直接添加
   - 客户端可以缓存最近历史

2. **🎯 简化架构**：
   - 移除复杂的请求/响应事件处理
   - Agent 端只需接收历史，无需主动请求
   - 客户端完全控制历史传递

3. **🔧 易于使用**：
   - 支持事件驱动和直接调用两种方式
   - 向后兼容现有接口
   - 历史参数都是可选的

## 具体实现步骤

### 步骤 1: Agent 端历史接收 ✅

```typescript
// 🆕 已完成：Agent 接收历史的三种方式

// 方式1：通过 startWithUserInput
await agent.startWithUserInput(userInput, maxSteps, {
  conversationHistory: [...] // 🆕 新增参数
});

// 方式2：通过 processUserInput  
await agent.processUserInput(input, sessionId, conversationHistory); // 🆕 新增参数

// 方式3：通过 UserMessageEvent
await eventBus.publish({
  type: 'user_message',
  payload: {
    content: '...',
    conversationHistory: [...] // 🆕 新增字段
  }
});
```

### 步骤 2: Prompt 自动构建 ✅

```typescript
// 🆕 已完成：Agent 的 getPrompt 自动包含历史
public async getPrompt(): Promise<string> {
  const basePrompt = await this.contextManager.renderPrompt();
  
  // 🆕 自动添加对话历史
  if (this.currentConversationHistory?.length > 0) {
    const historyContext = this.buildConversationHistoryContext(this.currentConversationHistory);
    return basePrompt + historyContext;
  }
  
  return basePrompt;
}
```

### 步骤 3: 客户端历史管理

```typescript
// 🆕 待实现：客户端发送历史的便捷方法
export class EnhancedCLIClient extends BaseInteractiveLayer {
  // 发送包含历史的用户消息
  async sendUserMessageWithHistory(content: string): Promise<void> {
    const recentHistory = await this.interactiveMemory.getConversationHistory(
      this.currentSession, 5
    );

    await this.sendMessage({
      type: 'user_message',
      payload: {
        content,
        conversationHistory: recentHistory // 🆕 自动包含历史
      }
    });
  }
}
```

## 使用场景对比

### 场景 1: 简单对话（无历史需求）

```typescript
// 保持向后兼容，无需修改现有代码
await agent.startWithUserInput('Hello', 10);
await agent.processUserInput('Hello', 'session-123');
```

### 场景 2: 上下文对话（需要历史）

```typescript
// 🆕 新功能：轻松添加历史上下文
await agent.startWithUserInput('继续之前的任务', 10, {
  conversationHistory: recentHistory
});
```

### 场景 3: 事件驱动对话

```typescript
// 🆕 客户端自动包含历史
await cliClient.sendUserMessageWithHistory('请优化代码');
// Agent 自动接收历史并在 prompt 中使用
```

## 性能优化策略

### 1. 客户端缓存

```typescript
class OptimizedClient extends BaseInteractiveLayer {
  private historyCache = new Map<string, ConversationRecord[]>();
  
  private async getCachedHistory(sessionId: string): Promise<ConversationRecord[]> {
    if (!this.historyCache.has(sessionId)) {
      const history = await this.interactiveMemory.getConversationHistory(sessionId, 5);
      this.historyCache.set(sessionId, history);
    }
    return this.historyCache.get(sessionId)!;
  }
}
```

### 2. 历史过滤

```typescript
// 只传递相关的历史记录
const relevantHistory = fullHistory.filter(record => 
  record.role !== 'system' && 
  record.content.length > 10 &&
  !record.metadata?.isCommand
).slice(-5); // 最近5条
```

### 3. 渐进式加载

```typescript
// 根据对话复杂度动态调整历史数量
const historyLimit = userInput.includes('之前') || userInput.includes('刚才') ? 10 : 3;
```

## 下一步行动

1. **立即实现** ✅: Agent 端历史接收能力（已完成）
2. **并行进行**: 实现 BaseInteractiveLayer 的 InteractiveMemory 集成
3. **测试验证**: 创建端到端测试验证历史传递功能
4. **完善客户端**: 增强 CLIClient 实现 sendUserMessageWithHistory
5. **性能优化**: 实现缓存和批量操作优化

这个优化后的架构具有：
- ✅ **简单高效**：直接参数传递，无异步复杂性
- ✅ **向后兼容**：不破坏现有接口
- ✅ **灵活使用**：支持多种使用方式
- ✅ **性能优秀**：减少网络请求，支持缓存优化

你觉得这个重新设计的实现计划如何？我们是否可以开始实施？ 