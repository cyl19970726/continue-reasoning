# Tool 架构文档

## 概述
工具系统允许 Agent 与外部世界交互，执行各种操作。系统支持同步和异步工具，通过 ToolCallContext 管理工具执行流程。

## 核心组件
- **ITool**: 工具接口，定义了工具的结构和行为
- **ToolCallContext**: 管理工具调用和结果
- **ToolCallDefinition**: 工具定义，描述工具的能力和参数
- **ToolCallParams**: 工具调用参数
- **ToolExecutionResult**: 工具执行结果

## 架构图

```
┌───────────────────────────────────────────────┐
│                   ITool                        │
├───────────────────────────────────────────────┤
│ - id: string                                  │
│ - name: string                                │
│ - description: string                         │
│ - params: ZodObject                           │
│ - async: boolean                              │
│ - execute(): Promise<any> | any               │
│ - toCallParams(): ToolCallDefinition          │
└───────────────────────────────────────────────┘
           │
           │ 使用
           ▼
┌───────────────────────────────────────────────┐
│              ToolCallContext                   │
├───────────────────────────────────────────────┤
│ - toolDefinitions: ToolCallDefinition[]       │
│ - toolCalls: ToolCallParams[]                 │
│ - toolResults: ToolExecutionResult[]          │
│ - setToolDefinitions()                        │
│ - setToolCalls()                              │
│ - setToolCallResult()                         │
└───────────────────────────────────────────────┘
```

## 工具执行流程图

```
┌──────────┐      ┌───────────────┐      ┌───────────────┐     ┌───────────┐
│  Agent   │      │ToolCallContext│      │     Tool      │     │ TaskQueue │
└────┬─────┘      └───────┬───────┘      └───────┬───────┘     └─────┬─────┘
     │                    │                      │                   │
     │ 1. 收集所有工具    │                      │                   │
     ├─────────────────►  │                      │                   │
     │                    │                      │                   │
     │ 2. 设置工具定义    │                      │                   │
     ├─────────────────►  │                      │                   │
     │                    │                      │                   │
     │ 3. 调用LLM并获取   │                      │                   │
     │    工具调用请求    │                      │                   │
     ├───┐                │                      │                   │
     │   │                │                      │                   │
     │◄──┘                │                      │                   │
     │                    │                      │                   │
     │ 4. 设置工具调用    │                      │                   │
     ├─────────────────►  │                      │                   │
     │                    │                      │                   │
     │ 5a. 执行同步工具   │                      │                   │
     ├────────────────────┼─────────────────────►│                   │
     │                    │                      │                   │
     │                    │                      │ 6a. 返回结果      │
     │                    │                      │◄──────────────────┤
     │                    │                      │                   │
     │ 7a. 设置工具结果   │                      │                   │
     ├─────────────────►  │                      │                   │
     │                    │                      │                   │
     │ 5b. 提交异步工具   │                      │                   │
     ├────────────────────┼──────────────────────┼──────────────────►│
     │                    │                      │                   │
     │                    │                      │                   │ 6b. 执行工具
     │                    │                      │◄──────────────────┤
     │                    │                      │                   │
     │                    │                      │ 7b. 返回结果      │
     │                    │                      │───────────────────►
     │                    │                      │                   │
     │ 8b. 设置工具结果   │                      │                   │
     │◄───────────────────┼──────────────────────┼───────────────────┤
     │                    │                      │                   │
     │ 9. 处理工具调用结果│                      │                   │
     │   (调用onToolCall) │                      │                   │
     ├───┐                │                      │                   │
     │   │                │                      │                   │
     │◄──┘                │                      │                   │
     │                    │                      │                   │
└─────┴────────────────┴──────────────────────┴───────────────────┘
```

## 关键实现细节
1. 工具分为同步（直接执行）和异步（通过任务队列执行）两种类型
2. ToolCallContext 跟踪所有工具定义、调用和结果
3. Agent 在处理工具调用结果后，通过 processToolCallResult 方法通知相关上下文
4. 工具描述和参数架构使用 JSON Schema，便于 LLM 理解其用法
5. 工具结果通过 call_id 与调用请求关联，确保正确处理多个并发调用

## 同步vs异步工具

