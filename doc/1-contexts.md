# Context 架构文档

## 概述
Context 系统是 HHH-AGI 的核心架构组件，负责组织、存储和提供各种上下文信息，使代理能够有效地理解和响应用户请求。

## 核心组件
- **ContextManager**: 上下文管理器，负责注册、查找和渲染所有上下文
- **IContext**: 上下文接口，定义了上下文的数据结构和行为
- **IRAGEnabledContext**: 支持检索增强生成(RAG)的上下文接口

## 架构图

```
┌─────────────────────────────────────────────────┐
│                  ContextManager                  │
├─────────────────────────────────────────────────┤
│ - contexts: IRAGEnabledContext[]                │
│ - registerContext()                             │
│ - findContextById()                             │
│ - renderPrompt()                                │
│ - contextList()                                 │
└───────────────┬─────────────────────────────────┘
                │ 管理
                ▼
┌─────────────────────────────────────────────────┐
│                    IContext                      │
├─────────────────────────────────────────────────┤
│ - id: string                                    │
│ - description: string                           │
│ - dataSchema: ZodObject                         │
│ - data: object                                  │
│ - setData(), getData()                          │
│ - toolSet(): ToolSet | ToolSet[]                │
│ - onToolCall?: (result: ToolCallResult) => void │
│ - renderPrompt(): string | Promise<string>      │
└───────────────┬─────────────────────────────────┘
                │ 扩展
                ▼
┌─────────────────────────────────────────────────┐
│              IRAGEnabledContext                  │
├─────────────────────────────────────────────────┤
│ - rags?: Record<string, IRAG>                   │
│ - registerRAG(): void                           │
│ - queryContextRAG(): Promise<RAGResult[]>       │
│ - loadRAGForPrompt(): Promise<string>           │
└─────────────────────────────────────────────────┘
```

## 工作流程图

```
┌──────────┐      ┌───────────────┐      ┌───────────────┐
│  Agent   │      │ContextManager │      │   Contexts    │
└────┬─────┘      └───────┬───────┘      └───────┬───────┘
     │ 1. 初始化Agent     │                      │
     ├─────────────────►  │                      │
     │                    │                      │
     │ 2. 注册Contexts    │                      │
     ├─────────────────►  │                      │
     │                    │ 3. 存储Contexts      │
     │                    ├─────────────────────►│
     │                    │                      │
     │ 4. 处理用户请求    │                      │
     ├─────────────────►  │                      │
     │                    │ 5. 渲染所有Contexts  │
     │                    ├─────────────────────►│
     │                    │                      │
     │                    │ 6. 返回渲染结果      │
     │                    │◄─────────────────────┤
     │ 7. 渲染完整Prompt  │                      │
     │◄────────────────── │                      │
     │                    │                      │
     │ 8. 调用LLM         │                      │
     ├───┐                │                      │
     │   │                │                      │
     │◄──┘                │                      │
     │                    │                      │
     │ 9. 执行Tool调用    │                      │
     ├─────────────────►  │                      │
     │                    │ 10. 更新相关Context  │
     │                    ├─────────────────────►│
     │                    │                      │
     │                    │ 11. Context更新完成  │
     │                    │◄─────────────────────┤
     │ 12. 继续处理       │                      │
     │◄────────────────── │                      │
     │                    │                      │
└─────┴────────────────┴──────────────────────┘
```

## 关键实现细节
1. Context 通过 Zod Schema 定义数据结构，确保类型安全
2. Context 可以返回单个或多个 ToolSet，提供灵活的工具管理
3. onToolCall 方法允许 Context 处理工具调用结果，实现自动数据更新
4. Context 渲染方法生成结构化提示，指导 LLM 理解和使用该上下文
5. Context Manager 汇总所有上下文内容，生成完整系统提示

## 新增：onToolCall 机制

`onToolCall` 方法是 Context 接口的一个重要扩展，允许 Context 直接处理工具调用结果。这一机制使 Context 能够自动更新自身数据，无需 Agent 额外处理。

### 工作原理
1. Agent 在处理工具调用结果时，会自动调用 `processToolCallResult` 方法
2. 该方法遍历所有 Context，检查是否实现了 `onToolCall` 方法
3. 对于实现了该方法的 Context，将工具调用结果传递给它们
4. Context 可以基于工具调用结果更新自身数据

### 实现示例
```typescript
// Agent 实现的工具调用结果处理方法
protected processToolCallResult(toolCallResult: ToolCallResult): void {
    if (!toolCallResult) return;
    
    // 遍历所有 Context 并调用 onToolCall (如果存在)
    const contexts = this.contextManager.contextList();
    for (const context of contexts) {
        try {
            if (context && typeof (context as any).onToolCall === 'function') {
                (context as any).onToolCall(toolCallResult);
            }
        } catch (error) {
            logger.error(`Error in context ${context.id} onToolCall handler:`, error);
        }
    }
}

// Context 中实现 onToolCall 方法
export const MyContextWithToolCallHandler = {
    ...baseContext,
    
    onToolCall(toolCallResult: ToolCallResult) {
        if (!toolCallResult || !toolCallResult.name) return;
        
        // 检查是否是我们关心的工具
        if (toolCallResult.name === "my_specific_tool") {
            // 更新 Context 数据
            this.setData({ 
                lastResult: toolCallResult.result,
                lastUpdateTime: new Date().toISOString()
            });
            
            // 处理工具调用结果
            this.processToolResult(toolCallResult.result);
        }
    }
};
```

### 适用场景
1. **数据自动更新**：将工具调用结果直接整合到上下文数据
2. **状态转换管理**：根据工具执行结果转换上下文状态
3. **自动响应**：根据工具调用结果自动更新系统状态
4. **外部系统集成**：处理 MCP 工具等外部工具调用结果
5. **数据筛选与转换**：对工具返回的原始数据进行处理后再存储

## 具体示例

以下是一个典型的 Context 实现示例：

```typescript
// 定义Context的数据结构
export const MyContextSchema = z.object({
    recentData: z.array(z.any()).default([]),
    lastQuery: z.string().optional(),
    settings: z.object({
        enabled: z.boolean().default(true),
        maxItems: z.number().default(10)
    }).default({})
});

// 创建Context
export const MyContext = ContextHelper.createContext({
    id: "my-context-id",
    description: "Manages specific functionality and related data",
    dataSchema: MyContextSchema,
    initialData: {
        recentData: [],
        settings: {
            enabled: true,
            maxItems: 10
        }
    },
    renderPromptFn(data) {
        return `
        # My Context Title
        
        Current status: ${data.settings.enabled ? 'Active' : 'Inactive'}
        Recent items: ${data.recentData.length}
        
        ## Available Operations
        1. Operation one - description here
        2. Operation two - description here
        
        ## Recent Data
        ${data.recentData.slice(0, 3).map(item => `- ${item.name}`).join('\n')}
        `;
    },
    toolSetFn: () => ({
        name: "MyContextTools",
        description: "Tools for my specific functionality",
        tools: [/* tool definitions */],
        active: true,
        source: "my-context"
    })
});

// 如果需要处理工具调用结果，可以扩展为：
export const MyContextWithToolCallHandler = {
    ...MyContext,
    
    onToolCall(toolCallResult) {
        if (toolCallResult.name === "my_tool") {
            // Update context data based on tool result
            this.setData({ 
                recentData: [...this.data.recentData, toolCallResult.result]
            });
        }
    }
};
```