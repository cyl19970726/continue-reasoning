# MCP 集成架构文档

## 概述
MCP (Model Context Protocol) 集成允许 HHH-AGI 系统动态连接外部资源和工具，扩展 Agent 的能力。本文档详述了 MCP 服务器与 Context 的直接集成机制，实现更清晰的资源管理和工具关联。

## 核心组件
- **IContext接口扩展**: 包含`mcpServers`属性，直接定义与Context关联的MCP服务器
- **ContextManager集中管理**: 通过`installAllContexts`方法集中管理所有Context的MCP服务器安装
- **自动工具关联**: 创建与Context同名的ToolSet，实现MCP工具的自动注入

## 架构图

```
┌─────────────────────────────────────────────────┐
│                      Agent                       │
├─────────────────────────────────────────────────┤
│ - contextManager                                │
│ - setup(): 调用contextManager.installAllContexts│
└───────────────┬─────────────────────────────────┘
                │ 管理
                ▼
┌─────────────────────────────────────────────────┐
│               ContextManager                     │
├─────────────────────────────────────────────────┤
│ - contexts: IContext[]                          │
│ - installAllContexts(): 集中安装所有MCP服务器    │
└───────────────┬─────────────────────────────────┘
                │ 管理
                ▼
┌─────────────────────────────────────────────────┐
│              特定领域Context                     │
├─────────────────────────────────────────────────┤
│ - id: "context-id"                              │
│ - mcpServers: [...服务器配置...]                │
│ - install(): 连接MCP服务器并注册工具            │
│ - toolSet(): 返回空工具集，待自动填充           │
│ - onToolCall(): 处理工具调用结果                │
└───────────────┬─────────────────────────────────┘
                │ 连接
                ▼
┌─────────────────────────────────────────────────┐
│               外部MCP服务器                      │
├─────────────────────────────────────────────────┤
│ - tools: 外部工具[]                             │
│ - prompts: 外部提示[]                           │
│ - resources: 外部资源[]                         │
└─────────────────────────────────────────────────┘
```

## MCP集成流程图

```
┌──────────┐    ┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Agent   │    │ ContextManager │    │  特定领域Context│    │  MCP服务器     │
└────┬─────┘    └───────┬───────┘    └───────┬───────┘    └───────┬───────┘
     │                  │                    │                    │
     │ 1. 初始化Agent   │                    │                    │
     ├─────────────────►│                    │                    │
     │                  │                    │                    │
     │ 2. 调用          │                    │                    │
     │ installAllContexts│                    │                    │
     ├─────────────────►│                    │                    │
     │                  │                    │                    │
     │                  │ 3. 遍历所有Context │                    │
     │                  │    调用各自的install│                    │
     │                  ├────────────────────►                    │
     │                  │                    │                    │
     │                  │                    │ 4. 根据mcpServers  │
     │                  │                    │    配置连接服务器  │
     │                  │                    ├───────────────────►│
     │                  │                    │                    │
     │                  │                    │ 5. 获取工具列表    │
     │                  │                    ├───────────────────►│
     │                  │                    │                    │
     │                  │                    │ 6. 返回工具列表    │
     │                  │                    │◄───────────────────┤
     │                  │                    │                    │
     │                  │                    │ 7. 创建ToolSet并   │
     │                  │                    │    注册MCP工具     │
     │                  │                    ├───┐                │
     │                  │                    │   │                │
     │                  │                    │◄──┘                │
     │                  │                    │                    │
     │                  │ 8. 安装结果返回    │                    │
     │                  │◄────────────────────                    │
     │                  │                    │                    │
     │ 9. 安装结果处理  │                    │                    │
     │◄─────────────────┤                    │                    │
     │                  │                    │                    │
     │ 10.处理用户请求  │                    │                    │
     │    调用MCP工具   │                    ├───────────────────►│
     │                  │                    │                    │
     │ 11.工具调用结果  │                    │                    │
     │◄─────────────────┼────────────────────┼───────────────────┤
     │                  │                    │                    │
     │                  │                    │ 12.onToolCall处理  │
     │                  │                    │                    │
     │                  │                    ├───┐                │
     │                  │                    │   │                │
     │                  │                    │◄──┘                │
└─────┴──────────────┴──────────────────┴──────────────────┘
```

## 关键实现细节

### 1. Context定义MCP服务器配置
每个Context可以直接在定义中包含MCP服务器配置，不再依赖外部配置文件：

