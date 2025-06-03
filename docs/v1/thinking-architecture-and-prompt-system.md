# HHH-AGI v1: 思考架构与Prompt构建系统

## 概述

本文档描述了HHH-AGI v1的核心架构：**思考系统**与**Prompt构建系统**的设计理念、技术实现和使用方法。这两个系统协同工作，实现了Agent的智能推理和高效执行。

## 1. 整体架构理念

### 1.1 设计哲学

**连续智能推理** (Continuous Intelligent Reasoning)
- Agent通过步骤式连续推理解决复杂问题
- 每一步都建立在完整历史基础上
- Thinking和Action同时生成，而非串行

**上下文驱动执行** (Context-Driven Execution)  
- 所有决策基于完整的上下文信息
- 动态组装最相关的上下文
- 避免信息碎片化和重复获取

### 1.2 核心原则

1. **历史连续性** - 保持完整的推理历史
2. **同时生成** - Thinking和ToolCalls同步产生
3. **上下文优化** - 智能选择和组织上下文信息
4. **迭代改进** - 每步推理都提升整体理解

## 2. 思考架构 (Thinking Architecture)

### 2.1 真实执行流程

```
Step 1: User Input + Context → LLM → (Thinking₁ + ToolCalls₁) *simultaneously*
Step 2: Context + Thinking₁ + Results₁ → LLM → (Thinking₂ + ToolCalls₂) *simultaneously*  
Step 3: Context + Thinking₁₂ + Results₁₂ → LLM → (Thinking₃ + ToolCalls₃) *simultaneously*
Step N: Complete History → LLM → (Thinking_N + ToolCalls_N) *simultaneously*
```

**关键理解**：
- Thinking和ToolCalls是通过LLM的function calling能力**同时生成**的
- 每一步都可以访问**所有历史thinking**和**执行结果**
- 不是"Think → Wait → Call Tools"，而是"Think + Call Tools → Execute → Next Step"

### 2.2 核心组件

#### ThinkingOrchestrator
主要的思考协调器，负责管理整个推理过程。

```typescript
class ThinkingOrchestrator {
  // 核心方法
  processStep(stepInput, sessionId, tools): ProcessResult
  processUserInput(userInput, sessionId, tools): ProcessResult  
  continueReasoning(sessionId, tools): ProcessResult
  
  // 上下文管理
  buildPrompt(userInput, sessionId): string
  
  // 历史管理
  addConversationHistory(message)
  getExecutionStats()
}
```

#### ExecutionTracker
跟踪和管理执行历史，确保每一步都能访问完整的推理链。

```typescript
interface ExecutionStep {
  thinking: ParsedThinking     // 本步骤的思考内容
  response: ParsedResponse     // 本步骤的响应
  toolCalls: ToolCallParams[]  // 本步骤的工具调用
  toolResults: any[]          // 工具执行结果
  stepNumber: number          // 步骤编号
  timestamp: Date            // 执行时间
}
```

#### ThinkingEngine
负责与LLM交互，解析thinking内容和工具调用。

```typescript
interface LLMResponse {
  thinking: ParsedThinking | null    // 解析后的thinking内容
  response: ParsedResponse          // 解析后的响应内容
  toolCalls: ToolCallParams[]       // 工具调用参数
  rawText: string                   // 原始LLM输出
}
```

### 2.3 Thinking协议

每个思考步骤遵循结构化协议：

```xml
<thinking>
  <analysis>
    - 当前任务分析
    - 可用上下文评估
    - 执行历史回顾
    - 数据可用性检查
    - 约束条件识别
    - 可用工具清单
    - 环境状态评估
  </analysis>

  <plan>
    - 步骤1: 具体行动和工具选择
    - 步骤2: 基于步骤1结果的后续行动
    - 步骤3: 持续推进的逻辑
    - 验证策略: 如何验证每步成功
    - 错误处理: 异常情况应对
    - 效率考虑: 如何最小化冗余操作
  </plan>

  <reasoning>
    - 方法选择理由
    - 数据利用策略
    - 工具选择依据
    - 风险评估
    - 预期结果
    - 依赖关系管理
  </reasoning>

  <next_action>
    - 主要任务: 下一步具体任务
    - 工具选择: 具体工具名称
    - 操作类型: 每个工具的操作类型
    - 工具顺序: 执行先后顺序
    - 数据依赖: 需要的已有数据
    - 验证方法: 任务完成验证
    - 后续影响: 对整体任务的影响
  </next_action>
</thinking>

<response>
  <message>
    [用户友好的进度说明或结果报告]
  </message>
</response>
```

## 3. Prompt构建系统 (Prompt Construction System)

### 3.1 系统架构

#### ContextManager
统一的上下文管理器，负责协调所有上下文源。

