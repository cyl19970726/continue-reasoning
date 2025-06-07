# InteractiveMemory 简化架构 - 完整示例

## 概述

基于最新的 v2.1 架构，我们大大简化了 InteractiveMemory 系统：

### 🔧 架构改进
- **统一目录**：`InteractiveMemory` 现在位于 `src/core/events/` 目录，与 `InteractiveLayer` 在同一位置
- **简化实现**：移除 RAG、MapMemoryManager 等复杂依赖，专注于核心功能
- **直接历史传递**：客户端通过事件直接传递对话历史给 Agent
- **思考系统集成**：Agent 直接将历史传递给思考系统进行处理
- **轻量化存储**：使用简单的内存存储 + 可选的持久化存储

### 📁 新的文件结构
```
src/core/events/
├── eventBus.ts                 # 事件总线
├── interactiveLayer.ts         # 交互层基类
├── interactiveMemory.ts        # 📍 简化的对话记忆实现（新位置）
├── crossEvents.ts              # 跨系统事件定义
├── agentEvents.ts              # Agent 事件定义
├── interactiveEvents.ts        # 交互事件定义
└── types.ts                    # 类型定义

src/core/interactive/
└── cliClient.ts                # 📍 增强的CLI客户端（支持对话历史）
```

### ✨ 简化特性
- **内存存储**：高效的 Map 结构存储对话记录
- **持久化选项**：可选的 JSON 文件保存/加载
- **事件集成**：自动监听和记录用户消息、Agent 回复
- **统计分析**：会话统计、用户活跃度分析
- **无复杂依赖**：不需要 RAG、向量数据库等重型组件
- **🆕 CLI增强**：支持对话历史的命令行客户端

## 🚀 新功能：增强的 CLI 客户端

### 对话历史功能

```typescript
// 🆕 导入增强的CLI客户端
import { CLIClient } from '../core/interactive/cliClient';
import { EventBus } from '../core/events/eventBus';

// 创建默认的增强CLI客户端
const eventBus = new EventBus();
await eventBus.start();

const cliClient = CLIClient.createDefault(eventBus);
await cliClient.start();

// CLI会自动包含以下增强功能：
// ✓ 对话历史自动记录
// ✓ 用户消息自动包含对话上下文
// ✓ 对话搜索和查看
// ✓ 内存统计和管理
```

### 新增的CLI命令

```bash
# 🧠 对话历史命令
/conversation [n]       # 显示最近n条对话记录
/conv [n]              # /conversation的简写
/session               # 显示当前会话信息
/user [id]             # 设置或查看当前用户ID
/memory                # 显示内存使用统计
/search <query>        # 搜索对话历史

# 示例用法
/conversation 5        # 显示最近5条对话
/search "React"        # 搜索包含"React"的对话
/user john-doe         # 设置用户ID为john-doe
/memory               # 查看内存统计
```

### 自动对话历史集成

```typescript
// 用户发送消息时，CLI自动处理：
// 1. 获取当前会话的对话历史
// 2. 将历史作为上下文包含在消息中
// 3. 发送给Agent进行处理
// 4. Agent收到完整的对话上下文

// 这意味着用户只需要正常聊天，
// Agent就能"记住"整个对话过程！
```

## 🎯 完整使用示例

### 1. 启动增强CLI

```typescript
import { CLIClient } from '../core/interactive/cliClient';
import { EventBus } from '../core/events/eventBus';

async function startEnhancedCLI() {
  const eventBus = new EventBus();
  await eventBus.start();

  const cli = CLIClient.createDefault(eventBus);
  
  // 🆕 设置用户信息
  cli.setUserId('developer-001');
  
  await cli.start();
  
  console.log('🤖 Enhanced CLI with conversation history started!');
  console.log('Type /help to see all available commands');
}

startEnhancedCLI();
```

### 2. 对话流程示例

