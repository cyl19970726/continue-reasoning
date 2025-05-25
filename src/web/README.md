# HHH-AGI Web UI

HHH-AGI 的 Web 用户界面模块，提供现代化的浏览器界面与 Agent 进行实时交互。

## 🌟 功能特性

### 核心功能
- ✅ **实时通信**: 基于 WebSocket 的双向通信
- ✅ **执行模式切换**: Auto/Manual 模式动态切换
- ✅ **审批工作流**: 可视化的操作审批界面
- ✅ **状态监控**: 实时显示 Agent 执行状态
- ✅ **文件上传**: 支持代码文件上传和预览
- ✅ **代码高亮**: 语法高亮显示
- ✅ **会话管理**: 多会话支持

### 技术特性
- 🚀 **事件驱动架构**: 完全基于 EventBus 的解耦设计
- 🔒 **连接安全**: 智能识别和拒绝非浏览器连接
- 📱 **响应式设计**: 适配不同屏幕尺寸
- ⚡ **高性能**: 独立 WebSocket 端口，避免冲突
- 🛡️ **错误处理**: 完善的错误处理和重连机制

## 🏗️ 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    HHH-AGI Web UI                           │
├─────────────────────────────────────────────────────────────┤
│  Frontend (React)           │  Backend (Node.js)            │
│  ┌─────────────────────┐    │  ┌─────────────────────────┐   │
│  │  ChatInterface      │    │  │  WebUIClient            │   │
│  │  - 消息显示         │    │  │  - HTTP Server (3000)   │   │
│  │  - 模式切换         │◄──►│  │  - WebSocket (3001)     │   │
│  │  - 审批界面         │    │  │  - 事件处理             │   │
│  │  - 状态监控         │    │  │  - 连接验证             │   │
│  └─────────────────────┘    │  └─────────────────────────┘   │
│           │                 │           │                    │
│  ┌─────────────────────┐    │  ┌─────────────────────────┐   │
│  │  useWebSocket       │    │  │  BaseInteractiveLayer   │   │
│  │  - 连接管理         │    │  │  - 事件订阅             │   │
│  │  - 重连机制         │    │  │  - 消息路由             │   │
│  │  - 错误处理         │    │  │  - 会话管理             │   │
│  └─────────────────────┘    │  └─────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │     EventBus      │
                    │   - 事件分发      │
                    │   - 会话管理      │
                    │   - 状态同步      │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   BaseAgent       │
                    │   - 任务执行      │
                    │   - 工具调用      │
                    │   - 状态报告      │
                    └───────────────────┘
```

### 端口配置

| 服务 | 端口 | 用途 |
|------|------|------|
| HTTP Server | 3000 | 静态文件服务、API 接口 |
| WebSocket Server | 3001 | 实时通信（独立端口避免冲突） |

### 连接验证机制

为了防止 MCP 服务器等非浏览器客户端错误连接到 WebSocket，实现了智能连接验证：

```typescript
// 验证逻辑
const isBrowserConnection = (
  userAgent.includes('Mozilla') || 
  userAgent.includes('Chrome') || 
  userAgent.includes('Safari') || 
  userAgent.includes('Firefox') ||
  userAgent.includes('Edge')
);

const isLocalConnection = (
  host.includes('localhost') || 
  host.includes('127.0.0.1') ||
  origin.includes('localhost') ||
  origin.includes('127.0.0.1')
);

// 拒绝非浏览器连接
if (!isBrowserConnection && !isLocalConnection && !origin) {
  socket.close(1008, 'Connection rejected: Non-browser source');
}
```

## 🚀 快速开始

### 启动 Web UI + Agent 系统

```bash
cd examples
npx tsx web-ui-with-agent.ts
```

然后打开浏览器访问: http://localhost:3000

### 配置选项

```typescript
interface WebUIClientConfig {
  serverPort?: number;        // HTTP 服务器端口 (默认: 3000)
  webSocketPort?: number;     // WebSocket 端口 (默认: 3001)
  staticPath?: string;        // 静态文件路径
  enableWebSocket?: boolean;  // 启用 WebSocket (默认: true)
  corsOrigins?: string[];     // CORS 允许的源
  maxConcurrentConnections?: number; // 最大并发连接数
  sessionTimeout?: number;    // 会话超时时间
  enableFileUpload?: boolean; // 启用文件上传
  uploadMaxSize?: number;     // 上传文件大小限制
}
```

## 💻 前端组件

### ChatInterface 组件

主要的聊天界面组件，提供完整的用户交互功能。

**功能特性:**
- 消息显示和发送
- 执行模式切换按钮
- 审批请求处理
- 连接状态显示
- 自动重连机制

**使用示例:**
```tsx
import { ChatInterface } from './components/ChatInterface';