```typescript
interface IContextManager {
  // 核心渲染方法
  renderPrompt(): Promise<string>
  renderStructuredPrompt(): Promise<PromptCtx>
  
  // 策略管理
  setPromptAssemblyStrategy(strategy: PromptAssemblyStrategy): void
  getPromptAssemblyStrategy(): PromptAssemblyStrategy
  
  // 上下文管理
  registerContext(context: IRAGEnabledContext): void
  findContextById(id: string): IRAGEnabledContext | undefined
  contextList(): IRAGEnabledContext[]
}
```

#### PromptCtx结构
统一的prompt输出格式：

```typescript
interface PromptCtx {
  workflow: string   // 工作流程说明
  status: string     // 当前状态信息  
  guideline: string  // 指导原则和规则
  examples: string   // 使用示例和模板
}
```

### 3.2 Prompt拼接策略

#### Grouped Strategy (推荐)
按组件类型分组，提供清晰的信息结构：

```
# 🔄 WORKFLOWS
## context-1
工作流程内容...
## context-2  
工作流程内容...

# 📊 STATUS
## context-1
状态信息...
## context-2
状态信息...

# 📋 GUIDELINES
## context-1
指导原则...
## context-2
指导原则...

# 💡 EXAMPLES
## context-1
使用示例...
## context-2
使用示例...
```

#### Linear Strategy
按上下文顺序线性排列，适合简单场景：

```
# Context 1
workflow + status + guidelines + examples

# Context 2  
workflow + status + guidelines + examples
```

#### Minimal Strategy
仅包含核心信息，用于token优化：

```
# Essential Information
核心工作流程 + 关键状态 + 必要指导原则
```

### 3.3 完整Prompt结构

ThinkingOrchestrator构建的完整prompt包含以下部分：

```
1. 🤖 SYSTEM PROMPT
   - AI Agent角色定义
   - 架构理解说明
   - 执行哲学阐述

2. 📝 CONTEXT SECTION  
   - 使用ContextManager渲染
   - 应用选定的拼接策略
   - 包含所有活跃上下文

3. 💬 CONVERSATION HISTORY
   - 用户/助手对话历史
   - 限制最近N条消息
   - 保持对话连续性

4. 📋 EXECUTION HISTORY
   - 历史thinking内容
   - 工具调用和结果
   - 步骤间的连续性

5. 🧠 THINKING PROTOCOL
   - 结构化思考模板
   - 分析→计划→推理→行动
   - 响应指导原则

6. 📥 CURRENT STEP INPUT
   - 当前步骤的输入
   - 用户请求或继续推理指令
```

## 4. 系统集成工作流

### 4.1 Agent执行循环

```typescript
async executeStepsLoop(maxSteps: number) {
  while (!shouldStop && currentStep < maxSteps) {
    if (enableThinking && thinkingSystem) {
      // 思考系统处理
      await processStepWithThinking()
    } else {
      // 传统方式处理
      await processStep()
    }
    currentStep++
  }
}

async processStepWithThinking() {
  const stepInput = buildStepInput()
  const sessionId = `agent-session-${this.id}`
  const toolDefinitions = getActiveTools().map(tool => tool.toCallParams())

  // 选择合适的处理方法
  const result = (currentStep === 0 && stepInput.includes('user input'))
    ? await thinkingSystem.processUserInput(stepInput, sessionId, toolDefinitions)
    : await thinkingSystem.continueReasoning(sessionId, toolDefinitions)

  // 执行工具调用
  if (result.toolCalls.length > 0) {
    const toolResults = await executeThinkingToolCalls(result.toolCalls)
    await thinkingSystem.processToolResults(result.stepNumber, toolResults)
  }
}
```

### 4.2 上下文生命周期

```
1. Context Registration
   └── registerContext() for each IContext
   
2. Prompt Assembly Strategy Selection  
   └── setPromptAssemblyStrategy()
   
3. Step Execution
   ├── buildPrompt() 
   │   ├── renderStructuredPrompt()
   │   ├── buildConversationHistory()
   │   ├── buildExecutionHistory()
   │   └── getThinkingProtocolTemplate()
   ├── thinkingEngine.call()
   └── executeTools()

4. History Update
   ├── addConversationHistory()
   ├── executionTracker.addStep()
   └── contextManager.updateState()
```

## 5. 配置与优化

### 5.1 ThinkingSystem配置

```typescript
interface ThinkingOrchestratorOptions {
  contextManager: IContextManager                // 上下文管理器
  promptAssemblyStrategy?: PromptAssemblyStrategy // 拼接策略
  maxConversationHistory?: number                 // 对话历史限制
  maxExecutionHistory?: number                    // 执行历史限制
}

// 推荐配置
const thinkingSystem = createThinkingSystem(llm, {
  contextManager: contextManager,
  promptAssemblyStrategy: 'grouped',  // 使用分组策略
  maxConversationHistory: 10,         // 保持最近10条对话
  maxExecutionHistory: 5              // 保持最近5步执行历史
})
```

