# LLM Models Streaming Architecture

这个文档详细说明了我们的 LLM 流式响应架构设计，包括统一的回调接口和各个 provider 的事件映射。

## 🏗️ 架构概述

我们的流式响应架构采用三层设计：

```
LLM Provider Layer → Agent Layer → CLI Client Layer
     ↓                 ↓               ↓
Raw Events    →  Unified Callbacks → UI Updates
```

## 📋 统一回调接口 (LLMCallbacks)

我们设计了一个统一的回调接口，同时支持流式和非流式调用：

```typescript
export interface LLMCallbacks {
    // 生命周期回调
    onStart?: () => void;
    onComplete?: () => void;
    onError?: (error: Error) => void;

    // 块级回调 (内容块的开始和结束)
    onChunkStart: (chunkIndex: number, chunkData?: any) => void;
    onChunkComplete: (chunkIndex: number, chunkData?: any) => void;
    
    // 内容回调
    onTextDone?: (text: string) => void;  // 用于 call 和 streamCall
    onTextDelta?: (delta: string) => void;  // 仅流式响应

    // 工具调用回调
    onToolCallStart?: (toolCall: { id: string; name: string }) => void;
    onToolCallDelta?: (toolCall: { id: string; delta: string }) => void;  // 仅流式响应
    onToolCallDone?: (toolCall: { id: string; name: string; arguments: any }) => void;  // 用于 call 和 streamCall
}
```

## 🔄 事件流设计

我们的事件流遵循以下层次结构：

```
stream_start (onStart)
├── chunk_start (onChunkStart) - 内容块开始
│   ├── text_delta* (onTextDelta) - 增量文本
│   ├── text_done (onTextDone) - 文本完成
│   ├── tool_call_start (onToolCallStart) - 工具调用开始
│   ├── tool_call_delta* (onToolCallDelta) - 增量工具参数
│   └── tool_call_done (onToolCallDone) - 工具调用完成
├── chunk_complete (onChunkComplete) - 内容块结束
└── stream_end (onComplete)
```

## 🔌 Provider 事件映射

### 1. Anthropic Events

#### 核心事件类型

- **content_block_start**: 内容块开始
  - 对应我们的 `onChunkStart`
  - 包含 `type` (text/tool_use) 和 `index`

- **content_block_delta**: 内容增量更新
  - `text_delta`: 文本增量 → `onTextDelta`
  - `input_json_delta`: 工具参数增量 → `onToolCallDelta`

- **content_block_stop**: 内容块结束
  - 对应我们的 `onChunkComplete`
  - 触发 `onTextDone` 或 `onToolCallDone`

#### 示例事件流

```json
// 1. 消息开始
{"type": "message_start"}  → onStart()

// 2. 文本块开始
{"type": "content_block_start", "content_block": {"type": "text", "index": 0}}
→ onChunkStart(0, {type: 'text'})

// 3. 文本增量
{"type": "content_block_delta", "delta": {"type": "text_delta", "text": "我来帮助你"}}
→ onTextDelta("我来帮助你")

// 4. 工具调用块开始
{"type": "content_block_start", "content_block": {"type": "tool_use", "id": "tool_123", "name": "get_weather"}}
→ onChunkStart(1, {type: 'tool_use', id: 'tool_123'})
→ onToolCallStart({id: 'tool_123', name: 'get_weather'})

// 5. 工具参数增量
{"type": "content_block_delta", "delta": {"type": "input_json_delta", "partial_json": "{\"location\""}}
→ onToolCallDelta({id: 'tool_123', delta: '{"location"'})

// 6. 工具调用结束
{"type": "content_block_stop"}
→ onToolCallDone({id: 'tool_123', name: 'get_weather', arguments: {location: 'Paris'}})
→ onChunkComplete(1, {type: 'tool_use', id: 'tool_123'})

// 7. 消息结束
{"type": "message_stop"} → onComplete()
```

### 2. OpenAI Events (Responses API)

#### 核心事件类型

- **response.output_item.added**: 输出项添加
  - 对应我们的 `onChunkStart`
  - 包含 `output_index` 和 `item.type`

- **response.output_text.delta**: 文本增量
  - 对应我们的 `onTextDelta`

- **response.output_text.done**: 文本完成
  - 对应我们的 `onTextDone`

- **response.function_call_arguments.delta**: 函数参数增量
  - 对应我们的 `onToolCallDelta`

- **response.function_call_arguments.done**: 函数调用完成
  - 对应我们的 `onToolCallDone`

#### 示例事件流

