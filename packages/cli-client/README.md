# @continue-reasoning/cli-client

模块化的 CLI 客户端包，用于与 Continue Reasoning Agent 进行交互。实现了 `IClient` 接口，支持 Agent 步骤处理、工具调用显示和会话管理。

## 特性

- ✅ **IClient 接口实现** - 完整实现 Agent 回调处理
- 🎨 **美观的显示格式** - 专门的格式化工具用于思考、回复和工具调用
- 🔧 **工具调用跟踪** - 实时显示工具执行状态和结果
- 🛠️ **丰富的工具格式化** - 为不同工具类型提供专门的显示格式（详见 [format.md](./format.md)）
- ⚡ **Agent 中断支持** - 按 ESC 键可中断正在执行的 Agent
- 💬 **会话管理** - 支持创建、切换和管理多个会话
- 📝 **多行输入** - 支持 `###` 分隔符的多行模式
- 📚 **命令系统** - 内置帮助、会话管理等命令
- 🚀 **简化架构** - 直接通过 SessionManager 与 Agent 交互，无需事件总线

## 安装

```bash
npm install @continue-reasoning/cli-client
```

## 基本使用

### 快速启动

```typescript
import { startCLIClient } from '@continue-reasoning/cli-client';

// 基本启动
const client = await startCLIClient({
  name: 'My CLI Client',
  enableColors: true
});
```

### 与 SessionManager 集成（推荐）

```typescript
import { createCLIClientWithSession } from '@continue-reasoning/cli-client';
import { SessionManager } from '@continue-reasoning/core';

// 创建带会话管理的客户端
const client = createCLIClientWithSession(sessionManager, {
  name: 'Agent CLI',
  userId: 'user123',
  enableTimestamps: true
});

await client.start();
```

## IClient 接口实现

CLI Client 实现了完整的 `IClient` 接口：

```typescript
interface IClient {
  name: string;
  currentSessionId?: string;
  
  // Agent 回调处理
  handleAgentStep(step: AgentStep<any>): void;
  handleToolCall(toolCall: ToolCallParams): void;
  handleToolCallResult(result: ToolExecutionResult): void;
  
  // 会话管理
  sendMessageToAgent(message: string, sessionManager: ISessionManager): void;
  newSession(sessionManager: ISessionManager): void;
}
```

## 显示格式

### Agent 思考显示

```
✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻
✻ Thinking…
✻ 需要先安装依赖。包配置更新后需要重新安装。
✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻
```

### Agent 回复显示

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
↩️  agent:
回复内容
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 工具调用显示

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Bash(mv examples/ink-esm-test.js examples/ink-esm-test.tsx)
  ⎿ (No content)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 工具结果格式化

CLI Client 为不同类型的工具提供了专门的格式化显示：

- **🔍 GrepTool** - 搜索结果展示，包含匹配文件、行号、上下文
- **📖 ReadTool** - 文件内容显示，带行号和语法高亮  
- **🖥️ BashTool** - 命令执行结果，分离标准输出和错误输出
- **📋 TodosManager** - 任务列表管理，Markdown 格式展示
- **📝 SnapshotEditing** - 文件编辑操作，显示差异和变更
- **🔧 DefaultTool** - 通用工具格式化

所有工具输出都限制在配置的最大行数内（默认 100 行）。

**详细的格式化说明请参考: [format.md](./format.md)**

## Agent 控制

### 中断执行

当 Agent 正在执行时，可以通过以下方式中断：

- **ESC 键** - 按 ESC 键立即中断 Agent 执行
- **Ctrl+C** - 退出整个 CLI 客户端

中断时会：
1. 调用 Agent 的 `stop()` 方法（如果存在）
2. 重置处理状态
3. 返回到输入提示符

```
🛑 Interrupting agent execution...
✅ Agent stopped successfully
```

## 内置命令

| 命令 | 别名 | 描述 |
|------|------|------|
| `/help` | `?` | 显示帮助信息 |
| `/multiline` | `###` | 切换多行输入模式 |
| `/new` | - | 创建新会话 |
| `/session` | - | 显示当前会话信息 |
| `/send <message>` | - | 发送消息给 Agent |
| `/exit` | `/quit` | 退出客户端 |

## 配置选项

```typescript
interface CLIClientConfig {
  // 基础配置
  name: string;
  userId?: string;
  sessionId?: string;
  
  // 输入配置
  enableMultilineInput?: boolean;
  multilineDelimiter?: string;
  enableHistory?: boolean;
  historyFile?: string;
  maxHistorySize?: number;
  
  // 显示配置
  enableColors?: boolean;
  enableTimestamps?: boolean;
  promptPrefix?: string;
  maxOutputLines?: number;  // 工具输出最大行数限制，默认 100
  
  // Session 管理器（用于实现 IClient 接口）
  sessionManager?: ISessionManager;
  
  // 扩展配置
  customCommands?: Record<string, CommandHandler>;
}
```

## 高级用法

### 自定义命令

```typescript
const customCommands = {
  status: {
    name: 'status',
    description: 'Show system status',
    handler: async (args, client) => {
      console.log('System is running...');
    }
  }
};

const client = createCLIClient({
  customCommands,
  // ... other config
});
```

### 完整集成示例

```typescript
import { CodingAgent } from '@continue-reasoning/agents';
import { SessionManager } from '@continue-reasoning/core';
import { createCLIClientWithSession } from '@continue-reasoning/cli-client';

// 创建 Agent
const agent = new CodingAgent(/* ... */);

// 创建 CLI Client
const client = createCLIClientWithSession(null, {
  name: 'Coding Assistant',
  enableColors: true,
  enableTimestamps: true
});

// 创建 SessionManager 并连接 Agent 和 Client
const sessionManager = new SessionManager(agent, client);
sessionManager.setAgentCallBacks();

// 启动 CLI
await client.start();
```

## API 参考

### 工厂函数

- `createDefaultConfig(overrides?)` - 创建默认配置
- `startCLIClient(config?)` - 启动 CLI 客户端
- `createCLIClient(config?)` - 创建客户端实例（不启动）
- `createCLIClientWithSession(sessionManager, config?)` - 创建带会话管理的客户端

### 显示格式化

- `formatThinking(thinking)` - 格式化思考内容
- `formatFinalAnswer(content)` - 格式化最终回复
- `formatToolCallStart(name, params)` - 格式化工具调用开始
- `formatToolCallResult(result, success)` - 格式化工具调用结果
- `formatError(error)` - 格式化错误信息
- `formatSystemInfo(message)` - 格式化系统信息

## 架构说明

新的 CLI Client 采用简化的架构：

1. **直接集成** - 通过 SessionManager 直接与 Agent 交互
2. **回调驱动** - Agent 通过回调函数通知 Client 显示内容
3. **无事件总线** - 移除了复杂的事件系统，简化了依赖关系
4. **即插即用** - 只需要提供 SessionManager 即可完整工作

## 许可证

MIT 