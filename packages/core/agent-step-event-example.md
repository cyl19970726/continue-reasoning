# AgentStep 事件格式示例

## 🎯 概览

新的 `AgentStep` 事件格式提供了完整的步骤执行信息，包含 `ExtractorResult` 泛型支持，使事件系统更加结构化和类型安全。

## 📊 AgentStep 接口定义

```typescript
interface AgentStep<T extends StandardExtractorResult = StandardExtractorResult> {
    stepIndex: number;
    
    // 步骤状态
    status: 'started' | 'processing' | 'completed' | 'error';
    
    // 时间信息
    startTime: string;
    endTime?: string;
    duration?: number; // 毫秒
    
    // 提示和响应
    prompt?: string;
    rawText?: string;
    
    // 提取结果（泛型）
    extractorResult?: T;
    
    // 工具调用信息
    toolCalls?: Array<{
        name: string;
        call_id: string;
        params: any;
    }>;
    
    // 工具执行结果
    toolCallResults?: Array<{
        name: string;
        call_id: string;
        params: any;
        status: 'pending' | 'succeed' | 'failed';
        result?: any;
        message?: string;
        executionTime?: number;
    }>;
    
    // 错误信息
    error?: {
        message: string;
        stack?: string;
        code?: string;
    };
    
    // 元数据
    metadata?: {
        agentId?: string;
        sessionId?: string;
        executionMode?: 'auto' | 'manual' | 'supervised';
        [key: string]: any;
    };
}
```

## 🚀 事件发布示例

### 1. 步骤开始事件

```typescript
// 发布步骤开始
const startedStep: AgentStep = {
    stepIndex: 0,
    status: 'started',
    startTime: '2024-01-20T10:30:00.000Z',
    prompt: "分析用户请求：如何学习 TypeScript？",
    metadata: {
        agentId: 'learning-agent',
        sessionId: 'session-123',
        executionMode: 'auto'
    }
};

await eventManager.publishAgentStep(startedStep);
```

### 2. 步骤完成事件（包含工具调用）

```typescript
// 自定义 ExtractorResult 类型
interface CustomExtractorResult extends StandardExtractorResult {
    customField?: string;
    confidence?: number;
}

const completedStep: AgentStep<CustomExtractorResult> = {
    stepIndex: 0,
    status: 'completed',
    startTime: '2024-01-20T10:30:00.000Z',
    endTime: '2024-01-20T10:30:15.500Z',
    duration: 15500,
    prompt: "分析用户请求：如何学习 TypeScript？",
    rawText: "<think>用户想学习TypeScript...</think>我建议从基础开始学习...",
    
    // 提取结果（使用泛型）
    extractorResult: {
        thinking: "用户想学习TypeScript，需要提供系统性的学习路径",
        finalAnswer: "我建议从基础开始学习 TypeScript...",
        customField: "学习建议",
        confidence: 0.95
    },
    
    // 工具调用
    toolCalls: [
        {
            name: 'web_search',
            call_id: 'search_001',
            params: {
                query: 'TypeScript 学习路径 2024',
                limit: 5
            }
        }
    ],
    
    // 工具执行结果
    toolCallResults: [
        {
            name: 'web_search',
            call_id: 'search_001',
            params: {
                query: 'TypeScript 学习路径 2024',
                limit: 5
            },
            status: 'succeed',
            result: {
                results: [
                    { title: 'TypeScript 官方文档', url: '...' },
                    // ... 更多结果
                ]
            },
            executionTime: 1200
        }
    ],
    
    metadata: {
        agentId: 'learning-agent',
        sessionId: 'session-123',
        executionMode: 'auto',
        timestamp: 1705743015500
    }
};

await eventManager.publishAgentStep(completedStep);
```

### 3. 步骤错误事件

```typescript
const errorStep: AgentStep = {
    stepIndex: 1,
    status: 'error',
    startTime: '2024-01-20T10:30:16.000Z',
    endTime: '2024-01-20T10:30:20.000Z',
    duration: 4000,
    
    // 错误信息
    error: {
        message: 'Tool execution failed: web_search timeout',
        code: 'TOOL_TIMEOUT',
        stack: 'Error: Tool execution failed...'
    },
    
    // 部分工具调用信息
    toolCalls: [
        {
            name: 'web_search',
            call_id: 'search_002',
            params: { query: 'advanced TypeScript patterns' }
        }
    ],
    
    toolCallResults: [
        {
            name: 'web_search',
            call_id: 'search_002',
            params: { query: 'advanced TypeScript patterns' },
            status: 'failed',
            message: 'Request timeout after 30 seconds',
            executionTime: 30000
        }
    ],
    
    metadata: {
        agentId: 'learning-agent',
        sessionId: 'session-123',
        executionMode: 'auto'
    }
};

await eventManager.publishAgentStep(errorStep);
```