function App() {
  return (
    <div className="h-screen">
      <ChatInterface sessionId="your-session-id" />
    </div>
  );
}
```

### useWebSocket Hook

WebSocket 连接管理 Hook，处理所有 WebSocket 相关逻辑。

**功能特性:**
- 自动连接和重连
- 消息发送和接收
- 错误处理
- 连接状态管理

**使用示例:**
```tsx
const { isConnected, error, sendMessage, reconnect } = useWebSocket({
  url: 'ws://localhost:3001/ws',
  onMessage: handleMessage,
  onConnect: () => console.log('Connected'),
  onDisconnect: () => console.log('Disconnected'),
  reconnectAttempts: 5,
  reconnectInterval: 3000
});
```

## 🔧 后端服务

### WebUIClient 类

Web UI 的后端服务类，继承自 `BaseInteractiveLayer`。

**主要功能:**
- HTTP 服务器管理
- WebSocket 服务器管理
- 事件处理和转发
- 连接验证和管理
- API 接口提供

**创建实例:**
```typescript
const webUIClient = WebUIClient.createDefault(eventBus);
await webUIClient.start();
```

### API 接口

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/stats` | GET | 获取系统统计信息 |
| `/api/capabilities` | GET | 获取系统能力信息 |
| `/api/sessions` | POST | 创建新会话 |
| `/api/sessions/:id` | DELETE | 删除会话 |

## 🎯 执行模式

### Auto 模式
- **特点**: Agent 自动执行所有操作，无需用户批准
- **适用**: 开发环境、安全操作、快速原型
- **工具集**: 不包含 `approval_request` 工具
- **UI 显示**: 绿色指示器 🟢

### Manual 模式  
- **特点**: Agent 会请求用户批准风险操作
- **适用**: 生产环境、敏感操作、精确控制
- **工具集**: 包含完整的审批工作流
- **UI 显示**: 黄色指示器 🟡

### 模式切换

**前端切换:**
点击右上角的模式按钮即可切换

**切换流程:**
1. 用户点击模式切换按钮
2. 前端发送 `execution_mode_change` 事件
3. Agent 接收并处理模式变更
4. Agent 发送 `execution_mode_change_confirmed` 确认
5. 前端更新 UI 状态

```typescript
// 前端发送模式切换请求
const clientMessage: ClientMessage = {
  type: 'execution_mode_change',
  payload: {
    fromMode: 'auto',
    toMode: 'manual',
    reason: 'User requested mode change via web UI'
  }
};
```

## 📝 消息类型

### 客户端消息 (ClientMessage)

```typescript
interface ClientMessage {
  id: string;
  type: 'command' | 'approval_response' | 'input_response' | 
        'collaboration_response' | 'execution_mode_change';
  sessionId: string;
  payload: any;
  timestamp: number;
}
```

### 服务器消息 (ServerMessage)

```typescript
interface ServerMessage {
  id: string;
  type: 'event' | 'response' | 'error' | 'status';
  payload: any;
  timestamp: number;
}
```

### 事件类型

| 事件类型 | 描述 | 处理方式 |
|----------|------|----------|
| `status_update` | Agent 状态更新 | 显示进度和状态 |
| `approval_request` | 审批请求 | 显示审批界面 |
| `collaboration_request` | 协作请求 | 显示协作界面 |
| `execution_mode_change` | 模式变更通知 | 更新模式显示 |
| `execution_mode_change_confirmed` | 模式变更确认 | 确认切换结果 |
| `error` | 错误信息 | 显示错误消息 |

## 🎨 UI 组件

### 消息类型样式

