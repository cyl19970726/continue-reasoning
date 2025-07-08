# 回调架构 v2 - 职责分离设计

## 🎯 设计目标

1. **职责分离**：SessionManager 专注会话管理，Client 专注 UI 交互
2. **避免重复**：每个回调只被处理一次，避免重复调用
3. **逻辑清晰**：明确谁处理什么，减少混乱
4. **易于扩展**：新的回调类型容易添加和维护

## 🏗️ 架构概览

```
Agent ----setCallBacks----> MergedCallbacks
                                 |
                                 v
                    ┌─────────────────────────┐
                    │   SessionManager        │
                    │   ┌─────────────────┐   │
                    │   │ sessionSpecific │   │  
                    │   │ Callbacks       │   │
                    │   └─────────────────┘   │
                    └─────────────────────────┘
                                 ∪
                    ┌─────────────────────────┐
                    │   Client                │
                    │   ┌─────────────────┐   │
                    │   │ agentCallbacks  │   │
                    │   └─────────────────┘   │
                    └─────────────────────────┘
```

## 📝 职责分工

### SessionManager 职责
负责**会话生命周期和状态管理**：

- `loadAgentStorage` - 加载会话存储（优先使用客户端逻辑，回退到本地存储）
- `onStateStorage` - 保存会话状态
- `onSessionStart` - 会话开始的系统处理
- `onSessionEnd` - 会话结束的系统处理

### Client 职责
负责**用户界面和交互逻辑**：

- `onAgentStep` - 显示 Agent 步骤
- `onToolCallStart` - 显示工具调用开始
- `onToolExecutionEnd` - 显示工具执行结果
- `onLLMTextDelta` - 实时显示 LLM 输出
- `onLLMTextDone` - 处理 LLM 输出完成
- `onError` - 显示错误信息

### 特殊处理
某些回调需要同时通知 SessionManager 和 Client：

- **错误处理**：Client 显示错误，SessionManager 记录到外部系统
- **工具执行**：Client 显示结果，SessionManager 通知外部监听器
- **Agent 步骤**：Client 显示步骤，SessionManager 记录到外部系统

## 🔄 回调流程

### 1. 初始化阶段
```typescript
// 1. 创建 SessionManager
const sessionManager = new SessionManager(agent);

// 2. 创建 Client 并设置回调
const client = new SimpleClient();
client.setAgentCallbacks(clientCallbacks);

// 3. 连接 SessionManager 和 Client
client.setSessionManager(sessionManager); // 这会调用 sessionManager.setClient(client)

// 4. SessionManager 内部合并回调并传递给 Agent
sessionManager.setupAgentCallbacks();
```

### 2. 运行时回调流程
```typescript
// Agent 触发回调 -> MergedCallbacks -> 分别处理

// 例如：工具执行结束
Agent.onToolExecutionEnd(result) -> {
  clientCallbacks.onToolExecutionEnd(result);     // Client: 显示结果
  sessionManager.callbacks.onToolExecutionEnd(result); // 外部: 记录日志
}

// 例如：状态存储
Agent.onStateStorage(state) -> {
  sessionManager.saveSession(state.sessionId, state);  // SessionManager: 保存到本地
  clientCallbacks.onStateStorage(state);               // Client: 可能显示状态
}
```

## 🛠️ 实现详情

### SessionManager.setupAgentCallbacks()
```typescript
private setupAgentCallbacks(): void {
  const clientCallbacks = this.client?.agentCallbacks;
  
  // 1. 定义 SessionManager 专属回调
  const sessionSpecificCallbacks: AgentCallbacks = {
    loadAgentStorage: async (sessionId) => {
      // 优先使用 client 的自定义存储
      if (clientCallbacks?.loadAgentStorage) {
        const result = await clientCallbacks.loadAgentStorage(sessionId);
        if (result) return result;
      }
      // 回退到本地存储
      return await this.loadSession(sessionId);
    },
    onStateStorage: (state) => {
      this.saveSession(state.sessionId, state);  // 本地保存
      clientCallbacks?.onStateStorage?.(state);  // 通知 client
    }
    // ... 其他会话相关回调
  };
  
  // 2. 合并回调
  const mergedCallbacks: AgentCallbacks = {
    ...clientCallbacks,           // Client 回调优先
    ...sessionSpecificCallbacks, // SessionManager 回调覆盖
    
    // 3. 特殊处理需要双重通知的回调
    onToolExecutionEnd: (result) => {
      clientCallbacks?.onToolExecutionEnd?.(result);
      this.callbacks?.onToolExecutionEnd?.(result);
    }
  };
  
  // 4. 传递给 Agent
  this.agent.setCallBacks(mergedCallbacks);
}
```

### Client 实现示例
```typescript
export class SimpleClient implements IClient {
  agentCallbacks?: AgentCallbacks;
  
  constructor() {
    this.agentCallbacks = {
      onAgentStep: (step) => {
        console.log(`🤖 Step ${step.stepIndex}`);
      },
      onToolCallStart: (toolCall) => {
        console.log(`🔧 Tool: ${toolCall.name}`);
      },
      onToolExecutionEnd: (result) => {
        console.log(`✅ Result: ${result.name}`);
      },
      loadAgentStorage: async (sessionId) => {
        // 如果 client 有自定义存储逻辑，在这里实现
        // 返回 null 表示使用 SessionManager 的默认存储
        return null;
      }
    };
  }
}
```

## ✅ 优势

1. **清晰的职责边界**：SessionManager 管会话，Client 管界面
2. **避免重复调用**：每个回调有明确的处理者
3. **灵活的存储策略**：Client 可以自定义存储，也可以使用默认存储
4. **向后兼容**：保持与外部回调系统的兼容性
5. **易于测试**：职责分离使单元测试更容易

## 🔄 迁移指南

### 从 v1 迁移到 v2

1. **Client 实现**：
   ```typescript
   // 旧方式
   class MyClient implements IClient {
     handleAgentStep(step) { ... }
     handleToolCall(toolCall) { ... }
   }
   
   // 新方式
   class MyClient implements IClient {
     agentCallbacks = {
       onAgentStep: (step) => { ... },
       onToolCallStart: (toolCall) => { ... }
     };
   }
   ```

2. **SessionManager 使用**：
   ```typescript
   // 旧方式
   sessionManager.setCallbacks({
     onAgentStep: (step) => client.handleAgentStep(step)
   });
   
   // 新方式
   client.setAgentCallbacks(myCallbacks);
   sessionManager.setClient(client); // 自动连接
   ```

## 🚀 未来扩展

这个架构支持以下扩展：

1. **多 Client 支持**：SessionManager 可以连接多个 Client
2. **回调插件**：可以添加回调中间件进行处理
3. **存储抽象**：可以轻松切换不同的存储后端
4. **事件流**：可以轻松添加事件流处理 