## 🔍 事件订阅示例

### 订阅所有 AgentStep 事件

```typescript
eventBus.subscribe('agent_step', async (event) => {
    const step: AgentStep = event.payload;
    
    console.log(`Step ${step.stepIndex} Status: ${step.status}`);
    
    switch (step.status) {
        case 'started':
            console.log(`Step started at ${step.startTime}`);
            if (step.prompt) {
                console.log(`Prompt: ${step.prompt.substring(0, 100)}...`);
            }
            break;
            
        case 'completed':
            console.log(`Step completed in ${step.duration}ms`);
            
            // 处理提取结果
            if (step.extractorResult?.finalAnswer) {
                console.log('Final Answer:', step.extractorResult.finalAnswer);
            }
            
            // 处理工具执行结果
            if (step.toolCallResults) {
                step.toolCallResults.forEach(result => {
                    console.log(`Tool ${result.name}: ${result.status} (${result.executionTime}ms)`);
                });
            }
            break;
            
        case 'error':
            console.error(`Step failed: ${step.error?.message}`);
            break;
    }
});
```

### 按状态过滤事件

```typescript
// 只处理完成的步骤
eventBus.subscribe('agent_step', async (event) => {
    const step: AgentStep = event.payload;
    
    if (step.status === 'completed' && step.extractorResult?.finalAnswer) {
        // 收集所有最终答案
        finalAnswers.push({
            stepIndex: step.stepIndex,
            answer: step.extractorResult.finalAnswer,
            timestamp: step.endTime
        });
    }
});

// 只处理工具执行失败的情况
eventBus.subscribe('agent_step', async (event) => {
    const step: AgentStep = event.payload;
    
    if (step.toolCallResults) {
        const failedTools = step.toolCallResults.filter(r => r.status === 'failed');
        if (failedTools.length > 0) {
            console.warn(`Step ${step.stepIndex} had ${failedTools.length} failed tool calls`);
            failedTools.forEach(tool => {
                console.warn(`- ${tool.name}: ${tool.message}`);
            });
        }
    }
});
```

## 📈 性能监控示例

```typescript
// 监控步骤执行时间
const stepPerformanceTracker = new Map<number, number>();

eventBus.subscribe('agent_step', async (event) => {
    const step: AgentStep = event.payload;
    
    if (step.status === 'started') {
        stepPerformanceTracker.set(step.stepIndex, Date.now());
    } else if (step.status === 'completed' && step.duration) {
        if (step.duration > 10000) { // 超过 10 秒
            console.warn(`Slow step detected: Step ${step.stepIndex} took ${step.duration}ms`);
        }
        
        // 工具执行时间分析
        if (step.toolCallResults) {
            const slowTools = step.toolCallResults.filter(r => 
                r.executionTime && r.executionTime > 5000
            );
            if (slowTools.length > 0) {
                console.warn(`Slow tools in step ${step.stepIndex}:`, 
                    slowTools.map(t => `${t.name}(${t.executionTime}ms)`));
            }
        }
    }
});
```

## 🛠️ 工具执行分析示例

```typescript
// 分析工具成功率
const toolStats = new Map<string, {success: number, failed: number, totalTime: number}>();

eventBus.subscribe('agent_step', async (event) => {
    const step: AgentStep = event.payload;
    
    if (step.toolCallResults) {
        step.toolCallResults.forEach(result => {
            const stats = toolStats.get(result.name) || {success: 0, failed: 0, totalTime: 0};
            
            if (result.status === 'succeed') {
                stats.success++;
            } else if (result.status === 'failed') {
                stats.failed++;
            }
            
            if (result.executionTime) {
                stats.totalTime += result.executionTime;
            }
            
            toolStats.set(result.name, stats);
        });
    }
});

// 定期报告工具统计
setInterval(() => {
    console.log('Tool Performance Report:');
    toolStats.forEach((stats, toolName) => {
        const total = stats.success + stats.failed;
        const successRate = total > 0 ? (stats.success / total * 100).toFixed(1) : '0';
        const avgTime = total > 0 ? (stats.totalTime / total).toFixed(0) : '0';
        
        console.log(`${toolName}: ${successRate}% success, avg ${avgTime}ms`);
    });
}, 60000); // 每分钟报告一次
```

## 🎯 使用建议

1. **类型安全**: 使用泛型 `AgentStep<T>` 来确保 `extractorResult` 的类型安全
2. **性能监控**: 利用时间戳和执行时间信息进行性能分析
3. **错误处理**: 检查 `error` 字段和 `toolCallResults` 中的失败状态
4. **元数据利用**: 使用 `metadata` 字段存储和检索上下文信息
5. **状态过滤**: 根据 `status` 字段过滤和处理不同阶段的事件 