```
🤖 HHH-AGI Enhanced Interactive CLI
✨ Enhanced Input Experience with Conversation History
Type /help for available commands
Use Ctrl+C to exit

🧠 Conversation History: ENABLED
   User ID: developer-001
   Session: a1b2c3d4...

🚀 Enhanced Features Active:
  ✓ Input preview and analysis
  ✓ Smart prompts and suggestions
  ✓ Keyboard shortcuts (Ctrl+H for help)
  ✓ Enhanced multi-line input
  ✓ Automatic conversation history integration

💡 Quick Start Guide:
  🔸 Simple messages: Just type and press Enter
  🔸 Multi-line messages: Type ### → Enter → your message → ### → Enter
  🔸 Commands: Start with / (try /help)
  🔸 File input: Use /file <path>
  🔸 Conversation history: Automatically included in all messages
  🔸 Quick shortcuts: Ctrl+H (help), Ctrl+L (clear), Ctrl+M (multi-line)

🤖 ⚡ > Hello, I need help creating a React component

[Agent receives message with full conversation context]

🤖 ⚡ > /conversation 3
💬 Conversation History (Last 3 messages):
============================================================
1. [14:30:45] ⚙️ system:
   Session started for user: developer-001
   
2. [14:31:02] 👤 user:
   Hello, I need help creating a React component
   
3. [14:31:05] 🤖 agent:
   I'd be happy to help you create a React component! What type of component are you looking to build?
   
============================================================

🤖 ⚡ > /search "React"
🔍 Search Results for "React":
==================================================
1. [14:31:02] 👤 user:
   Hello, I need help creating a React component
   
2. [14:31:05] 🤖 agent:
   I'd be happy to help you create a React component! What type of component are you looking to build?
   
==================================================

🤖 ⚡ > /session
📊 Session Information:
Session ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
User ID: developer-001
Execution Mode: auto
Conversation History: ENABLED
Memory Instance: cli-memory
Memory Name: CLI Interactive Memory

🤖 ⚡ > /memory
📈 Memory Statistics:
Total Conversations: 3
Total Sessions: 1
Average Messages/Session: 3.0
Memory Usage: 2.1 KB
```

### 3. 多行输入与历史集成

```
🤖 ⚡ > ###
📝 Multi-line input mode activated!
┌─ Tips:
├─ • Press Enter to create new lines
├─ • Type '###' on a new line to finish and send
├─ • Press Ctrl+M to exit without sending
└─ • Press Ctrl+C to cancel and exit

├─ 01 │ I want to create a complex React component
├─ 02 │ with the following features:
├─ 03 │ - User authentication
├─ 04 │ - Data fetching
├─ 05 │ - Error handling
├─ 06 │ - Loading states
├─ 07 │ ###

✅ Multi-line input completed!
📊 Content: 156 characters, 6 lines

[Message automatically sent with conversation history]
```

### 4. 功能切换

```
🤖 ⚡ > /toggle history
✅ Feature toggled: Conversation History is now DISABLED
⚠️  Conversation history disabled
   • Messages will be sent without conversation context
   • History commands will not be available

🤖 ⚡ > /toggle conversation
✅ Feature toggled: Conversation History is now ENABLED
🧠 Conversation history activated!
   • All future messages will include conversation context
   • Use /conversation to view history
   • Use /search to find past conversations
```

## 🎯 技术优势

### 1. **零配置启动**
```typescript
// 一行代码启动完整功能
const cli = CLIClient.createDefault(eventBus);
await cli.start(); // 对话历史自动启用
```

### 2. **自动上下文传递**
- 用户无需任何额外操作
- 每条消息自动包含对话历史
- Agent收到完整上下文进行智能回复

### 3. **强大的搜索功能**
- 支持内容搜索
- 按角色过滤
- 按消息类型过滤
- 实时结果展示

### 4. **内存管理**
- 自动清理过期会话
- 内存使用统计
- 可配置存储限制
- 可选持久化保存

### 5. **用户体验**
- 彩色终端输出
- 智能命令补全
- 多行输入支持
- 快捷键操作
- 实时状态反馈

## 🔧 配置选项

```typescript
const cli = new CLIClient({
  name: 'My Enhanced CLI',
  capabilities: { /* ... */ },
  eventBus,
  
  // 🆕 对话历史配置
  enableConversationHistory: true,  // 启用对话历史
  defaultUserId: 'my-user',         // 默认用户ID
  
  // 现有增强功能
  enableRichInput: true,
  enableInputPreview: true,
  enableSmartPrompts: true,
  enableKeyboardShortcuts: true,
  enableMultilineInput: true,
  showInputStats: true,
  
  // 自定义设置
  promptPrefix: '🚀',
  maxHistorySize: 2000,
  multilineDelimiter: ':::',
  maxPreviewLength: 200
});
```

## 📊 性能特点

- **轻量级**：无外部依赖，纯内存操作
- **高效**：Map结构存储，O(1)查找
- **可扩展**：支持自定义存储后端
- **稳定**：完整的错误处理和恢复机制
- **智能**：自动内存清理和优化

这个增强的CLI客户端提供了完整的对话历史功能，让用户能够：
1. 无缝地与支持记忆的Agent对话
2. 查看和搜索历史对话
3. 管理对话会话和用户身份
4. 享受现代化的命令行交互体验

所有这些功能都基于我们简化的InteractiveMemory架构，无需复杂配置即可使用！ 