# Function Call vs ReAct vs Function Call + Think Tool

## 概述

在构建智能体系统时，我们有多种方法来实现工具调用和推理能力。本文对比三种主要方法：
1. **ReAct (Reasoning + Acting)**: 基于文本的思考-行动模式
2. **Pure Function Call**: 原生函数调用模式  
3. **Function Call + Think Tool**: 函数调用 + 显式思考工具

## 方法介绍

### 1. ReAct (Reasoning + Acting)

ReAct 是一种将推理和行动结合的范式，通过文本格式的思考过程指导智能体的行动。

**核心原理：**
- 使用 `<think>` 标签进行推理
- 使用 `<tool>` 标签执行工具调用
- 文本驱动的工具调用解析
- 支持多轮思考-行动循环

**System Prompt 结构：**
```
你是一个调用工具的 Agent，以下是你可以调用的工具列表：

- get_weather: 获取指定经纬度的当前天气温度（摄氏度）
  参数格式: {JSON Schema}
- calculator: 计算数学表达式
  参数格式: {JSON Schema}

在你进行任何工具调用之前请先进行思考。
<think> [你的思考内容] </think> 

你可以按照以下格式进行工具调用: 
<tool name="[tool_name]"> [tool arguments using the schema as JSON] </tool>

同时需要注意我们的在一个回复里可以有多个<think>和多个<tool>。

当你有足够信息回答用户问题时，请使用：
<final_answer> [你的最终答案] </final_answer>
```

**执行流程：**
1. LLM 生成包含 `<think>` 和 `<tool>` 标签的响应
2. 使用正则表达式或 XML 解析器提取思考内容和工具调用
3. 执行工具并获取结果
4. 将结果反馈给 LLM 继续推理
5. 重复直到获得最终答案

### 2. Pure Function Call (原生函数调用)

基于 LLM 原生支持的函数调用机制，通过结构化的工具定义实现精确的工具调用，无需额外的推理提示。

**核心原理：**
- 利用 LLM 的内置函数调用能力
- 结构化的工具定义和参数验证
- 直接的函数调用解析
- 简洁的 system prompt，专注于工具调用

**System Prompt 结构：**
```
你是一个智能体，能够调用多种工具来完成任务。

可用工具：
- get_weather: 获取指定经纬度的当前天气温度（摄氏度）
- calculator: 计算数学表达式

请根据用户问题决定是否需要调用工具来获取信息。如果不需要调用工具就能回答，直接回答即可。

如果是最后一次回答用户请使用以下格式：
<final_answer> 你的回答 </final_answer>
```

**执行流程：**
1. 将工具定义作为 `tools` 参数传递给 LLM
2. LLM 返回 `toolCalls` 数组
3. 直接执行工具调用
4. 将结果反馈给 LLM
5. 重复直到任务完成

### 3. Function Call + Think Tool

在原生函数调用基础上，添加一个专门的思考工具来增强推理能力。

**核心原理：**
- 保持函数调用的精确性
- 通过 `think` 工具显式记录推理过程
- 结合两种方法的优势

**Think Tool 定义：**
```typescript
class ThinkTool implements ITool {
  name = 'think';
  description = '用于记录思考过程和推理步骤，帮助分析问题和制定执行计划';
  params = z.object({ 
    thought: z.string().describe('当前的思考内容，包括问题分析、执行计划或推理过程')
  });

  async execute_func(params: { thought: string }) {
    return {
      thought: params.thought,
      timestamp: new Date().toISOString(),
      action: 'thinking_recorded'
    };
  }
}
```

## 代码实现对比

### ReAct 实现核心代码

```typescript
// 系统提示词构建
const toolsDescription = this.tools.map(tool => {
  const paramSchema = zodToJsonNostrict(tool.params);
  const paramStr = JSON.stringify(paramSchema, null, 2);
  return `- ${tool.name}: ${tool.description}\n  参数格式: ${paramStr}`;
}).join('\n');

const systemPrompt = `你是一个调用工具的 Agent，以下是你可以调用的工具列表：

${toolsDescription}

在你进行任何工具调用之前请先进行思考。
<think> [你的思考内容] </think> 

你可以按照以下格式进行工具调用: 
<tool name="[tool_name]"> [tool arguments using the schema as JSON] </tool>

