# Agent Events 使用指南

## 🎯 概述

`AgentEventManager` 是一个统一的事件管理器，用于处理 Agent 生命周期中的所有事件发布。它确保事件的一致性、可追踪性和易维护性。基于最新的事件系统，支持丰富的事件类型和完整的生命周期管理。

## 🏗️ 基本使用

### 1. 初始化事件管理器

```typescript
import { AgentEventManager } from './events/agent-event-manager';
import { IEventBus } from './events/eventBus';

// 在 Agent 构造函数中
constructor(/* ... */, eventBus?: IEventBus) {
    // ...
    if (eventBus) {
        this.eventManager = new AgentEventManager(eventBus, this.id);
    }
}
```

### 2. 基本事件发布

```typescript
// 发布状态变更
await this.eventManager.publishStateChange('idle', 'running', 'User requested start');

// 发布步骤相关事件
await this.eventManager.publishStepStarted(0);
await this.eventManager.publishStepCompleted(0);
await this.eventManager.publishStepError(0, new Error('Step failed'));

// 发布完整的 Agent 步骤事件
const agentStep: AgentStep = {
    stepIndex: 0,
    status: 'completed',
    startTime: '2024-01-20T10:30:00.000Z',
    endTime: '2024-01-20T10:30:15.500Z',
    duration: 15500,
    extractorResult: {
        thinking: "分析用户请求...",
        finalAnswer: "任务完成"
    },
    toolCalls: [...],
    toolCallResults: [...],
    metadata: { agentId: this.id, sessionId: 'session-123' }
};
await this.eventManager.publishAgentStep(agentStep);

// 发布思考过程
await this.eventManager.publishThinking(
    stepNumber,
    {
        analysis: "分析用户请求...",
        plan: "制定执行计划...",
        reasoning: "推理过程...",
        nextAction: "下一步行动..."
    },
    toolCalls,
    rawResponseText
);

// 发布回复
await this.eventManager.publishReply(
    "这是最终答案",
    'final_answer',
    { confidence: 90, stepNumber: 2 }
);
```

## 📊 事件类型详解

### 🔄 核心生命周期事件

#### Agent 步骤事件 (agent_step)
```typescript
const stepEvent: AgentStepEvent = {
    type: 'agent_step',
    payload: {
        stepIndex: 0,
        status: 'completed',
        startTime: '2024-01-20T10:30:00.000Z',
        endTime: '2024-01-20T10:30:15.500Z',
        duration: 15500,
        extractorResult: {
            thinking: "思考内容",
            finalAnswer: "最终答案"
        },
        toolCalls: [...],
        toolCallResults: [...],
        metadata: { agentId: 'agent-id', sessionId: 'session-id' },
        // 额外的元数据
        agentId: 'agent-id',
        action: 'complete'
    }
};
```

#### Agent 步骤开始事件 (agent_step_start)
```typescript
await eventManager.publishStepStarted(stepNumber);
```

#### 状态变更事件 (agent_state_change)
```typescript
await eventManager.publishStateChange(
    'idle',      // fromState
    'running',   // toState
    'User requested start', // reason
    0           // currentStep (optional)
);
```

### 🛠️ 工具执行事件

#### 工具执行开始 (tool_execution_started)
```typescript
await eventManager.publishToolExecutionStarted(
    'file_editor',     // toolName
    'call-123',        // callId
    { path: 'file.js' }, // params
    0                  // stepNumber
);
```

#### 工具执行结果 (tool_execution_result)
```typescript
// 成功情况
await eventManager.publishToolExecutionResult(
    'file_editor',     // toolName
    'call-123',        // callId
    true,              // success
    { content: '...' }, // result
    undefined,         // error
    1500,              // executionTime
    0                  // stepNumber
);

// 失败情况
await eventManager.publishToolExecutionResult(
    'file_editor',
    'call-123',
    false,
    undefined,
    'File not found',
    500,
    0
);
```

### 🤔 思考和回复事件

#### Agent 思考过程 (agent_thinking)
```typescript
await eventManager.publishThinking(
    stepNumber,
    {
        analysis: "对问题的分析",
        plan: "执行计划",
        reasoning: "推理过程", 
        nextAction: "下一步行动",
        executionStatus: "continue" // 'continue' | 'complete'
    },
    toolCalls,
    rawThinking
);
```

