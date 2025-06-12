# Agent Events Flow Documentation

## 📋 当前事件流程分析

### 🔄 Agent 生命周期事件

#### 1. Agent 注册阶段
```typescript
// 在 InteractionHub.registerAgent() 中触发
{
    type: 'agent_registered',
    source: 'interaction_hub',
    sessionId: 'system',
    payload: {
        agentId: string,
        agentName: string,
        timestamp: number
    }
}
```

#### 2. 系统启动阶段
```typescript
// 在 InteractionHub.start() 中触发
{
    type: 'system_started',
    source: 'interaction_hub',
    sessionId: 'system',
    payload: {
        timestamp: number,
        registeredAgents: string[],
        registeredLayers: string[]
    }
}
```

### 🚀 Agent 执行流程事件

#### 3. 状态变更事件
```typescript
// 在 BaseAgent.changeState() 中触发
{
    type: 'agent_state_change',
    source: 'agent',
    sessionId: 'agent-session',
    payload: {
        fromState: AgentState,
        toState: AgentState,
        reason?: string,
        currentStep: number
    }
}
```

**触发场景:**
- `startWithUserInput()` → `changeState('running')`
- 执行完成 → `changeState('idle')`
- 发生错误 → `changeState('error')`
- `setExecutionMode()` → `changeState('idle')` (特殊情况)

#### 4. 步骤执行事件
```typescript
// 在 BaseAgent.executeStepsLoop() 中触发
{
    type: 'agent_step',
    source: 'agent',
    sessionId: 'agent-session',
    payload: {
        stepNumber: number,
        action: 'start' | 'complete' | 'error',
        error?: string
    }
}
```

**触发场景:**
- 步骤开始: `action: 'start'`
- 步骤完成: `action: 'complete'`
- 步骤错误: `action: 'error'`

#### 5. 思考和回复事件
```typescript
// 在 BaseAgent.processStepWithPromptProcessor() 中触发

// 思考事件
{
    type: 'agent_thinking',
    source: 'agent',
    sessionId: 'agent-session',
    payload: {
        stepNumber: number,
        thinking: {
            analysis: string,
            plan: string,
            reasoning: string,
            nextAction: string
        },
        toolCalls: ToolCallParams[],
        rawThinking: string
    }
}

// 回复事件
{
    type: 'agent_reply',
    source: 'agent',
    sessionId: 'agent-session',
    payload: {
        content: string,
        replyType: 'text',
        metadata: {
            reasoning?: string,
            confidence: number
        }
    }
}
```

### 🛠️ 工具和任务事件

#### 6. 计划管理事件 (Plan Context)
```typescript
// 计划创建
{
    type: 'plan_created',
    source: 'agent',
    payload: {
        planId: string,
        title: string,
        description: string,
        totalSteps: number,
        steps: PlanStep[]
    }
}

// 计划进度更新
{
    type: 'plan_progress_update',
    source: 'agent',
    payload: {
        planId: string,
        currentStepIndex: number,
        totalSteps: number,
        completedSteps: number,
        progress: number,
        currentStepTitle: string
    }
}

// 步骤完成
{
    type: 'plan_step_completed',
    source: 'agent',
    payload: {
        planId: string,
        stepId: number,
        stepIndex: number,
        stepTitle: string,
        completedAt: string,
        nextStepId?: number,
        nextStepTitle?: string
    }
}
```

#### 7. 工具执行事件 (示例中提到但代码中未找到)
```typescript
{
    type: 'tool_execution_result',
    source: 'agent',
    payload: {
        toolName: string,
        success: boolean,
        result?: any,
        error?: string,
        executionTime: number
    }
}
```

#### 8. 任务队列事件 (定义了但未在代码中找到发布点)
```typescript
{
    type: 'task_queue',
    source: 'agent',
    payload: {
        action: 'add' | 'start' | 'complete' | 'error',
        taskId: string,
        taskType: 'processStep' | 'toolCall' | 'custom',
        priority?: number,
        error?: string
    }
}
```

### 📨 交互事件