```typescript
export const HackernewsContext = ContextHelper.createContext({
    id: "mcp-hn",
    description: "...",
    // 直接定义MCP服务器配置
    mcpServers: [
        {
            name: 'mcp-hn',
            type: 'stdio',
            command: 'uvx',
            args: ['mcp-hn']
        }
    ],
    toolSetFn: () => ({
        name: "mcp-hn", // 使用与Context ID相同的名称实现自动关联
        description: "...",
        tools: [] // 工具将被自动填充
    })
});
```

### 2. ContextManager集中管理MCP服务器安装
ContextManager实现了`installAllContexts`方法，集中管理所有Context的MCP服务器安装：

```typescript
// ContextManager.installAllContexts实现
async installAllContexts(agent: IAgent): Promise<InstallResults> {
    const result = {
        totalContexts: this.contexts.length,
        installedCount: 0,
        failedCount: 0,
        skippedCount: 0,
        details: []
    };
    
    // 按顺序安装每个Context的MCP服务器
    for (const context of this.contexts) {
        try {
            if (context.install && context.mcpServers?.length > 0) {
                await context.install(agent);
                result.installedCount++;
            } else {
                result.skippedCount++;
            }
        } catch (error) {
            result.failedCount++;
            // 记录错误信息
        }
    }
    
    return result;
}
```

### 3. Agent使用ContextManager的集中安装方法
Agent的setup方法调用ContextManager的installAllContexts方法安装MCP服务器：

```typescript
async setup(): Promise<void> {
    // 注册上下文
    this.contexts.forEach((context) => {
        this.contextManager.registerContext(context);
    });
    
    // 使用ContextManager集中安装所有MCP服务器
    const installResults = await this.contextManager.installAllContexts(this);
    
    // 日志记录安装结果
    logger.info(`MCP服务器安装结果: 总数=${installResults.totalContexts}, 成功=${installResults.installedCount}, 失败=${installResults.failedCount}`);
    
    // 其他设置...
}
```

### 4. Context安装过程
每个Context的`install`方法负责连接其定义的MCP服务器：

```typescript
// Context中默认的install实现
async install(agent: IAgent): Promise<void> {
  if (!this.mcpServers || this.mcpServers.length === 0) return;
  
  try {
    // 处理每个MCP服务器配置
    for (const serverConfig of this.mcpServers) {
      // 连接服务器...
      // 注册工具...
    }
  } catch (error) {
    // 错误处理...
  }
}
```

## 最佳实践

1. **命名一致性**：Context ID应与其关联的主要MCP服务器名称相同
2. **内部配置**：在Context定义中直接包含所需的MCP服务器配置
3. **工具集命名**：toolSet的name应与Context ID相同以实现自动关联
4. **集中管理**：使用ContextManager的installAllContexts方法集中管理安装
5. **错误处理**：妥善处理所有可能的异常情况，确保系统稳定 

## 动态创建Context

除了静态定义Context，系统现在还支持通过`create_rag_context_with_mcp`工具动态创建具有RAG能力的Context并关联MCP服务器。

### 工具使用示例

```typescript
// 使用create_rag_context_with_mcp工具动态创建Context
const result = await agent.call("create_rag_context_with_mcp", {
  contextId: "my-specialized-context",
  contextDescription: "处理特定领域数据的上下文，提供相关查询和分析功能",
  mcpServer: {
    name: "my-specialized-context",
    type: "stdio",
    command: "npx",
    args: ["-y", "specialized-mcp-package"],
    autoActivate: true
  },
  initialData: {
    // 可选的初始数据
    status: "ready",
    preferences: {
      language: "zh-CN"
    }
  }
});

// 结果包含：
// {
//   success: true,
//   contextId: "my-specialized-context"
// }
```

### 动态Context的特性

1. **自动关联MCP工具**：创建的Context会自动设置空的toolSet，并在MCP服务器连接后填充相应工具
2. **历史记录追踪**：自动记录工具调用历史，方便追踪Context状态变化
3. **简洁渲染**：提供默认的renderPrompt实现，显示Context状态和历史
4. **即时安装**：可通过autoActivate参数选择是否立即安装MCP服务器

### 应用场景

动态创建Context特别适用于以下场景：

1. **动态领域扩展**：在Agent运行时根据需要添加新的领域能力
2. **用户自定义工具**：允许用户动态注册自己的MCP服务器和工具集
3. **按需加载资源**：仅在需要时加载重量级MCP服务器，优化资源使用
4. **临时工具集成**：创建临时Context连接特定场景所需的工具 