#### Agent 回复 (agent_reply)
```typescript
await eventManager.publishReply(
    content,
    'text' | 'markdown' | 'structured', // replyType
    {
        reasoning: "推理依据",
        confidence: 85,
        suggestions: ["建议1", "建议2"]
    }
);
```

### 📋 计划执行事件

#### 计划创建 (plan_created)
```typescript
const planEvent: PlanCreatedEvent = {
    type: 'plan_created',
    payload: {
        planId: 'plan-123',
        title: '项目重构计划',
        description: '重构现有代码结构',
        totalSteps: 5,
        steps: [
            {
                id: 'step-1',
                title: '分析现有代码',
                description: '分析当前代码结构和问题',
                toolsToCall: ['code_analyzer']
            }
        ]
    }
};
```

#### 计划步骤开始 (plan_step_started)
```typescript
const stepStartedEvent: PlanStepStartedEvent = {
    type: 'plan_step_started',
    payload: {
        planId: 'plan-123',
        stepId: 'step-1',
        stepIndex: 0,
        stepTitle: '分析现有代码',
        stepDescription: '分析当前代码结构和问题',
        toolsToCall: ['code_analyzer']
    }
};
```

#### 计划进度更新 (plan_progress_update)
```typescript
const progressEvent: PlanProgressUpdateEvent = {
    type: 'plan_progress_update',
    payload: {
        planId: 'plan-123',
        currentStepIndex: 2,
        totalSteps: 5,
        completedSteps: 2,
        progress: 40, // 0-100
        currentStepTitle: '重构核心模块'
    }
};
```

### 📁 文件操作事件

#### 文件创建 (file_created)
```typescript
const fileCreatedEvent: FileCreatedEvent = {
    type: 'file_created',
    payload: {
        path: './src/new-component.tsx',
        size: 1024,
        diff: '+新增文件内容...'
    }
};
```

#### 文件修改 (file_modified)
```typescript
const fileModifiedEvent: FileModifiedEvent = {
    type: 'file_modified',
    payload: {
        path: './src/component.tsx',
        tool: 'edit_block',
        changesApplied: 3,
        diff: '@@ -10,7 +10,7 @@\n-old code\n+new code'
    }
};
```

#### 文件删除 (file_deleted)
```typescript
const fileDeletedEvent: FileDeletedEvent = {
    type: 'file_deleted',
    payload: {
        path: './src/old-component.tsx',
        isDirectory: false,
        filesDeleted: ['./src/old-component.tsx'],
        diff: '-删除的文件内容...'
    }
};
```

### ⚙️ 系统事件

#### 上下文更新 (context_update)
```typescript
const contextUpdateEvent: ContextUpdateEvent = {
    type: 'context_update',
    payload: {
        contextId: 'mcp-context',
        updateType: 'toolCall',
        data: { result: '工具调用结果' }
    }
};
```

#### 任务队列事件 (task_queue)
```typescript
await eventManager.publishTaskQueue(
    'start',           // action: 'add' | 'start' | 'complete' | 'error'
    'task-123',        // taskId
    'processStep',     // taskType: 'processStep' | 'toolCall' | 'custom'
    10,                // priority
    undefined          // error
);
```

## 🔧 高级功能

### 会话管理

```typescript
// 更新会话ID
eventManager.updateSessionId('new-session-id');

// 获取当前会话ID
const sessionId = eventManager.getSessionId();
```

### 自定义事件

```typescript
// 发布自定义事件
await eventManager.publishCustomEvent('custom_analysis_complete', {
    analysisType: 'code_quality',
    results: {
        score: 85,
        issues: ['unused_variable', 'missing_docs']
    },
    recommendations: ['Clean up unused variables', 'Add documentation']
});
```

### 批量事件发布

```typescript
// 批量发布相关事件
await eventManager.publishBatch([
    {
        type: 'plan_step_started',
        payload: { stepId: 'step-1', stepTitle: 'Analysis' }
    },
    {
        type: 'tool_execution_started',
        payload: { toolName: 'analyzer', callId: 'call-1' }
    }
]);
```

## 📝 最佳实践

### 1. 错误处理
事件管理器内部已经包含错误处理，但建议在关键点添加额外检查：