当你有足够信息回答用户问题时，请使用：
<final_answer> [你的最终答案] </final_answer>`;

// 工具调用解析
const toolMatches = responseText.match(/<tool name="([^"]+)">([\s\S]*?)<\/tool>/g);
if (toolMatches && toolMatches.length > 0) {
  for (const toolMatch of toolMatches) {
    const nameMatch = toolMatch.match(/<tool name="([^"]+)">/);
    const contentMatch = toolMatch.match(/<tool name="[^"]+">([\s\S]*?)<\/tool>/);
    
    const toolName = nameMatch[1];
    const paramsStr = contentMatch[1].trim();
    const toolResult = await this.executeToolCall(toolName, paramsStr);
  }
}
```

### Function Call 实现核心代码

```typescript
// 系统提示词
const systemPrompt = `你是一个智能体，在每次调用工具之前都要写出你的思考过程。
格式如下：<think>我需要知道城市的天气，所以调用 get_weather("北京")</think>`;

// 工具调用
const response = await this.llm.call(conversation, this.tools.map(t => t.toCallDefinition()));

// 解析工具调用
if (response.toolCalls && response.toolCalls.length > 0) {
  for (const toolCall of response.toolCalls) {
    const tool = this.tools.find(t => t.name === toolCall.name);
    const result = await tool.execute_func(toolCall.parameters);
  }
}
```

### Function Call + Think Tool 实现

```typescript
// 在工具列表中添加 ThinkTool
const agent = new FunctionCallAgent(
  "Weather Agent", 
  "A weather agent that can get the weather of a city", 
  new OpenAIWrapper(OPENAI_MODELS.GPT_4O, false), 
  [createWeatherTool(), createCalculatorTool(), new ThinkTool()]
);
```

## 执行效果对比

### 测试场景：查询北京天气

#### ReAct 执行结果：
```
🔍 完整System Prompt: [显示清晰的工具格式]

=== ReAct 迭代 1 ===
思考过程: ['为了获得北京现在的天气温度，我需要获取北京的经纬度，然后调用get_weather工具。']
发现 1 个工具调用
工具 get_weather 执行结果: {
  latitude: 39.9042,
  longitude: 116.4074,
  temperature: 28.8,
  unit: '摄氏度',
  success: true
}

=== ReAct 迭代 2 ===
最终答案: 北京现在的天气温度是28.8摄氏度。
✅ 执行结果: 成功: true, 步骤数: 2
```

#### Pure Function Call 执行结果：
```
=== 迭代 1 ===
执行工具: get_weather { latitude: 39.9042, longitude: 116.4074 }
工具结果: { temperature: 28.5, unit: '摄氏度', success: true }

=== 迭代 2 ===
最终答案: The current temperature in Beijing is 28.5°C.
✅ 执行结果: 成功: true, 步骤数: 2
```

#### Function Call + Think Tool 执行结果：
```
=== 迭代 1 ===
执行工具: think {
  thought: "I need to know the weather in Beijing, so I will use the get_weather function with Beijing's coordinates (latitude: 39.9042, longitude: 116.4074)."
}

=== 迭代 2 ===
执行工具: get_weather { latitude: 39.9042, longitude: 116.4074 }
工具结果: { temperature: 28.8, unit: '摄氏度', success: true }

=== 迭代 3 ===
最终答案: The current temperature in Beijing is 28.8°C.
✅ 执行结果: 成功: true, 步骤数: 3
```

### 测试场景：对比北京和上海天气温差

#### ReAct 执行结果：
```
=== ReAct 迭代 1 ===
思考过程: ['为了完成这个任务，我需要先获取北京和上海的当前天气温度，然后计算两地的温差。']
发现 2 个工具调用 (但由于LLM响应格式问题，实际没有执行)
最终答案: 我将先通过工具获取北京和上海的温度，然后随后计算它们的温差。请稍等片刻，我马上为您提供答案。
✅ 执行结果: 成功: true, 步骤数: 1 (但未完成实际任务)
```

#### Pure Function Call 执行结果：
```
=== 迭代 1 ===
执行工具: get_weather [北京] → 温度: 28.5°C

=== 迭代 2 ===
执行工具: get_weather [上海] → 温度: 23.9°C

=== 迭代 3 ===
执行工具: calculator { expression: '28.5-23.9' } → 结果: 4.6

=== 迭代 4 ===
最终答案: 北京的温度是28.5摄氏度，上海的温度是23.9摄氏度，两地的温差是4.6摄氏度。
✅ 执行结果: 成功: true, 步骤数: 4
```

