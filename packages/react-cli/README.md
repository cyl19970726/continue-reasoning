# @continue-reasoning/react-cli

基于 React + Ink 的终端 CLI 客户端，为 Continue Reasoning 项目提供交互式命令行界面。

## 🛠️ 工具链

### 构建工具
- **TypeScript**: 5.x - 类型安全和现代 JavaScript 特性
- **Node.js**: >=20 - ESM 模块支持
- **pnpm**: 包管理和 workspace 支持

### 前端框架
- **React**: 19.x - 组件化 UI 开发
- **Ink**: 6.x - 终端 React 渲染器
- **Commander.js**: CLI 参数解析

### 模块系统
- **ESM**: "type": "module" 配置
- **NodeNext**: 模块解析策略
- **TypeScript Project References**: 支持 monorepo

## 📁 目录结构

```
packages/react-cli/
├── src/
│   ├── components/          # React 组件
│   │   ├── App.tsx         # 主应用组件
│   │   ├── MessageList.tsx # 消息列表
│   │   ├── InputArea.tsx   # 输入区域
│   │   ├── StatusBar.tsx   # 状态栏
│   │   └── HelpPanel.tsx   # 帮助面板
│   ├── formatters/         # 工具结果格式化器
│   │   ├── ToolFormatterRegistry.ts  # 格式化器注册表
│   │   ├── BashFormatter.ts          # Bash 工具格式化器
│   │   ├── FileFormatter.ts          # 文件工具格式化器
│   │   ├── CodeFormatter.ts          # 代码工具格式化器
│   │   ├── DefaultFormatter.ts       # 默认格式化器
│   │   ├── types.ts                  # 类型定义
│   │   └── index.ts                  # 导出入口
│   ├── importers/          # 文件导入器
│   │   ├── FileImporter.ts # 文件导入器实现
│   │   └── index.ts        # 导出入口
│   ├── interfaces/         # 类型定义
│   │   ├── client.ts       # 客户端接口
│   │   ├── ui.ts          # UI 状态接口
│   │   └── index.ts        # 导出入口
│   ├── ReactCLIClient.tsx  # 主客户端实现
│   └── index.ts           # CLI 入口点
├── dist/                  # 编译输出
├── package.json          # 包配置
├── tsconfig.json         # TypeScript 配置
└── README.md            # 本文档
```

## 🚀 快速开始

### 安装依赖
```bash
# 在项目根目录
pnpm install
```

### 编译
```bash
# 编译 react-cli 包
cd packages/react-cli
pnpm run build

# 或者在根目录编译所有包
pnpm run build:packages
```

### 运行
```bash
# 直接运行
node dist/index.js

# 带参数运行
node dist/index.js --theme light --compact

# 查看帮助
node dist/index.js --help
```

### 命令行选项
```
Options:
  -V, --version        输出版本号
  -t, --theme <theme>  颜色主题 (light/dark/auto) (default: "dark")
  -c, --compact        启用紧凑模式 (default: false)
  --no-timestamps      隐藏时间戳
  --no-streaming       禁用流式模式
  -s, --session <id>   恢复会话 ID
  -u, --user <id>      用户 ID
  -a, --agent <id>     Agent ID (default: "coding-agent")
  --max-messages <n>   最大消息数量 (default: "100")
  --max-steps <n>      最大 Agent 步骤数 (default: "50")
  -d, --debug          启用调试模式
  -h, --help           显示帮助信息
```

### 键盘快捷键
- `Ctrl+C`: 退出程序
- `Ctrl+H`: 显示/隐藏帮助
- `Ctrl+L`: 清屏
- `Ctrl+K`: 切换紧凑模式
- `Ctrl+T`: 切换主题
- `↑/↓`: 滚动消息
- `Page Up/Down`: 快速滚动

## 🏗️ 架构设计

### 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│                    React CLI Client                        │
├─────────────────────────────────────────────────────────────┤
│  ReactCLIClient (implements IClient)                       │
│  ├── 实现 @continue-reasoning/core 的 IClient 接口         │
│  ├── 使用 AgentCallbacks 处理事件                          │
│  ├── 管理 UI 状态和消息历史                                │
│  └── 集成工具格式化器和文件导入器                          │
├─────────────────────────────────────────────────────────────┤
│  React + Ink UI Components                                 │
│  ├── App: 主应用组件，处理键盘输入和布局                   │
│  ├── MessageList: 显示消息历史，支持滚动和搜索             │
│  ├── InputArea: 用户输入区域，支持多行和自动完成           │
│  ├── StatusBar: 显示连接状态、会话信息等                   │
│  └── HelpPanel: 显示帮助信息和快捷键                       │
├─────────────────────────────────────────────────────────────┤
│  Tool Formatters & File Importers                          │
│  ├── ToolFormatterRegistry: 工具结果格式化注册表           │
│  ├── BashFormatter: Bash 命令输出格式化                    │
│  ├── FileFormatter: 文件操作结果格式化                     │
│  ├── CodeFormatter: 代码相关工具格式化                     │
│  └── FileImporterRegistry: 文件导入器注册表                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              @continue-reasoning/core                       │
├─────────────────────────────────────────────────────────────┤
│  ├── IClient: 客户端接口规范                               │
│  ├── SessionManager: 会话管理                              │
│  ├── AgentCallbacks: 事件回调架构                          │
│  └── Agent: 智能代理实现                                   │
└─────────────────────────────────────────────────────────────┘
```

### 接口设计

#### IClient 接口实现
ReactCLIClient 实现了 `@continue-reasoning/core` 的 `IClient` 接口：

```typescript
interface IClient {
  readonly name: string;
  readonly type: ClientType;
  currentSessionId?: string;
  sessionManager?: ISessionManager;
  agentCallbacks?: AgentCallbacks;
  