### 同步工具
- 直接执行并等待结果
- 适用于简单、快速的操作
- 示例：stop-response、cli-response、简单计算
- 设置 `async: false` 来定义同步工具
- 同步工具的结果立即返回给 Agent 并添加到 toolResults 中

### 异步工具
- 提交到任务队列后继续执行
- 适用于长时间运行的操作
- 通过任务队列系统管理
- 示例：web搜索、文件处理、API调用
- 设置 `async: true` 来定义异步工具
- 异步工具的结果会在任务完成时通过回调添加到 toolResults 中

### 工具执行时机
同步和异步工具的主要区别在于执行时机和 Agent 的等待行为：

1. **同步工具**：执行时，Agent 会等待工具完成并获取结果，然后才继续处理。适用于需要立即结果的场景。
2. **异步工具**：执行时，Agent 会将工具提交到任务队列，然后立即继续处理，不等待结果。结果将在稍后通过回调获取。适用于长时间运行的操作，避免阻塞 Agent。

## ToolCallContext 详解

ToolCallContext 是连接 Agent 和工具系统的桥梁，它负责跟踪工具定义、调用请求和执行结果。其核心数据结构如下：

```typescript
const ToolAsyncCallContextDataSchema = z.object({
    toolDefinitions: z.array(SimpleToolCallDefSchema).describe("the tool defition list. ToolDefinitiondefine the tool name,desctiption,input param and the output result"),
    toolCalls: z.array(ToolCallParamsSchema),
    toolResults: z.array(ToolExecutionResultSchema)
}).describe("toolDefinitions define all the function, toolCalls is generated by the LLM and give the input param and the which tool handler should be called, toolResults record the tool handler result after exection.");
```

ToolCallContext 提供三个关键方法：

1. **setToolDefinitions**: 设置可用工具定义列表，更新 `toolDefinitions`
2. **setToolCalls**: 记录 LLM 调用的工具，更新 `toolCalls`
3. **setToolCallResult**: 存储工具执行结果，更新 `toolResults`

这些数据和方法一起构成了一个完整的工具执行追踪系统，确保工具调用和结果能够被正确匹配和处理。

### 工具结果处理

当工具执行完成后，Agent 会通过 `processToolCallResult` 方法处理结果：

```typescript
protected processToolCallResult(toolCallResult: ToolExecutionResult): void {
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
```

这一机制允许各个 Context 根据工具调用结果自动更新自身状态，无需 Agent 额外干预。

## 工具创建示例

```typescript
// 创建同步工具
export const MySimpleTool = createTool({
    id: "my_simple_tool",
    name: "my_simple_tool",
    description: "Performs a simple operation synchronously",
    inputSchema: z.object({
        param1: z.string().describe("First parameter"),
        param2: z.number().describe("Second parameter")
    }),
    outputSchema: z.object({
        result: z.string(),
        success: z.boolean()
    }),
    async: false,  // 同步工具
    execute: async (params, agent) => {
        // 执行操作
        const result = `Processed ${params.param1} with value ${params.param2}`;
        
        // 返回符合outputSchema的结果
        return {
            result,
            success: true
        };
    }
});

// 创建异步工具
export const MyLongRunningTool = createTool({
    id: "my_long_running_tool",
    name: "my_long_running_tool",
    description: "Performs a long-running operation asynchronously",
    inputSchema: z.object({
        query: z.string().describe("The query to process"),
        timeout: z.number().default(30).describe("Timeout in seconds")
    }),
    outputSchema: z.object({
        results: z.array(z.any()),
        processingTime: z.number()
    }),
    async: true,  // 异步工具
    execute: async (params, agent) => {
        const startTime = Date.now();
        
        // 模拟长时间运行的操作
        const results = await someAsyncOperation(params.query, params.timeout);
        
        const processingTime = (Date.now() - startTime) / 1000;
        
        return {
            results,
            processingTime
        };
    }
});
```

## ToolCallContext的作用

ToolCallContext是Agent与工具系统之间的桥梁，负责：

1. 存储所有可用工具的定义
2. 记录LLM决定调用的工具及其参数
3. 存储工具执行结果
4. 在系统提示中展示工具状态，包括挂起的异步调用
5. 引导LLM正确使用同步和异步工具

这种设计使Agent能够管理复杂的工具执行流程，同时让LLM更好地理解和追踪工具调用状态。 