```typescript
try {
    if (this.eventManager) {
        await this.eventManager.publishStepStarted(stepNumber);
    }
} catch (error) {
    logger.error('Failed to publish step started event:', error);
    // 不中断主要业务流程
}
```

### 2. 条件性事件发布
根据业务逻辑条件性发布事件：

```typescript
// 只在有思考内容时发布思考事件
if (extractorResult.thinking && this.eventManager) {
    await this.eventManager.publishThinking(stepNumber, {
        analysis: extractorResult.thinking,
        plan: '',
        reasoning: extractorResult.thinking,
        nextAction: ''
    }, [], responseText);
}

// 只在有最终答案时发布回复事件
if (extractorResult.finalAnswer && this.eventManager) {
    await this.eventManager.publishReply(
        extractorResult.finalAnswer,
        'final_answer',
        { 
            reasoning: extractorResult.thinking,
            confidence: 85,
            stepNumber
        }
    );
}
```

### 3. 完整的工具执行追踪模式
```typescript
const startTime = Date.now();
const callId = `${tool.name}_${Date.now()}`;

// 1. 发布开始事件
if (this.eventManager) {
    await this.eventManager.publishToolExecutionStarted(
        tool.name, callId, params, stepNumber
    );
}

try {
    // 2. 执行工具
    const result = await tool.execute(params, this);
    const executionTime = Date.now() - startTime;
    
    // 3. 发布成功结果
    if (this.eventManager) {
        await this.eventManager.publishToolExecutionResult(
            tool.name, callId, true, result, undefined, executionTime, stepNumber
        );
    }
    
} catch (error) {
    const executionTime = Date.now() - startTime;
    
    // 4. 发布失败结果
    if (this.eventManager) {
        await this.eventManager.publishToolExecutionResult(
            tool.name, callId, false, undefined, error.message, executionTime, stepNumber
        );
    }
}
```

### 4. 事件订阅示例
在 Interactive Layer 或其他组件中订阅事件：

```typescript
// 订阅 Agent 状态变化
eventBus.subscribe('agent_state_change', async (event) => {
    const { fromState, toState, reason, currentStep } = event.payload;
    console.log(`Agent: ${fromState} → ${toState} (${reason})`);
    if (currentStep !== undefined) {
        console.log(`Current step: ${currentStep}`);
    }
});

// 订阅完整的 Agent 步骤事件
eventBus.subscribe('agent_step', async (event) => {
    const step = event.payload;
    console.log(`Step ${step.stepIndex}: ${step.status}`);
    
    if (step.duration !== undefined) {
        console.log(`Duration: ${step.duration}ms`);
    }
    
    if (step.extractorResult?.finalAnswer) {
        console.log(`Final Answer: ${step.extractorResult.finalAnswer}`);
    }
    
    if (step.toolCallResults?.length > 0) {
        console.log(`Tools used: ${step.toolCallResults.map(r => r.name).join(', ')}`);
    }
});

// 订阅工具执行结果
eventBus.subscribe('tool_execution_result', async (event) => {
    const { toolName, success, executionTime, stepNumber } = event.payload;
    console.log(`Tool ${toolName} (Step ${stepNumber}): ${success ? 'SUCCESS' : 'FAILED'} (${executionTime}ms)`);
});

// 订阅思考过程事件
eventBus.subscribe('agent_thinking', async (event) => {
    const { stepNumber, thinking, toolCalls } = event.payload;
    console.log(`Agent Thinking (Step ${stepNumber}):`);
    
    if (thinking.analysis) {
        console.log(`Analysis: ${thinking.analysis}`);
    }
    
    if (thinking.plan) {
        console.log(`Plan: ${thinking.plan}`);
    }
    
    if (toolCalls?.length > 0) {
        console.log(`Tool calls: ${toolCalls.map(tc => tc.name).join(', ')}`);
    }
});

// 订阅计划执行事件
eventBus.subscribe('plan_created', async (event) => {
    const { title, totalSteps, steps } = event.payload;
    console.log(`Plan Created: ${title} (${totalSteps} steps)`);
    steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.title}`);
    });
});

eventBus.subscribe('plan_progress_update', async (event) => {
    const { progress, currentStepTitle } = event.payload;
    console.log(`Plan Progress: ${progress}% - ${currentStepTitle}`);
});