```json
// 1. 响应开始
{"type": "response.created"} → onStart()

// 2. 输出项添加
{
  "type": "response.output_item.added",
  "output_index": 0,
  "item": {"type": "function_call", "id": "fc_123", "call_id": "call_123", "name": "get_weather"}
}
→ onChunkStart(0, {type: 'tool_call', id: 'fc_123'})
→ onToolCallStart({id: 'fc_123', name: 'get_weather'})

// 3. 函数参数增量
{"type": "response.function_call_arguments.delta", "item_id": "fc_123", "delta": "{\""}
→ onToolCallDelta({id: 'fc_123', delta: '{"'})

{"type": "response.function_call_arguments.delta", "item_id": "fc_123", "delta": "location"}
→ onToolCallDelta({id: 'fc_123', delta: 'location'})

// 4. 函数调用完成
{
  "type": "response.function_call_arguments.done",
  "item_id": "fc_123",
  "arguments": "{\"location\":\"Paris, France\"}"
}
→ onToolCallDone({id: 'fc_123', name: 'get_weather', arguments: {location: 'Paris, France'}})

// 5. 输出项完成
{"type": "response.output_item.done", "output_index": 0}
→ onChunkComplete(0, {type: 'tool_call', id: 'fc_123'})

// 6. 响应完成
{"type": "response.done"} → onComplete()
```

### 3. OpenAI Chat Completions API

#### 事件类型

- **choice.delta.content**: 文本增量
  - 对应我们的 `onTextDelta`

- **choice.delta.function_call.name**: 函数名
  - 触发 `onToolCallStart`

- **choice.delta.function_call.arguments**: 函数参数增量
  - 对应我们的 `onToolCallDelta`

#### 示例事件流

```json
// 1. 流开始 → onStart()

// 2. 文本增量
{"choices": [{"delta": {"content": "我来帮助你"}}]}
→ onTextDelta("我来帮助你")

// 3. 函数调用开始
{"choices": [{"delta": {"function_call": {"name": "get_weather"}}}]}
→ onToolCallStart({id: 'generated_id', name: 'get_weather'})

// 4. 函数参数增量
{"choices": [{"delta": {"function_call": {"arguments": "{\"location\""}}}]}
→ onToolCallDelta({id: 'generated_id', delta: '{"location"'})

// 5. 流结束时
→ onTextDone(完整文本)
→ onToolCallDone({id: 'generated_id', name: 'get_weather', arguments: 解析后的参数})
→ onComplete()
```

## 🎯 实现要点

### 1. 非流式调用 (call)

```typescript
// 所有 provider 在非流式调用中都会：
callbacks?.onStart?.();
// 处理响应...
callbacks?.onChunkStart?.(index, chunkData);
callbacks?.onTextDone?.(text);  // 或 onToolCallDone
callbacks?.onChunkComplete?.(index, chunkData);
callbacks?.onComplete?.();
```

### 2. 流式调用 (streamCall)

```typescript
// 流式调用会实时触发 delta 回调：
callbacks?.onStart?.();
// 处理流...
callbacks?.onChunkStart?.(index, chunkData);
callbacks?.onTextDelta?.(delta);  // 实时文本片段
callbacks?.onToolCallDelta?.(delta);  // 实时参数片段
callbacks?.onTextDone?.(completeText);  // 完整文本
callbacks?.onToolCallDone?.(completeTool);  // 完整工具调用
callbacks?.onChunkComplete?.(index, chunkData);
callbacks?.onComplete?.();
```

### 3. 错误处理

```typescript
// 所有错误都通过统一的错误回调处理：
callbacks?.onError?.(error);
```

## 🔧 使用示例

### Agent 层使用

```typescript
const callbacks: LLMCallbacks = {
    onStart: () => console.log('LLM调用开始'),
    onChunkStart: (index, data) => console.log(`块 ${index} 开始: ${data?.type}`),
    onTextDelta: (delta) => process.stdout.write(delta),
    onTextDone: (text) => console.log(`\\n完整文本: ${text}`),
    onToolCallStart: (tool) => console.log(`工具调用开始: ${tool.name}`),
    onToolCallDelta: (tool) => console.log(`参数增量: ${tool.delta}`),
    onToolCallDone: (tool) => console.log(`工具调用完成: ${tool.name}`),
    onChunkComplete: (index, data) => console.log(`块 ${index} 完成`),
    onComplete: () => console.log('LLM调用完成'),
    onError: (error) => console.error('错误:', error)
};

// 流式调用
await llm.streamCall(messages, tools, callbacks);

// 非流式调用 (同样的回调接口)
await llm.call(messages, tools, callbacks);
```

### CLI 客户端使用

```typescript
const streamingCallbacks: LLMCallbacks = {
    onTextDelta: (delta) => {
        // 实时更新终端显示
        updateTerminalDisplay(delta);
    },
    onToolCallStart: (tool) => {
        // 显示工具调用指示器
        showToolCallIndicator(tool.name);
    },
    onToolCallDone: (tool) => {
        // 显示工具调用结果
        showToolCallResult(tool);
    }
};
```

## 📈 优势

1. **统一接口**: 一套回调接口适用于所有 LLM provider
2. **渐进增强**: 支持简单使用 (onTextDone) 和高级使用 (onTextDelta)
3. **错误边界**: 清晰的错误处理机制
4. **调试友好**: 包含完整的事件生命周期
5. **性能优化**: 最小化事件对象创建，直接使用参数传递

## 🚀 扩展性

要添加新的 LLM provider，只需要：

1. 实现 `ILLM` 接口
2. 将 provider 特定的事件映射到我们的统一回调
3. 确保正确的事件顺序和生命周期管理

这个设计使得我们可以轻松支持更多的 LLM provider，同时保持客户端代码的一致性。