#### Function Call + Think Tool 执行结果：
```
=== 迭代 1 ===
执行工具: think [规划执行步骤]

=== 迭代 2 ===
执行工具: get_weather [北京] → 温度: 28.5°C

=== 迭代 3 ===
执行工具: get_weather [上海] → 温度: 23.9°C

=== 迭代 4 ===
执行工具: calculator { expression: '28.5 - 23.9' } → 结果: 4.6

=== 迭代 5 ===
最终答案: 北京和上海的温差是4.6摄氏度。
✅ 执行结果: 成功: true, 步骤数: 5
```

## 优缺点分析

### ReAct (Reasoning + Acting)

**优点：**
✅ **优秀的推理能力**：显式的思考过程，便于理解和调试  
✅ **高效执行**：能在单轮中进行多次工具调用  
✅ **灵活性强**：文本驱动，易于扩展和修改  
✅ **透明度高**：思考过程完全可见  

**缺点：**
❌ **解析复杂度**：需要复杂的文本解析逻辑  
❌ **格式依赖**：依赖 LLM 严格遵循格式，格式错误可能导致工具调用失败  
❌ **不稳定性**：复杂查询时可能出现格式不一致问题  

### Pure Function Call (原生函数调用)

**优点：**
✅ **精确性高**：利用 LLM 内置能力，调用准确  
✅ **实现简单**：代码相对简洁，system prompt 简洁明了  
✅ **性能优秀**：直接解析，无需复杂文本处理  
✅ **稳定可靠**：成功完成所有测试任务，步骤数合理  

**缺点：**
❌ **缺少推理过程**：无显式思考过程可见  
❌ **调试困难**：难以理解智能体的决策逻辑  
❌ **黑盒操作**：无法了解智能体的内部推理过程  

### Function Call + Think Tool

**优点：**
✅ **精确性高**：利用 LLM 内置函数调用能力，调用准确  
✅ **推理可见**：通过 think 工具记录思考过程  
✅ **结构化**：思考内容结构化存储  
✅ **稳定可靠**：成功完成复杂的多步骤任务  

**缺点：**
❌ **效率较低**：需要额外的思考步骤，总步骤数较多  
❌ **复杂度增加**：需要额外的思考工具管理  
❌ **思考开销**：每次任务都会产生思考步骤的额外开销  

## 性能对比总结

| 方法 | 简单任务 (北京天气) | 复杂任务 (温差计算) | 推理可见性 | 实现复杂度 |
|------|------------------|------------------|-----------|-----------|
| **ReAct** | ✅ 2步完成 | ❌ 格式解析失败 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Pure Function Call** | ✅ 2步完成 | ✅ 4步完成 | ⭐ | ⭐⭐⭐⭐⭐ |
| **Function Call + Think Tool** | ✅ 3步完成 | ✅ 5步完成 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

## 适用场景建议

### 推荐使用 ReAct 的场景：
- 需要快速原型开发和测试
- 简单到中等复杂度的推理任务
- 要求最高透明度和可解释性
- 研究和实验环境，能够容忍偶尔的格式解析问题

### 推荐使用 Pure Function Call 的场景：
- 生产环境中的稳定任务执行
- 对性能和可靠性要求高的场景
- 不需要推理过程可见性的应用
- 希望保持简洁实现的项目

### 推荐使用 Function Call + Think Tool 的场景：
- 需要同时保证稳定性和推理可见性
- 复杂业务逻辑，需要详细的决策日志
- 调试和分析智能体行为的场景
- 对推理过程有审计要求的应用

## 结论

从我们的实际测试结果来看：

1. **Pure Function Call 是性能之王**：在简单和复杂任务中都表现稳定（2-4步），实现简洁，适合生产环境
2. **ReAct 是调试利器**：提供最佳的推理可见性，但在复杂任务中可能遇到稳定性问题
3. **Function Call + Think Tool 是平衡选择**：在稳定性和推理可见性间取得很好的平衡，虽然步骤稍多但可控

**推荐策略：**
- **生产环境首选**：Pure Function Call，简洁高效稳定
- **开发调试时**：ReAct，快速理解智能体行为
- **需要审计日志**：Function Call + Think Tool，平衡性能和可追溯性

关键洞察：**移除 system prompt 中的 `<think>` 要求后，Pure Function Call 显著提升了性能和稳定性**，证明了简洁 prompt 设计的重要性。选择哪种方法最终取决于对性能、稳定性和可解释性的具体需求权衡。 