```css
/* 用户消息 */
.user-message {
  background: #3b82f6;  /* 蓝色 */
  color: white;
  align-self: flex-end;
}

/* Agent 消息 */
.agent-message {
  background: white;
  border: 1px solid #e5e7eb;
  align-self: flex-start;
}

/* 系统消息 */
.system-message {
  background: #f3f4f6;  /* 灰色 */
  color: #374151;
}

/* 错误消息 */
.error-message {
  background: #fef2f2;  /* 红色背景 */
  color: #dc2626;
}
```

### 审批界面

审批请求会显示特殊的交互界面：

```tsx
{message.metadata?.approval && (
  <div className="approval-panel">
    <div className="risk-level">Risk Level: {approval.riskLevel}</div>
    <pre className="preview">{approval.details.preview}</pre>
    <div className="actions">
      <button onClick={() => handleApproval(approval, 'accept')}>
        Accept
      </button>
      <button onClick={() => handleApproval(approval, 'reject')}>
        Reject
      </button>
    </div>
  </div>
)}
```

## 🔍 故障排除

### 常见问题

1. **WebSocket 连接失败**
   ```bash
   # 检查端口占用
   lsof -i :3001
   # 确保防火墙允许连接
   ```

2. **前端无法连接**
   - 检查 WebSocket URL 是否正确 (`ws://localhost:3001/ws`)
   - 确认后端服务正在运行
   - 查看浏览器控制台错误信息

3. **模式切换失败**
   - 检查 Agent 是否正在运行
   - 查看后端日志中的错误信息
   - 确认 EventBus 连接正常

4. **大量 WebSocket 连接**
   - 已修复：实现了连接来源验证
   - MCP 服务器不再错误连接到 WebSocket

### 调试技巧

1. **启用详细日志**
   ```typescript
   // 在 agent 配置中设置
   LogLevel.DEBUG
   ```

2. **查看 WebSocket 消息**
   ```javascript
   // 在浏览器控制台中
   console.log('WebSocket messages:', messages);
   ```

3. **检查连接状态**
   ```bash
   # 查看活跃连接
   netstat -an | grep :3001
   ```

## 📚 开发指南

### 添加新的消息类型

1. **更新类型定义**
   ```typescript
   // src/web/frontend/src/types/index.ts
   export interface ClientMessage {
     type: 'command' | 'approval_response' | 'your_new_type';
     // ...
   }
   ```

2. **添加前端处理**
   ```typescript
   // ChatInterface.tsx
   const handleEventMessage = (event: any) => {
     switch (event.type) {
       case 'your_new_type':
         handleYourNewType(event);
         break;
     }
   };
   ```

3. **添加后端处理**
   ```typescript
   // webUIClient.ts
   private handleWebSocketMessage(connection, data) {
     switch (message.type) {
       case 'your_new_type':
         this.handleYourNewType(connection, message);
         break;
     }
   }
   ```

### 自定义 UI 组件

```tsx
// 创建新的消息组件
const CustomMessageComponent = ({ message }: { message: ChatMessage }) => {
  return (
    <div className="custom-message">
      {/* 你的自定义内容 */}
    </div>
  );
};

// 在 ChatInterface 中使用
const renderMessage = (message: ChatMessage) => {
  if (message.type === 'custom') {
    return <CustomMessageComponent message={message} />;
  }
  // 默认渲染逻辑...
};
```

## 🚀 部署

### 生产环境配置

```typescript
const productionConfig: WebUIClientConfig = {
  serverPort: process.env.PORT || 3000,
  webSocketPort: process.env.WS_PORT || 3001,
  corsOrigins: [
    'https://your-domain.com',
    'https://www.your-domain.com'
  ],
  maxConcurrentConnections: 1000,
  sessionTimeout: 60 * 60 * 1000, // 1 hour
  enableFileUpload: true,
  uploadMaxSize: 50 * 1024 * 1024 // 50MB
};
```

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000 3001

CMD ["npm", "start"]
```

### 环境变量

```bash
# .env
PORT=3000
WS_PORT=3001
NODE_ENV=production
OPENAI_API_KEY=your_openai_key
FIRECRAWL_API_KEY=your_firecrawl_key
```

## 📄 许可证

MIT License - 详见 LICENSE 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

---

**更多信息请参考:**
- [核心架构文档](../core/README.md)
- [事件系统文档](../core/events/README.md)
- [示例代码](../../examples/README.md) 