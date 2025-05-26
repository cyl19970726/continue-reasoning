# HHH-AGI Examples

这个目录包含了 HHH-AGI 系统的使用示例。

## 🚀 快速启动

### 启动 Web UI + Agent 系统

```bash
cd examples
npx tsx web-ui-with-agent.ts
```

然后打开浏览器访问: http://localhost:3000

**功能特性:**
- ✅ 完整的 Web UI 界面
- ✅ Agent 后端集成
- ✅ 实时状态更新
- ✅ 执行模式切换 (Auto/Manual)
- ✅ 审批工作流
- ✅ MCP 服务器集成 (Hacker News, DeepWiki, Firecrawl)

### 启动 CLI 客户端

```bash
cd examples
npx tsx cli-with-agent.ts
```

**CLI 命令:**
- `/help` - 显示帮助
- `/mode [auto|manual]` - 切换执行模式
- `/history` - 显示命令历史
- `/events` - 显示活跃事件
- `/stats` - 显示统计信息
- `/exit` - 退出

## 📚 示例文件说明

### 核心示例

1. **`web-ui-with-agent.ts`** ⭐
   - **主要的 Web UI + Agent 启动文件**
   - 包含完整的事件驱动架构
   - 支持实时通信和状态同步
   - 集成多个 MCP 服务器

2. **`cli-with-agent.ts`**
   - CLI 客户端示例
   - 展示命令行交互方式
   - 支持执行模式切换

### 教学示例

3. **`approval-workflow-example.ts`**
   - 审批工作流演示
   - 展示 Agent 如何请求用户批准
   - 演示事件驱动的交互模式

## 🎯 使用场景

### Web UI 模式
适合需要图形界面的场景:
- 代码生成和编辑
- 文件系统操作
- 实时状态监控
- 审批工作流管理

### CLI 模式  
适合命令行环境:
- 服务器部署
- 自动化脚本
- 开发调试
- 批处理任务

## 🔧 配置说明

### 环境变量
确保设置以下环境变量:
```bash
OPENAI_API_KEY=your_openai_api_key
FIRECRAWL_API_KEY=your_firecrawl_api_key  # 可选
```

### MCP 服务器
系统会自动连接以下 MCP 服务器:
- **mcp-hn**: Hacker News 集成
- **mcp-deepwiki**: DeepWiki 文档搜索
- **mcp-server-firecrawl**: 网页爬取和搜索

## 🎨 执行模式

### Auto 模式
- Agent 自动执行操作，无需用户批准
- 适合安全的操作和开发环境
- 工具集中不包含 `approval_request` 工具

### Manual 模式  
- Agent 会请求用户批准风险操作
- 适合生产环境和敏感操作
- 包含完整的审批工作流

## 🔄 模式切换

### Web UI 中切换
点击右上角的模式按钮 (Auto/Manual)

### CLI 中切换
使用命令: `/mode auto` 或 `/mode manual`

## 🛠️ 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 检查端口占用
   lsof -i :3000
   # 杀死占用进程
   kill -9 <PID>
   ```

2. **MCP 服务器连接失败**
   - 检查网络连接
   - 确认 API 密钥正确
   - 查看日志输出

3. **Agent 无响应**
   - 检查 OpenAI API 密钥
   - 查看控制台错误信息
   - 重启服务

### 日志级别
可以通过修改代码中的 `LogLevel.INFO` 来调整日志详细程度:
- `LogLevel.DEBUG` - 详细调试信息
- `LogLevel.INFO` - 一般信息
- `LogLevel.WARN` - 警告信息
- `LogLevel.ERROR` - 仅错误信息

## 📖 更多信息

- 查看 `../src/core/` 了解核心架构
- 查看 `../src/web/` 了解 Web UI 实现
- 查看 `../src/core/events/` 了解事件系统 