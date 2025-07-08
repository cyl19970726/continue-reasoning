# 并行工具执行 (Parallel Tool Execution)

本文档介绍如何在 Agent 中使用并行工具执行功能，该功能利用 TaskQueue 和 ToolExecutor 实现工具调用的并行处理。

## 概述

在 LLM 生成工具调用后，传统的串行执行方式会按顺序逐个执行工具，这在处理多个独立工具调用时效率较低。并行工具执行功能允许同时执行多个工具调用，显著提升执行效率。

## 架构设计

```
LLM Stream → onToolCallDone → ToolExecutor → TaskQueue → 并行执行工具
```

### 核心组件

1. **ToolExecutor**: 工具执行管理器，负责调度和执行工具调用
2. **TaskQueue**: 任务队列，提供并发控制和任务调度
3. **LLMCallbacks**: 扩展的回调接口，支持工具执行生命周期事件

## 使用方法

### 1. 启用并行工具执行

在创建 Agent 时配置相关选项：

```typescript
const agent = new BaseAgent(
    'agent-id',
    'Agent Name',
    'Agent Description',
    maxSteps,
    promptProcessor,
    logLevel,
    {
        // 启用并行工具执行
        enableParallelToolExecution: true,
        
        // 工具执行优先级 (1-10，数字越大优先级越高)
        toolExecutionPriority: 7,
        
        // 任务队列并发数
        taskConcurency: 5,
        
        // 其他配置...
        model: OPENAI_MODELS.GPT_4O,
        enableStreaming: true,
        executionMode: 'auto'
    }
);
```

### 2. 配置选项说明

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enableParallelToolExecution` | boolean | false | 是否启用并行工具执行 |
| `toolExecutionPriority` | number | 5 | 工具执行任务的优先级 (1-10) |
| `taskConcurency` | number | 5 | 任务队列的最大并发数 |

### 3. 监控工具执行

通过 Agent 回调监控工具执行状态：

```typescript
agent.setCallBacks({
    // 工具调用开始 (来自 LLM stream)
    onToolCall: (toolCall) => {
        console.log(`🔧 LLM 工具调用: ${toolCall.name}`);
    },
    
    // 工具执行完成 (来自 ToolExecutor)
    onToolCallResult: (result) => {
        console.log(`✅ 工具执行完成: ${result.name} (${result.status})`);
        console.log(`⏱️  执行时间: ${result.executionTime}ms`);
    },
    
    onError: (error) => {
        console.error('❌ 执行错误:', error);
    }
});
```

## 性能对比

根据测试结果，并行执行相比串行执行有显著性能提升：

- **串行执行**: 5311ms (4个工具按顺序执行)
- **并行执行**: 2003ms (4个工具同时执行，最大并发数3)
- **性能提升**: 2.65x

## 工作流程

### 1. LLM 流式响应阶段
```
LLM Stream → onToolCallStart → onToolCallDelta → onToolCallDone (收集工具调用)
```

### 2. 批量工具执行阶段
```
Agent 收集所有工具调用 → ToolExecutor.executeToolCalls → TaskQueue 批量并行执行
```

### 3. 执行生命周期
```
1. LLM 流式响应过程中收集所有工具调用 (onToolCallDone)
2. 流式响应结束后，Agent 批量提交所有工具调用到 ToolExecutor
3. ToolExecutor 将工具调用转换为 TaskQueue 任务
4. TaskQueue 根据并发限制并行调度所有任务
5. 所有工具同时执行
6. 等待所有工具执行完成后返回结果
```

## 实现细节

### ToolExecutor 类

```typescript
export class ToolExecutor {
    // 执行单个工具调用
    async executeToolCall(
        toolCall: ToolCallParams,
        tool: AnyTool,
        agent: any,
        callbacks?: AgentCallbacks,
        priority?: number
    ): Promise<ToolExecutionResult>

    // 批量执行多个工具调用
    async executeToolCalls(
        toolCalls: ToolCallParams[],
        tools: AnyTool[],
        agent: any,
        callbacks?: AgentCallbacks,
        priority?: number
    ): Promise<ToolExecutionResult[]>
    
    // 配置并行执行选项
    setOptions(options: Partial<ToolExecutorOptions>): void
}
```

### 扩展的回调接口

```typescript
export interface LLMCallbacksWithToolExecution extends LLMCallbacks {
    // 工具执行生命周期回调
    onToolExecutionStart?: (toolCall: { id: string; name: string; priority?: number }) => void;
    onToolExecutionComplete?: (result: ToolExecutionResult) => void;
    onToolExecutionError?: (toolCall: { id: string; name: string }, error: Error) => void;
    
    // 批量工具执行回调
    onBatchToolExecutionStart?: (toolCalls: { id: string; name: string }[], parallel: boolean) => void;
    onBatchToolExecutionComplete?: (results: ToolExecutionResult[]) => void;
}
```

## 最佳实践

### 1. 并发控制
- 根据系统资源和工具特性设置合适的并发数
- CPU 密集型工具建议较低并发数
- I/O 密集型工具可以使用较高并发数

### 2. 优先级管理
- 重要工具设置更高优先级
- 使用优先级避免资源竞争

### 3. 错误处理
- 单个工具失败不影响其他工具执行
- 通过回调监控执行状态
- 实现适当的重试机制

### 4. 性能优化
- 监控工具执行时间
- 分析并发瓶颈
- 动态调整并发配置

## 注意事项

1. **工具依赖**: 确保并行执行的工具之间没有依赖关系
2. **资源限制**: 考虑系统资源限制，避免过度并发
3. **状态一致性**: 确保并行执行不会产生状态竞争
4. **错误隔离**: 单个工具失败不应影响其他工具

## 示例代码

完整示例请参考 `test-parallel-tools.ts` 文件，其中包含：
- 并行 vs 串行性能对比测试
- Agent 集成测试
- 错误处理示例
- 监控和回调示例