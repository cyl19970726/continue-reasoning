# HHH-AGI 思考系统

一个基于文本解析的 LLM 思考过程捕捉和管理系统，设计简洁实用，避免过度工程化。

## 🎯 核心特性

- **ThinkingEngine (原 LLMWrapper)**：包装 `llm.call`，自动解析思考和响应
- **ReasonManager**：管理 `<thinking>` 部分，支持扩展的计划解析
- **ChatManager**：管理 `<response>` 部分，处理对话和用户输入
- **ExecutionManager**：收集执行历史，在下轮渲染
- **ConversationManager**：统一管理完整的对话流程

## 🚀 快速开始

### 基础用法

```typescript
import { createThinkingSystem, LLM } from './core/thinking';

// 1. 实现 LLM 接口
class YourLLM implements LLM {
  async call(prompt: string): Promise<{ text: string; toolCalls: ToolCall[] }> {
    // 调用你的 LLM API
    return await yourLLMAPI.call(prompt);
  }
}

// 2. 创建思考系统
const llm = new YourLLM();
const thinkingSystem = createThinkingSystem(llm, {
  maxConversationHistory: 10,
  maxExecutionHistory: 5
});

// 3. 处理用户输入
const result = await thinkingSystem.processUserInput(
  "请帮我创建一个 Python 脚本",
  "session-001"
);

// 4. 执行工具调用
const toolResults = [];
for (const toolCall of result.toolCalls) {
  const toolResult = await executeToolCall(toolCall);
  toolResults.push(toolResult);
}

// 5. 处理工具结果
await thinkingSystem.processToolResults(result.stepNumber, toolResults);
```

### 与现有 Context 系统集成

```typescript
import { CodingContext } from '../contexts/coding';
import { PlanContext } from '../contexts/plan';

const thinkingSystem = createThinkingSystem(llm, {
  existingContexts: [
    CodingContext,
    PlanContext
  ]
});
```

## 📋 思考协议

系统使用结构化的思考协议，LLM 需要按以下格式输出：

```xml
<thinking>
<analysis>
- Current task: [描述要完成的任务]
- Available context: [列出相关的上下文信息]
- Constraints: [注明限制条件]
- Available tools: [可用工具列表]
- Environment state: [当前环境状态]
</analysis>

<plan>
- Step 1: [第一步行动]
- Step 2: [第二步行动]
- Step 3: [继续...]
- Validation: [如何验证成功]
- Contingency: [出现问题时的处理]
</plan>

<reasoning>
- Why this approach: [选择这种方法的理由]
- Alternatives considered: [考虑过的其他选项]
- Risk assessment: [潜在问题和处理方法]
- Expected outcome: [预期结果]
</reasoning>

<next_action>
下一步需要完成的任务和可能用到的工具类型：
- 主要任务: [下一步要完成的具体任务]
- 可能用到的工具类型: [工具类别，如文件编辑、命令执行等]
- 执行策略: [执行任务的基本策略]
- 验证方法: [如何验证任务完成的正确性]
注意：这里只需要思考策略和工具类型，具体的工具调用将由系统自动处理
</next_action>
</thinking>

<response>
<message>
[向用户说明你正在做什么或计划做什么]
</message>
</response>
```

## 🔧 核心组件

### ThinkingEngine

包装 LLM 调用，自动解析思考和响应内容：

```typescript
const thinkingEngine = new ThinkingEngine(llm);
const response = await thinkingEngine.call(prompt);

// 自动解析的结果
console.log(response.thinking);  // ParsedThinking
console.log(response.response);  // ParsedResponse
console.log(response.toolCalls); // ToolCall[]
```

### ExecutionManager

管理执行历史和状态跟踪：

```typescript
const executionManager = new ExecutionManager();

// 添加执行步骤
executionManager.addStep(thinking, response, toolCalls);

// 添加工具结果
executionManager.addToolResults(stepNumber, results);

// 构建历史 prompt
const historyPrompt = executionManager.buildExecutionHistory();
```

### ConversationManager

统一管理完整的对话流程：

```typescript
const conversationManager = new ConversationManager(llm, options);

// 处理用户输入
const result = await conversationManager.processUserInput(userInput, sessionId);

// 处理工具结果
await conversationManager.processToolResults(stepNumber, results);

// 获取统计信息
const stats = conversationManager.getExecutionStats();
```

## 📊 执行流程

1. **用户输入** → ConversationManager.processUserInput()
2. **构建 Prompt** → 基础 Context + 对话历史 + 执行历史 + 思考协议
3. **LLM 调用** → ThinkingEngine.call()
4. **解析响应** → ReasonManager + ChatManager
5. **执行工具** → 客户端处理 toolCalls
6. **记录结果** → ExecutionManager.addToolResults()
7. **继续对话** → 重复流程

## 🎨 Context 适配

系统可以适配现有的 Context 系统：

```typescript
// 自定义 Context 适配器
class CustomContextAdapter implements ContextAdapter {
  adaptContext(existingContext: any): Context {
    return {
      id: 'custom-context',
      name: 'Custom Context',
      description: 'Custom functionality',
      components: {
        workflow: '...',
        status: '...',
        guideline: '...',
        examples: '...'
      },
      priority: 85
    };
  }
}

// 添加自定义适配器
const contextManager = new ContextManager();
contextManager.addAdapter('custom-context', new CustomContextAdapter());
```

## 📈 质量评估

系统内置思考质量评估：

```typescript
const quality = thinkingEngine.assessThinkingQuality(thinking);
console.log(quality.overallScore); // 0-100 分数

if (quality.overallScore < 70) {
  const suggestions = thinkingEngine.generateImprovementSuggestions(thinking);
  console.log('改进建议:', suggestions);
}
```

## 💾 会话管理

支持会话的导出和导入：

```typescript
// 导出会话
const sessionData = conversationManager.exportSession();

// 导入会话
conversationManager.importSession(sessionData);

// 重置会话
conversationManager.reset();
```

## 🔍 调试和监控

系统提供丰富的调试信息：

```typescript
// 执行统计
const stats = conversationManager.getExecutionStats();
console.log('总步骤:', stats.execution.totalSteps);
console.log('已完成:', stats.execution.completedSteps);

// 对话摘要
const summary = conversationManager.getConversationSummary();
console.log(summary);

// 思考质量警告会自动输出到控制台
```

## 🎯 与原系统的区别

1. **简化架构**：避免过度设计，专注核心功能
2. **职责分离**：ReasonManager 管理思考，ChatManager 管理响应
3. **工具调用分离**：继续使用 `llm.call()` 返回的 `tool_calls`
4. **Context 重构**：统一的 workflow、status、guideline、examples 结构
5. **执行管理**：简单的步骤收集和历史渲染

## 📝 示例

完整的使用示例请参考 `src/examples/thinking-system-example.ts`。

## 🚧 扩展性

系统设计为高度可扩展：

- **ReasonManager**：支持未来的详细计划格式解析
- **ChatManager**：可扩展更多响应类型
- **ContextManager**：支持自定义 Context 适配器
- **ThinkingEngine**：可扩展思考质量评估算法

这个思考系统为 HHH-AGI 提供了一个实用且可维护的思考过程管理解决方案。 