// 订阅文件操作事件
eventBus.subscribe('file_created', async (event) => {
    const { path, size } = event.payload;
    console.log(`File created: ${path} (${size} bytes)`);
});

eventBus.subscribe('file_modified', async (event) => {
    const { path, tool, changesApplied } = event.payload;
    console.log(`File modified: ${path} using ${tool} (${changesApplied} changes)`);
});
```

## 🔍 调试和监控

### 事件追踪
所有事件都包含 `timestamp`, `sessionId` 和 `agentId`，便于追踪和调试：

```typescript
// 过滤特定 Agent 的事件
eventBus.subscribe('*', async (event) => {
    if (event.payload && 'agentId' in event.payload && event.payload.agentId === 'target-agent-id') {
        console.log(`[${event.type}] ${JSON.stringify(event.payload)}`);
    }
});
```

### 性能监控
利用工具执行事件监控性能：

```typescript
eventBus.subscribe('tool_execution_result', async (event) => {
    const { toolName, executionTime, success } = event.payload;
    if (executionTime > 5000) {  // 超过 5 秒
        console.warn(`Slow tool execution: ${toolName} took ${executionTime}ms`);
    }
    
    if (!success) {
        console.error(`Tool execution failed: ${toolName}`);
    }
});
```

### 步骤性能分析
```typescript
eventBus.subscribe('agent_step', async (event) => {
    const step = event.payload;
    
    if (step.status === 'completed' && step.duration) {
        console.log(`Step ${step.stepIndex}: ${step.duration}ms`);
        
        // 工具执行时间分析
        if (step.toolCallResults) {
            const toolTimes = step.toolCallResults.map(r => 
                `${r.name}: ${r.executionTime || 0}ms`
            );
            console.log('Tool performance:', toolTimes);
        }
    }
});
```

## 📋 完整事件类型清单

| 事件类型 | 描述 | 主要字段 |
|---------|------|----------|
| `agent_step` | 完整的Agent步骤信息 | stepIndex, status, duration, extractorResult, toolCalls |
| `agent_step_start` | Agent步骤开始 | stepIndex, agentId |
| `agent_state_change` | Agent状态变更 | fromState, toState, reason, currentStep |
| `agent_thinking` | Agent思考过程 | stepNumber, thinking, toolCalls, rawThinking |
| `agent_reply` | Agent回复 | content, replyType, metadata |
| `tool_execution_result` | 工具执行结果 | toolName, success, result, executionTime |
| `context_update` | 上下文更新 | contextId, updateType, data |
| `task_queue` | 任务队列状态 | action, taskId, taskType, priority |
| `plan_created` | 计划创建 | planId, title, totalSteps, steps |
| `plan_step_started` | 计划步骤开始 | planId, stepId, stepTitle |
| `plan_step_completed` | 计划步骤完成 | planId, stepId, nextStepTitle |
| `plan_progress_update` | 计划进度更新 | planId, progress, currentStepTitle |
| `plan_completed` | 计划完成 | planId, totalSteps, executionTime |
| `plan_error` | 计划错误 | planId, stepId, error, recoverable |
| `file_created` | 文件创建 | path, size, diff |
| `file_modified` | 文件修改 | path, tool, changesApplied, diff |
| `file_deleted` | 文件删除 | path, isDirectory, filesDeleted |
| `directory_created` | 目录创建 | path, recursive |
| `diff_reversed` | 差异回滚 | affectedFiles, changesReverted, reason |

## 🆕 最新改进

### 1. 统一的 AgentStep 事件格式
- 包含完整的步骤信息，包括开始时间、结束时间、持续时间
- 支持泛型 ExtractorResult，提供类型安全
- 丰富的工具调用结果追踪

### 2. 增强的错误处理
- 详细的错误信息结构（message, stack, code）
- 可恢复性标识
- 错误传播控制

### 3. 更好的性能监控
- 精确的时间追踪
- 工具执行性能分析
- 步骤级别的性能统计

### 4. 丰富的元数据支持
- 会话管理
- Agent 标识
- 执行模式追踪
- 自定义扩展字段

这个更新后的事件系统为 Agent 的完整生命周期管理提供了强大而灵活的事件驱动架构。 