#### 9. 用户消息事件 (被订阅但未发布)
```typescript
{
    type: 'user_message',
    source: 'user',
    payload: {
        content: string,
        messageType: string,
        context?: any,
        conversationHistory?: ConversationMessage[]
    }
}
```

#### 10. 输入响应事件 (被订阅但未发布)
```typescript
{
    type: 'input_response',
    source: 'user',
    payload: {
        requestId: string,
        value: string
    }
}
```

## ✅ **重构后的清晰事件流程**

### 🏗️ **AgentEventManager 架构**

我们创建了统一的 `AgentEventManager` 来管理所有 Agent 事件：

```typescript
class AgentEventManager {
    // 生命周期事件
    publishStateChange(fromState, toState, reason?, currentStep?)
    publishAgentStarted(userInput, maxSteps) 
    publishAgentStopped(reason, finalStep)
    
    // 步骤执行事件
    publishStepStarted(stepNumber, prompt?)
    publishStepCompleted(stepNumber, toolCalls?)
    publishStepError(stepNumber, error)
    
    // 思考和回复事件
    publishThinking(stepNumber, thinking, toolCalls?, rawThinking?)
    publishReply(content, replyType, metadata?)
    
    // 工具执行事件
    publishToolExecutionStarted(toolName, callId, params, stepNumber)
    publishToolExecutionResult(toolName, callId, success, result?, error?, executionTime?, stepNumber?)
    
    // 任务队列事件
    publishTaskQueue(action, taskId, taskType, priority?, error?)
    
    // 执行模式事件
    publishExecutionModeChange(fromMode, toMode, reason?)
    
    // 通用方法
    publishCustomEvent(eventType, payload)
    publishBatch(events)
}
```

### 🔄 **完整的 Agent 执行流程事件序列**

#### **Phase 1: 启动阶段**
1. `agent_started` - Agent 开始执行用户输入
2. `agent_state_change` - 状态从 `idle` → `running`

#### **Phase 2: 步骤执行阶段 (循环)**
对每个步骤，按顺序触发：

3. `agent_step` (action: 'start') - 步骤开始
4. `agent_thinking` - Agent 思考过程
5. `tool_execution_started` - 工具开始执行 (如有工具调用)
6. `tool_execution_result` - 工具执行结果 (对每个工具)
7. `agent_reply` - Agent 回复 (如有最终答案)
8. `agent_step` (action: 'complete') - 步骤完成

如果出错：
- `tool_execution_result` (success: false)
- `agent_step` (action: 'error')

#### **Phase 3: 结束阶段**
9. `agent_stopped` - Agent 执行结束
10. `agent_state_change` - 状态从 `running` → `idle`

### 🎯 **事件命名规范**

**✅ 统一后的命名规范:**
- **Agent 生命周期**: `agent_*` (state_change, started, stopped)
- **Agent 步骤**: `agent_step` (with action field)
- **Agent 思考**: `agent_thinking`, `agent_reply`
- **工具执行**: `tool_execution_*` (started, result)
- **任务队列**: `task_queue`
- **执行模式**: `execution_mode_changed`
- **计划管理**: `plan_*` (created, progress_update, step_completed)

### 📊 **会话ID管理**

**✅ 统一的会话ID策略:**
- 默认格式: `agent-session-{agentId}`
- 支持动态更新: `eventManager.updateSessionId(sessionId)`
- 所有事件包含 `agentId` 在 payload 中便于过滤

### 🔧 **改进成果总结**

1. **✅ 统一的事件管理**: 所有事件通过 `AgentEventManager` 发布
2. **✅ 标准化的事件格式**: 统一的 payload 结构，包含 agentId 和 timestamp
3. **✅ 完整的工具执行追踪**: 新增 `tool_execution_started` 和详细的 `tool_execution_result`
4. **✅ 清晰的事件序列**: 从启动到结束的完整事件流程
5. **✅ 灵活的会话管理**: 支持多会话和动态会话切换
6. **✅ 错误处理改进**: 每个事件发布都有 try-catch 保护
7. **✅ 批量事件支持**: 支持批量发布多个相关事件 