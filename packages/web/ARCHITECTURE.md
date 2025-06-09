# HHH-AGI Web UI 架构设计

## 🏗️ 架构概览

### 新架构 (v2.0) - 全局连接管理

```
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (App Level)                       │
├─────────────────────────────────────────────────────────────┤
│  WebSocketProvider (全局单例)                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  • 连接池管理                                       │   │
│  │  • 防重复连接                                       │   │
│  │  • 订阅者模式                                       │   │
│  │  • 智能重连                                         │   │
│  │  • 连接状态管理                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
├─────────────────────────────────────────────────────────────┤
│  组件层 (Component Level)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ChatInterface                                      │   │
│  │  ├─ useWebSocketMessage                             │   │
│  │  ├─ 订阅消息                                        │   │
│  │  ├─ 发送消息                                        │   │
│  │  └─ 状态监听                                        │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                              │
├─────────────────────────────────────────────────────────────┤
│  传输层 (Transport Level)                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  WebSocket 连接                                     │   │
│  │  ├─ 单一连接实例                                    │   │
│  │  ├─ 连接 ID 验证                                    │   │
│  │  ├─ 指数退避重连                                    │   │
│  │  └─ 错误处理                                        │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 核心组件

### 1. WebSocketProvider

**职责**：
- 全局 WebSocket 连接管理
- 防止重复连接
- 订阅者模式实现
- 智能重连策略

**特性**：
- ✅ 连接 ID 验证机制
- ✅ 指数退避重连
- ✅ 多组件订阅支持
- ✅ StrictMode 兼容
- ✅ 内存泄漏防护

```typescript
interface WebSocketContextType {
  isConnected: boolean;
  error: string | null;
  sendMessage: (message: ClientMessage) => void;
  reconnect: () => void;
  disconnect: () => void;
  subscribe: (callback: (message: ServerMessage) => void) => () => void;
}
```

### 2. useWebSocketMessage Hook

**职责**：
- 简化组件级别的 WebSocket 使用
- 提供消息订阅接口
- 状态变化监听

**特性**：
- ✅ 自动订阅/取消订阅
- ✅ 回调引用优化
- ✅ 状态变化监听
- ✅ 错误处理

```typescript
interface UseWebSocketMessageOptions {
  onMessage?: (message: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string | null) => void;
}
```

## 🚀 关键改进

### 1. 解决 React StrictMode 问题

**问题**：
- StrictMode 在开发环境下故意双挂载组件
- 导致 WebSocket 重复连接和无限重连循环

**解决方案**：
- 连接 ID 验证机制
- Provider 级别的连接管理
- 过期连接自动丢弃

```typescript
// 连接 ID 验证
const connectionId = `${providerIdRef.current}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
connectionIdRef.current = connectionId;

ws.onopen = () => {
  // 验证连接有效性
  if (connectionIdRef.current !== connectionId) {
    console.log(`🚫 Outdated connection, closing`);
    ws.close();
    return;
  }
  // 处理连接...
};
```

### 2. 智能重连策略

**特性**：
- 指数退避算法
- 最大重连次数限制
- 连接状态验证

```typescript
// 指数退避重连
const delay = Math.min(
  reconnectInterval * Math.pow(2, reconnectCountRef.current - 1), 
  30000 // 最大30秒
);
```

### 3. 订阅者模式

**优势**：
- 多组件可同时订阅同一连接
- 自动订阅管理
- 内存泄漏防护

```typescript
const subscribe = useCallback((callback: (message: ServerMessage) => void) => {
  subscribersRef.current.add(callback);
  
  return () => {
    subscribersRef.current.delete(callback);
  };
}, []);
```

## 📊 性能优化

### 1. 连接复用
- 全局单一 WebSocket 连接
- 多组件共享同一连接
- 减少服务器连接压力

### 2. 内存管理
- 自动清理过期连接
- 订阅者自动取消订阅
- 防止内存泄漏

### 3. 状态同步
- 全局连接状态管理
- 实时状态更新
- 错误状态传播

## 🔒 错误处理

### 1. 连接错误
- 连接超时处理
- 网络错误恢复
- 状态错误同步

### 2. 消息错误
- JSON 解析错误处理
- 订阅者错误隔离
- 错误日志记录

### 3. 重连错误
- 最大重连次数限制
- 重连失败提示
- 手动重连支持

## 🧪 测试验证

### 1. 连接稳定性测试
```bash
# 测试 WebSocket 连接
node -e "const WebSocket=require('ws');const ws=new WebSocket('ws://localhost:3002/ws');ws.on('open',()=>{console.log('✅ Connected');});ws.on('message',m=>console.log('📨',m.toString()));setTimeout(()=>process.exit(),5000);"
```

### 2. 重连机制测试
- 模拟网络中断
- 验证自动重连
- 测试重连次数限制

### 3. 多组件订阅测试
- 多个组件同时订阅
- 验证消息广播
- 测试订阅清理

## 📈 监控指标

### 1. 连接指标
- 连接成功率
- 重连次数
- 连接持续时间

### 2. 消息指标
- 消息发送成功率
- 消息接收延迟
- 消息处理错误率

### 3. 性能指标
- 内存使用量
- CPU 使用率
- 网络带宽使用

## 🔮 未来扩展

### 1. 连接池扩展
- 多服务器连接支持
- 负载均衡
- 故障转移

### 2. 消息队列
- 离线消息缓存
- 消息优先级
- 消息持久化

### 3. 安全增强
- 连接认证
- 消息加密
- 访问控制

## 📚 使用示例

### 基本使用

```tsx
// App.tsx
import { WebSocketProvider } from './contexts/WebSocketContext';
import { ChatInterface } from './components/ChatInterface';

function App() {
  return (
    <WebSocketProvider url="ws://localhost:3002/ws">
      <ChatInterface sessionId="default-session" />
    </WebSocketProvider>
  );
}
```

### 组件中使用

```tsx
// ChatInterface.tsx
import { useWebSocketMessage } from '../hooks/useWebSocketMessage';

function ChatInterface() {
  const { isConnected, sendMessage } = useWebSocketMessage({
    onMessage: (message) => {
      console.log('Received:', message);
    },
    onConnect: () => {
      console.log('Connected to server');
    }
  });

  return (
    <div>
      <div>Status: {isConnected ? 'Connected' : 'Disconnected'}</div>
      <button onClick={() => sendMessage({ type: 'ping' })}>
        Send Ping
      </button>
    </div>
  );
}
```

## 🎯 总结

新架构成功解决了以下问题：

1. ✅ **React StrictMode 双挂载问题**
2. ✅ **WebSocket 重复连接问题**
3. ✅ **无限重连循环问题**
4. ✅ **内存泄漏问题**
5. ✅ **连接状态管理问题**

通过全局连接管理、订阅者模式和智能重连策略，新架构提供了更稳定、更高效的 WebSocket 连接管理方案。 