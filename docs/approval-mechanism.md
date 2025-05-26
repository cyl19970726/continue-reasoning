# Interactive Approval Mechanism

本文档详细介绍了 HHH-AGI 系统中的交互式权限确认机制，包括设计理念、实现细节和使用方法。

## 概述

Interactive Approval Mechanism 是一个基于事件驱动的用户权限确认系统，允许 Agent 在执行潜在风险操作前请求用户批准。该机制通过 EventBus 实现 Agent 和不同 Interactive Layer（CLI、Web UI）之间的解耦通信。

## 架构设计

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│     Agent       │    │    EventBus     │    │ Interactive     │
│                 │    │                 │    │ Layer           │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │Interactive  │ │    │ │ Publish/    │ │    │ │ CLI Client  │ │
│ │Context      │◄┼────┼►│ Subscribe   │◄┼────┼►│ Web Client  │ │
│ │             │ │    │ │ System      │ │    │ │ etc.        │ │
│ └─────────────┘ │    │ └─────────────┘ │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 核心组件

### 1. InteractiveContext

**位置：** `src/core/contexts/interactive.ts`

提供了 Agent 与用户交互的统一接口，包含以下工具：

- `approval_request`: 请求用户批准操作
- `list_pending_approvals`: 查看待处理的权限请求

**主要功能：**
- 管理待处理和已完成的权限请求
- 跟踪权限历史记录
- 提供超时机制
- 支持不同风险级别的操作分类

### 2. EventBus 事件系统

**核心事件类型：**

#### ApprovalRequestEvent
```typescript
{
  type: 'approval_request',
  source: 'agent',
  sessionId: string,
  payload: {
    actionType: 'file_write' | 'file_delete' | 'command_execute' | 'git_operation' | 'network_access',
    description: string,
    details: {
      command?: string,
      filePaths?: string[],
      riskLevel: 'low' | 'medium' | 'high' | 'critical',
      preview?: string
    },
    timeout?: number
  }
}
```

#### ApprovalResponseEvent  
```typescript
{
  type: 'approval_response',
  source: 'user',
  sessionId: string,
  payload: {
    requestId: string,
    decision: 'accept' | 'reject' | 'modify',
    modification?: string,
    rememberChoice?: boolean
  }
}
```

### 3. Interactive Layer

**基类：** `BaseInteractiveLayer` (`src/core/events/interactiveLayer.ts`)

实现了双模式消息处理：
- **回调模式：** 事件到达时立即处理
- **轮询模式：** 主动获取待处理消息

**关键方法：**
- `addToMessageQueue()`: 将事件加入本地队列
- `receiveMessage()`: 异步获取下一个消息
- `subscribe()`: 订阅特定事件类型

## 使用方法

### 1. Agent 端使用

#### 在 Agent 中添加 InteractiveContext：

```typescript
import { InteractiveContext } from './contexts/interaction';

const agent = new BaseAgent(
  // ... 其他参数
  [
    // ... 其他contexts
    InteractiveContext
  ],
  eventBus // 必须提供 EventBus
);
```

#### 使用 approval_request 工具：

```typescript
// Agent 在需要权限时调用
const result = await approvalTool.execute({
  actionType: 'file_write',
  description: 'Create database configuration file',
  details: {
    filePaths: ['./config/database.json'],
    riskLevel: 'medium',
    preview: JSON.stringify(configData, null, 2)
  },
  timeout: 30000
}, agent);

if (result.approved) {
  // 执行批准的操作
  await fs.writeFile('./config/database.json', configData);
} else {
  // 处理拒绝情况
  console.log('Operation cancelled by user');
}
```

### 2. CLI Client 端

CLI Client 自动处理 approval_request 事件：

```typescript
const cliClient = new CLIClient(config);
await cliClient.start();

// CLI 会自动显示权限请求界面：
// ⚠️  Approval Required
// Description: Create database configuration file
// Risk Level: medium
// Preview:
// {
//   "host": "localhost",
//   "port": 5432
// }
// Do you approve this action? (y/n/m for modify):
```

### 3. Web UI Client 端