### 5.2 Prompt优化策略

#### Token使用估算
- System Prompt: 400-600 tokens
- Context Section: 1000-3000 tokens (取决于活跃上下文数量)
- Conversation History: 500-1500 tokens
- Execution History: 800-2000 tokens (取决于thinking复杂度)
- Thinking Protocol: 800 tokens
- Current Step Input: 50-500 tokens

#### 优化建议
1. **选择合适的拼接策略**
   - 复杂任务: `grouped` - 清晰结构
   - 简单任务: `linear` - 紧凑格式
   - Token受限: `minimal` - 精简内容

2. **动态历史管理**
   - 根据任务复杂度调整历史长度
   - 重要步骤可以增加权重保留
   - 定期清理冗余历史

3. **上下文优先级**
   - 核心上下文始终包含
   - 辅助上下文按需包含
   - 实时评估上下文相关性

## 6. 使用指南

### 6.1 启用思考系统

```typescript
// 在Agent配置中启用
const agentOptions: AgentOptions = {
  enableThinkingSystem: true,
  thinkingOptions: {
    maxConversationHistory: 10,
    maxExecutionHistory: 5
  }
}

// 或运行时启用
agent.enableThinkingSystem({
  maxConversationHistory: 15,
  maxExecutionHistory: 8
})
```

### 6.2 配置Prompt策略

```typescript
// 设置拼接策略
contextManager.setPromptAssemblyStrategy('grouped')

// 或通过ThinkingOrchestrator
thinkingSystem.setPromptAssemblyStrategy('minimal')
```

### 6.3 处理用户输入

```typescript
// 直接处理用户输入
await agent.processUserInput("帮我创建一个web应用", sessionId)

// 或通过思考系统
const result = await thinkingSystem.processUserInput(
  "帮我创建一个web应用",
  sessionId,
  toolDefinitions
)
```

### 6.4 监控和调试

```typescript
// 获取思考统计
const stats = agent.getThinkingStats()
console.log('Execution stats:', stats.execution)
console.log('Conversation stats:', stats.conversation)

// 导出会话数据
const sessionData = agent.exportThinkingSession()

// 获取对话摘要
const summary = thinkingSystem.getConversationSummary()
```

## 7. 最佳实践

### 7.1 上下文设计
- **职责分离**: 每个Context专注单一职责
- **状态管理**: 明确状态更新和查询接口
- **工具集成**: 合理组织工具集，避免功能重叠

### 7.2 Thinking优化
- **历史利用**: 充分引用previous thinking避免重复分析
- **渐进式规划**: 每步计划基于前面的执行结果
- **错误恢复**: 在thinking中包含错误处理策略

### 7.3 性能考虑
- **Token管理**: 定期评估和优化prompt大小
- **并行执行**: 合理使用工具的async特性
- **缓存策略**: 避免重复获取相同信息

## 8. 扩展和定制

### 8.1 自定义Context
```typescript
class CustomContext implements IRAGEnabledContext {
  renderWorkflow(): Promise<string> { /* 实现 */ }
  renderStatus(): Promise<string> { /* 实现 */ }
  renderGuideline(): Promise<string> { /* 实现 */ }  
  renderExamples(): Promise<string> { /* 实现 */ }
  toolSet(): ToolSet | ToolSet[] { /* 实现 */ }
}
```

### 8.2 自定义拼接策略
```typescript
// 在ContextManager中实现新策略
if (strategy === 'custom') {
  return await this.renderCustomPrompt()
}
```

### 8.3 Thinking协议扩展
可以在ThinkingProtocolTemplate中添加新的思考维度，如：
- `<constraints>` - 约束条件分析
- `<alternatives>` - 替代方案评估  
- `<metrics>` - 成功指标定义

## 9. 故障排除

### 9.1 常见问题
- **Token超限**: 减少历史长度或使用minimal策略
- **思考质量低**: 检查上下文完整性和工具可用性
- **执行循环**: 确保每步都有明确的进展指标

### 9.2 调试技巧
- 使用`logger.debug`跟踪prompt构建过程
- 检查`result.rawText`了解LLM原始输出
- 监控`executionTracker`的步骤历史

## 10. 总结

HHH-AGI v1的思考架构与Prompt构建系统实现了：

✅ **智能连续推理** - 基于完整历史的步骤式思考
✅ **高效上下文管理** - 动态组装最相关信息  
✅ **灵活策略配置** - 适应不同场景需求
✅ **完整历史追踪** - 支持复杂任务的长期规划
✅ **性能优化** - 平衡功能性和token效率

这个架构为构建真正智能的AI Agent提供了坚实基础，能够处理复杂的多步骤任务，同时保持高效的执行性能。 