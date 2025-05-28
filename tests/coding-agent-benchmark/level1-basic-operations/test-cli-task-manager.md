# CLI 任务管理器测试用例

## 测试目标
测试 Agent 创建一个完整的 CLI 应用程序的能力，包括文件结构、命令行参数处理、JSON 数据持久化等。

## 任务说明

请使用 JavaScript (Node.js) 创建一个简单的 CLI 应用程序 `task-cli`，用于管理待办任务。

### 项目结构
```
task-cli/
├── index.js
├── taskManager.js
├── data/
│   └── tasks.json
├── utils/
│   └── fileUtils.js
└── README.md
```

### 功能需求

1. **index.js**: 提供命令行入口，可执行以下命令：
   - `node index.js add "任务内容"`
   - `node index.js list`
   - `node index.js done <任务ID>`

2. **taskManager.js**：
   - 实现添加任务、列出任务、标记完成任务的逻辑
   - 所有任务应保存在 `data/tasks.json` 文件中
   - 任务对象应包含：id、content、completed、createdAt

3. **fileUtils.js**：
   - 封装读写 JSON 文件的通用函数（readJSON, writeJSON）
   - 处理文件不存在的情况
   - 提供错误处理

4. **README.md**：
   - 简要说明如何运行该 CLI 工具
   - 各个命令的用法说明
   - 安装和使用示例

### 示例行为

```bash
$ node index.js add "Buy milk"
✅ Added task: Buy milk

$ node index.js add "Write report"
✅ Added task: Write report

$ node index.js list
📝 Tasks:
[1] Buy milk - ❌
[2] Write report - ❌

$ node index.js done 1
🎉 Task [1] marked as done.

$ node index.js list
📝 Tasks:
[1] Buy milk - ✅
[2] Write report - ❌
```

### 技术要求

1. **错误处理**：
   - 处理无效的命令
   - 处理不存在的任务ID
   - 处理文件读写错误

2. **数据格式**：
   - 使用 JSON 格式存储任务
   - 任务ID 应该是自增的数字
   - 包含创建时间戳

3. **代码质量**：
   - 使用模块化设计
   - 添加适当的注释
   - 遵循 Node.js 最佳实践

### 评分标准

- **项目结构 (20分)**：正确创建所有目录和文件
- **核心功能 (40分)**：add、list、done 命令正常工作
- **数据持久化 (20分)**：JSON 文件正确读写
- **错误处理 (10分)**：适当的错误处理和用户反馈
- **代码质量 (10分)**：代码结构清晰，注释完整

请实现这个 CLI 任务管理器，确保所有功能都能正常工作。 