  // 初始化和生命周期
  initialize(config?: any): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // 会话管理
  setSessionManager(sessionManager: ISessionManager): void;
  setAgentCallbacks(callbacks: AgentCallbacks): void;
  createSession(userId?: string, agentId?: string): string | undefined;
  
  // 事件处理
  handleAgentStep(step: AgentStep<any>): void;
  handleToolCall(toolCall: ToolCallParams): void;
  handleToolCallResult(result: ToolExecutionResult): void;
  
  // 状态查询
  getStatus(): ClientStatus;
}
```

#### AgentCallbacks 事件系统
使用新的 AgentCallbacks 架构替代旧的 ClientEventHandlers：

```typescript
interface AgentCallbacks {
  onAgentStep?: (step: AgentStep<any>) => void;
  onToolCallStart?: (toolCall: ToolCallParams) => void;
  onToolExecutionEnd?: (result: ToolExecutionResult) => void;
  onLLMTextDelta?: (stepIndex: number, chunkIndex: number, delta: string) => void;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: (sessionId: string) => void;
}
```

### 工具格式化系统

#### 格式化器架构
```typescript
interface IToolFormatter {
  name: string;
  supportedTools: string[];
  format(result: ExtendedToolExecutionResult): string;
  formatError(error: Error): string;
}
```

#### 内置格式化器
- **BashFormatter**: 格式化 Bash 命令输出，支持颜色高亮和错误处理
- **FileFormatter**: 格式化文件操作结果，支持语法高亮和差异显示
- **CodeFormatter**: 格式化代码分析结果，支持语法检查和建议
- **DefaultFormatter**: 默认格式化器，提供基础的 JSON 格式化

### 文件导入系统

#### 导入器架构
```typescript
interface IFileImporter {
  name: string;
  supportedExtensions: string[];
  supportedMimeTypes: string[];
  canImport(filePath: string, mimeType?: string): boolean;
  import(filePath: string, options?: ImportOptions): Promise<ImportedFile>;
}
```

#### 内置导入器
- **TextFileImporter**: 处理文本文件 (.txt, .md, .js, .ts 等)
- **ImageFileImporter**: 处理图像文件，支持 base64 编码
- **JsonFileImporter**: 处理 JSON 文件，提供格式化和验证
- **BinaryFileImporter**: 处理二进制文件，提供十六进制预览

### 状态管理

#### UI 状态
```typescript
interface UIState {
  isProcessing: boolean;
  currentInput: string;
  showHelp: boolean;
  compactMode: boolean;
  theme: 'light' | 'dark';
  selectedMessageId?: string;
}
```

#### 配置系统
```typescript
interface ReactCLIConfig {
  name?: string;
  theme?: 'light' | 'dark';
  compactMode?: boolean;
  showTimestamps?: boolean;
  enableStreaming?: boolean;
  sessionId?: string;
  userId?: string;
  agentId?: string;
  maxMessages?: number;
  maxSteps?: number;
  debug?: boolean;
  enableToolFormatting?: boolean;
  enableFileImport?: boolean;
}
```

## 🔧 开发

### 开发环境设置
```bash
# 安装依赖
pnpm install

# 开发模式 (监听文件变化)
pnpm run dev

# 运行测试
pnpm run test

# 代码检查
pnpm run lint

# 类型检查
pnpm run typecheck
```

### 添加新的工具格式化器
1. 在 `src/formatters/` 创建新的格式化器类
2. 实现 `IToolFormatter` 接口
3. 在 `ToolFormatterRegistry` 中注册
4. 添加相应的测试

### 添加新的文件导入器
1. 在 `src/importers/` 创建新的导入器类
2. 实现 `IFileImporter` 接口
3. 在 `FileImporterRegistry` 中注册
4. 添加相应的测试

### 添加新的 UI 组件
1. 在 `src/components/` 创建新组件
2. 使用 Ink 的组件 API
3. 遵循现有的主题和样式约定
4. 在 `App.tsx` 中集成

## 📦 依赖关系

### 生产依赖
- `@continue-reasoning/core`: 核心接口和类型
- `react`: React 框架
- `ink`: 终端 React 渲染器
- `commander`: CLI 参数解析
- `chalk`: 终端颜色支持
- `mime-types`: 文件类型检测

### 开发依赖
- `typescript`: TypeScript 编译器
- `@types/*`: TypeScript 类型定义

## 🚀 部署

### 构建生产版本
```bash
# 清理并构建
pnpm run clean
pnpm run build

# 验证构建
node dist/index.js --version
```

### 作为全局 CLI 安装
```bash
# 链接到全局
npm link

# 使用全局命令
cr-react --help
```

## 🤝 贡献

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](../../LICENSE) 文件了解详情。