Web UI 通过 WebSocket 实时接收和处理事件：

```typescript
// 前端接收 approval_request 事件
socket.on('approval_request', (event) => {
  // 显示权限确认UI
  showApprovalDialog(event);
});

// 用户点击批准后发送响应
function approveRequest(requestId, decision) {
  const response = {
    type: 'approval_response',
    sessionId: currentSession,
    payload: {
      requestId,
      decision,
      rememberChoice: false
    }
  };
  socket.send(JSON.stringify(response));
}
```

## 配置和扩展

### 风险级别指导

- **low**: 只读操作，查看文件内容
- **medium**: 写入文件，修改配置
- **high**: 执行系统命令，网络访问
- **critical**: 删除文件，Git 操作

### 超时设置

```typescript
// 默认30秒超时
timeout: 30000

// 对于critical操作建议更长超时
timeout: 60000
```

### 自定义 Interactive Layer

继承 `BaseInteractiveLayer` 实现自定义客户端：

```typescript
class CustomInteractiveLayer extends BaseInteractiveLayer {
  async sendMessage(message: InteractiveMessage): Promise<void> {
    // 自定义消息发送逻辑
  }

  protected async onStart(): Promise<void> {
    // 订阅需要的事件类型
    this.subscribe(['approval_request'], this.handleApproval.bind(this));
  }

  private async handleApproval(message: InteractiveMessage): Promise<void> {
    // 自定义批准处理逻辑
  }
}
```

## 测试和验证

### 运行测试脚本

```bash
# 基础事件机制测试
npx tsx scripts/test-approval.ts

# 完整工作流示例
npx tsx examples/approval-workflow-example.ts
```

### 测试覆盖

- ✅ EventBus 事件发布和订阅
- ✅ 权限请求和响应流程
- ✅ 超时机制
- ✅ 多种决策类型（accept/reject/modify）
- ✅ CLI 和 Web UI 集成

## 最佳实践

### 1. 权限粒度控制

```typescript
// 好的做法：明确描述操作
description: 'Create database.json with connection settings'

// 避免：模糊描述
description: 'Modify files'
```

### 2. 预览内容

```typescript
// 提供有用的预览
preview: JSON.stringify(configContent, null, 2)

// 对于命令执行
preview: `Command: ${command}\nWorking Directory: ${cwd}`
```

### 3. 错误处理

```typescript
try {
  const result = await approvalTool.execute(params, agent);
  if (!result.approved) {
    throw new Error(`Operation rejected: ${result.error || 'User denied'}`);
  }
} catch (error) {
  // 处理超时或其他错误
  logger.error('Approval failed:', error);
}
```

### 4. 会话管理

```typescript
// 确保在正确的会话中进行权限请求
const sessionId = agent.eventBus.getActiveSessions()[0] || 
                  agent.eventBus.createSession();
```

## 后续扩展

### 计划中的功能

1. **权限策略系统**: 基于规则的自动批准
2. **批量操作支持**: 一次性批准多个相关操作
3. **权限模板**: 预定义的权限组合
4. **审计日志**: 详细的权限使用记录
5. **协作增强**: 支持多用户协作审批

### CollaborationRequest/Response

类似的机制也适用于协作请求：

```typescript
// Agent 请求协作
await eventBus.publish({
  type: 'collaboration_request',
  payload: {
    problemType: 'error_resolution',
    context: {
      description: 'Build failed with TypeScript errors',
      errorMessage: 'Type conflicts detected',
      suggestions: ['Update type definitions', 'Add type assertions']
    },
    urgency: 'high'
  }
});
```

## 总结

Interactive Approval Mechanism 为 HHH-AGI 提供了：

- 🔒 **安全性**: 防止意外的系统修改
- 🤝 **用户控制**: 用户对 Agent 行为有最终决定权
- 🔄 **灵活性**: 支持多种客户端和使用场景
- 📊 **可追溯**: 完整的权限使用历史记录
- 🚀 **可扩展**: 易于添加新的交互类型和客户端

通过这个机制，Agent 可以在保持自主性的同时，确保关键操作得到用户的明确授权，实现了安全和效率的平衡。 