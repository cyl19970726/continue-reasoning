# Tool Result Formatters

CLI Client 提供了丰富的工具结果格式化系统，为不同类型的工具提供专门的显示格式。所有格式化输出都限制在 100 行以内（可配置）。

## 架构设计

### 基础架构

- `BaseToolResultFormatter` - 所有格式化器的基类，提供通用功能
- `ToolFormatterRegistry` - 格式化器注册中心，管理不同工具的格式化器
- 各个专门的格式化器继承基类并实现特定的格式化逻辑

### 支持的工具类型

| 工具类型 | 格式化器 | 描述 |
|---------|---------|------|
| `Grep`, `GrepTool` | `GrepToolFormatter` | 代码搜索结果 |
| `ReadFile`, `ReadFileTool` | `ReadToolFormatter` | 文件读取内容 |
| `BashCommand`, `Bash`, `BashTool` | `BashToolFormatter` | 命令执行结果 |
| `TodosManager`, `TodosManagerTool` | `TodosManagerFormatter` | 任务列表管理 |
| `ApplyWholeFileEditTool` 等 | `SnapshotEditingFormatter` | 文件编辑操作 |
| 其他工具 | `DefaultToolFormatter` | 通用格式化 |

## 格式化器详细介绍

### 1. GrepTool 格式化器

**用途**: 格式化代码搜索结果，显示匹配的文件和行

**显示内容**:
- 搜索参数（模式、路径、文件类型）
- 搜索统计（文件数量、匹配数量）
- 匹配结果（文件路径、行号、内容、上下文）
- 建议的读取范围

**示例输出**:
```
🔍 Grep: Searching for pattern
├─ Pattern: "interface User"
├─ Path: ./src
└─ Include: *.ts, *.js
✅ Grep completed
├─ Files searched: 42
└─ Matches found: 15

📄 src/interfaces/user.ts
    10: // User model definition
    11: 
    12: export interface User {
    13:   id: string;
    14:   name: string;

📖 Suggested read ranges:
   ReadFile("src/interfaces/user.ts", 10, 20)
```

### 2. ReadTool 格式化器

**用途**: 格式化文件读取结果，显示文件内容

**显示内容**:
- 文件路径和大小
- 读取范围（如果指定）
- 带行号的文件内容
- 语法高亮（针对代码文件）

**示例输出**:
```
📖 ReadFile
├─ File: /Users/project/src/index.ts
└─ Range: lines 1-50
✅ File read successfully
├─ File: /Users/project/src/index.ts
├─ Size: 2.0 KB
└─ Lines: 24

📄 Content:
   1: import express from 'express';
   2: import { UserController } from './controllers/user';
   3: import { config } from './config';
   ...
```

### 3. BashTool 格式化器

**用途**: 格式化命令执行结果

**显示内容**:
- 执行的命令和参数
- 执行时间和退出码
- 标准输出和错误输出
- 彩色区分成功/失败状态（基于 `result.status`）

**示例输出**:
```
🖥️ BashCommand
├─ Command: npm test
├─ Purpose: Run project tests
└─ Timeout: 30000ms
✅ Command executed successfully
├─ Duration: 15.2s
└─ Exit code: 0

📤 Standard Output:
  > my-project@1.0.0 test
  > jest
  
   PASS  src/utils/formatter.test.ts
    ✓ should format strings correctly (5 ms)
  ...
```

### 4. TodosManager 格式化器

**用途**: 格式化任务列表管理结果

**显示内容**:
- 操作类型和任务统计
- Markdown 格式的任务列表
- 进度条和完成状态
- 彩色图标区分完成/未完成

**示例输出**:
```
📋 TodosManager
├─ Action: update
└─ Tasks: 5 total (2 completed)
✅ Updated todos list with 5 tasks

📋 Current Todos:
  ✓ Analyze current implementation
  ✓ Design formatter architecture
  ○ Implement formatters
  ○ Test integration
  ○ Write documentation

📊 Statistics:
   Total tasks: 5
   ✓ Completed: 2
   ○ Pending: 3
   Progress: ████████░░░░░░░░░░░░ 40%
```

### 5. SnapshotEditing 格式化器

**用途**: 格式化文件编辑操作结果

**支持的工具**:
- `ApplyWholeFileEditTool` - 创建/替换整个文件
- `ApplyEditBlockTool` - 编辑代码块
- `ApplyRangedEditTool` - 范围编辑
- `ApplyUnifiedDiffTool` - 应用统一差异
- `DeleteTool` - 删除文件

**显示内容**:
- 操作类型和目标文件
- 快照 ID 和差异文件路径
- 差异预览（diff 格式）
- 修改行数统计

**示例输出**:
```
📝 Create/Replace File
├─ File: src/components/NewFeature.tsx
└─ Goal: Create new React component
✅ ApplyWholeFileEdit completed
├─ File: src/components/NewFeature.tsx
├─ Snapshot: snapshot_23
├─ Diff: .snapshots/snapshot_23.diff
└─ Total lines: 5

📊 Diff preview:
--- /dev/null
+++ b/src/components/NewFeature.tsx
@@ -0,0 +1,5 @@
+import React from "react";
+
+export const NewFeature = () => {
+  return <div>New Feature</div>;
+};
```

### 6. Default 格式化器

**用途**: 为没有专门格式化器的工具提供通用格式化

**功能**:
- 显示工具参数（前3个参数）
- 格式化结果数据（JSON、字符串等）
- 错误处理和状态显示

## 错误处理

所有格式化器都支持统一的错误显示格式：

```
❌ ToolName failed
   Error: Detailed error message
```

错误信息会自动从以下字段中提取：
- `result.message`
- `result.error`
- `result.result.error`
- `result.result.stderr`

## 配置选项

### 行数限制

可以通过配置控制输出的最大行数：

```typescript
// 在 CLIClientConfig 中设置
const config: CLIClientConfig = {
  maxOutputLines: 50, // 默认 100 行
  // ...
};

// 或直接创建格式化器注册中心
const registry = new ToolFormatterRegistry(50);
```

### 自定义格式化器

可以创建自定义格式化器：

```typescript
class MyCustomFormatter extends BaseToolResultFormatter {
  formatToolCall(toolCall: ToolCallParams): string {
    // 自定义工具调用格式化
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    // 自定义结果格式化
  }
}

// 注册自定义格式化器
registry.registerFormatter('MyTool', new MyCustomFormatter());
```

## 使用方式

格式化器集成在 CLI Client 中，会自动根据工具类型选择合适的格式化器：

```typescript
// CLI Client 会自动使用格式化器
handleToolCall(toolCall: ToolCallParams): void {
  console.log(this.formatterRegistry.formatToolCall(toolCall));
}

handleToolCallResult(result: ToolExecutionResult): void {
  console.log(this.formatterRegistry.formatToolResult(result));
}
```

## 测试

可以运行测试文件查看所有格式化器的效果：

```bash
npx tsx src/tests/test-formatters.ts
```

测试文件包含了所有工具类型的示例数据和预期输出。