# Continue Reasoning 框架开发指南

本指南将帮助您基于 Continue Reasoning 框架开发自定义的工具（Tools）、上下文（Contexts）和智能体（Agents）。

## 目录

1. [框架概述](#框架概述)
2. [工具开发指南](#工具开发指南)
3. [上下文开发指南](#上下文开发指南)
4. [智能体开发指南](#智能体开发指南)
5. [提示词编写指南](#提示词编写指南)
6. [提示处理器（PromptProcessor）开发指南](#提示处理器（PromptProcessor）开发指南)
7. [最佳实践](#最佳实践)

## 框架概述

Continue Reasoning 框架采用模块化设计，主要包含以下核心组件：

- **工具（Tools）**：具体功能的执行单元，如文件操作、API调用等
- **工具集（ToolSets）**：相关工具的集合，便于管理和激活
- **上下文（Contexts）**：为智能体提供特定领域的知识和工具
- **智能体（Agents）**：核心任务处理器，负责理解任务、调用工具、推理思考
- **提示处理器（PromptProcessor）**：管理对话历史和提示生成

## 工具开发指南

### 1. 工具接口介绍

工具是框架中最基本的执行单元，定义在 `packages/core/interfaces/tool.ts` 中：

```typescript
export interface ITool<Args extends z.AnyZodObject, Result extends z.ZodType<any>, Agent extends any>{
    id?: string;
    callId?: string;
    type: string;
    name: string;
    description: string;
    params: Args;
    async: boolean;
    execute: (params: z.infer<Args>, agent?: Agent) => Promise<z.infer<Result>> | z.infer<Result>;
    toCallParams: () => ToolCallDefinition;
}
```

### 2. 使用 createTool() 创建工具

框架提供了 `createTool()` 工厂函数来简化工具创建：

```typescript
import { createTool } from '@continue-reasoning/core/utils';
import { z } from 'zod';

// 定义输入参数架构
const GetWeatherInputSchema = z.object({
    city: z.string().describe('城市名称'),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius').describe('温度单位')
});

// 定义输出结果架构
const GetWeatherOutputSchema = z.object({
    success: z.boolean(),
    temperature: z.number().optional(),
    description: z.string().optional(),
    error: z.string().optional()
});

// 创建天气查询工具
export const GetWeatherTool = createTool({
    name: 'GetWeather',
    description: '获取指定城市的天气信息',
    inputSchema: GetWeatherInputSchema,
    outputSchema: GetWeatherOutputSchema,
    async: true,
    execute: async (params, agent) => {
        try {
            // 模拟API调用
            const weather = await fetchWeatherData(params.city);
            return {
                success: true,
                temperature: weather.temp,
                description: weather.description
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : '获取天气信息失败'
            };
        }
    }
});
```

### 3. 工具集管理

将相关工具组织成工具集：

```typescript
import { ToolSet } from '@continue-reasoning/core/interfaces';

export const WeatherToolSet: ToolSet = {
    name: 'WeatherTools',
    description: '天气相关工具集，用于获取天气信息和预报',
    tools: [GetWeatherTool, GetForecastTool],
    active: true,
    source: 'local'
};
```

## 上下文开发指南

### 1. Context 接口介绍

上下文为智能体提供特定领域的知识和工具，主要接口包括：

- `IContext<T>`：基础上下文接口
- `IRAGEnabledContext<T>`：支持RAG检索的增强上下文接口

### 2. 使用 createRAGContext() 创建上下文

```typescript
import { ContextHelper } from '@continue-reasoning/core/utils';
import { z } from 'zod';

// 定义上下文数据架构
const WeatherContextDataSchema = z.object({
    defaultCity: z.string().default('北京'),
    apiKey: z.string().optional(),
    refreshInterval: z.number().default(300)
});

type WeatherContextData = z.infer<typeof WeatherContextDataSchema>;

// 创建天气上下文
export const WeatherContext = ContextHelper.createRAGContext({
    id: 'weather-context',
    description: '天气信息管理上下文，提供天气查询和预报功能',
    dataSchema: WeatherContextDataSchema,
    initialData: {
        defaultCity: '北京',
        refreshInterval: 300
    },
    
    // 渲染提示函数
    renderPromptFn: (data: WeatherContextData) => ({
        workflow: `**天气查询工作流**:
1. **分析需求** → 确定用户查询的城市和信息类型
2. **调用工具** → 使用GetWeather工具获取实时天气
3. **格式化结果** → 将天气信息以用户友好的方式呈现`,
        
        status: `当前默认城市: ${data.defaultCity}
数据刷新间隔: ${data.refreshInterval}秒`,
        
        examples: `**使用示例**:
- "北京今天天气怎么样？"
- "上海明天会下雨吗？"
- "深圳这周的天气预报"`
    }),
    
    // 工具集函数
    toolSetFn: () => WeatherToolSet,
    
    // 处理工具调用结果
    handleToolCall: (toolCallResult) => {
        if (toolCallResult.name === 'GetWeather') {
            console.log('天气查询完成:', toolCallResult.result);
        }
    },
    
    // 安装函数（可选）
    install: async (agent) => {
        console.log('天气上下文已安装到智能体:', agent.id);
    }
});
```

### 3. RAG 增强上下文

如果需要知识检索功能，可以配置RAG：

```typescript
import { ChromaRAG } from '@continue-reasoning/core/rag';

// 创建带RAG的天气上下文
export const EnhancedWeatherContext = ContextHelper.createRAGContext({
    id: 'enhanced-weather-context',
    description: '增强天气上下文，支持天气知识检索',
    dataSchema: WeatherContextDataSchema,
    initialData: { defaultCity: '北京' },
    
    // RAG配置
    ragConfigs: {
        weatherKnowledge: {
            rag: new ChromaRAG({
                collectionName: 'weather-knowledge',
                persistDirectory: './data/weather-rag'
            }),
            queryTemplate: '查询与{query}相关的天气知识',
            maxResults: 3,
            resultsFormatter: (results) => {
                return results.map((r, i) => 
                    `[知识${i+1}] ${r.content} (相关度: ${r.score.toFixed(2)})`
                ).join('\n');
            }
        }
    },
    
    renderPromptFn: (data) => ({
        workflow: '增强天气查询工作流...',
        status: `默认城市: ${data.defaultCity}，支持知识检索`,
        examples: '...'
    }),
    
    toolSetFn: () => WeatherToolSet
});
```

## 智能体开发指南

### 1. 继承 BaseAgent 类

```typescript
import { BaseAgent, AgentOptions } from '@continue-reasoning/core';
import { LogLevel } from '@continue-reasoning/core/utils/logger';

export class WeatherAgent extends BaseAgent {
    constructor(
        id: string = 'weather-agent',
        name: string = '天气助手',
        description: string = '专业的天气信息查询助手',
        maxSteps: number = 10,
        logLevel: LogLevel = LogLevel.INFO,
        agentOptions?: AgentOptions
    ) {
        // 调用父类构造函数
        super(id, name, description, maxSteps, logLevel, agentOptions, [
            WeatherContext,
            // 可以添加更多上下文
        ]);
    }
    
    // 重写生命周期钩子（可选）
    async beforeStart(): Promise<void> {
        console.log('天气助手准备开始工作...');
        // 执行初始化逻辑
    }
    
    async afterStop(): Promise<void> {
        console.log('天气助手工作完成');
        // 执行清理逻辑
    }
    
    // 添加自定义方法
    async getWeatherForCity(city: string): Promise<any> {
        // 直接调用工具的业务逻辑
        const weatherTool = this.getActiveTools().find(t => t.name === 'GetWeather');
        if (weatherTool) {
            return await weatherTool.execute({ city }, this);
        }
        throw new Error('天气工具未找到');
    }
}
```

### 2. 智能体配置选项

```typescript
const agentOptions: AgentOptions = {
    model: 'gpt-4o',  // 指定模型
    enableParallelToolCalls: true,  // 启用并行工具调用
    temperature: 0.7,  // 设置创造性
    taskConcurency: 5,  // 任务并发数
    executionMode: 'manual',  // 执行模式：auto | manual | supervised
    
    // 提示优化配置
    promptOptimization: {
        mode: 'enhanced',  // minimal | standard | detailed | custom
        maxTokens: 4000
    },
    
    // 提示处理器配置
    promptProcessorOptions: {
        type: 'enhanced',  // standard | enhanced
        enableToolCallsForFirstStep: false,
        maxHistoryLength: 50
    }
};

const weatherAgent = new WeatherAgent(
    'weather-bot',
    '天气机器人',
    '智能天气查询助手',
    15,
    LogLevel.DEBUG,
    agentOptions
);
```

### 3. 智能体使用示例

```typescript
// 设置回调函数
weatherAgent.setCallBacks({
    onAgentStep: (step) => {
        console.log(`步骤 ${step.stepIndex} 完成`);
    },
    onToolCall: (toolCall) => {
        console.log(`调用工具: ${toolCall.name}`);
    },
    onToolCallResult: (result) => {
        console.log(`工具执行结果:`, result);
    },
    loadAgentStorage: async (sessionId) => {
        // 加载会话状态
        return null;
    }
});

// 初始化智能体
await weatherAgent.setup();

// 处理用户输入
await weatherAgent.startWithUserInput(
    '北京今天天气怎么样？',
    10,  // 最大步骤数
    'session-123',  // 会话ID
    {
        savePromptPerStep: true,
        promptSaveDir: './prompts',
        promptSaveFormat: 'both'
    }
);
```

## 提示词编写指南

### 1. 提示模式选择

框架支持两种提示模式：

#### Standard 模式（标准模式）
```xml
<think>
在这里进行思考、分析和计划制定
</think>

<interactive>
<response>回复用户的内容</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
```

#### Enhanced 模式（增强模式）
```xml
<think>
<reasoning>
逻辑推理和决策过程
</reasoning>

<plan>
计划管理，支持创建、更新、完成状态
</plan>
</think>

<interactive>
<response>用户响应内容</response>
<stop_signal type="boolean">false</stop_signal>
</interactive>
```

### 2. 上下文提示设计最佳实践

在 `renderPromptFn` 中返回结构化的 `PromptCtx`：

```typescript
renderPromptFn: (data: ContextData) => ({
    workflow: `**工作流程**:
1. **分析阶段** → 理解用户需求和意图
2. **规划阶段** → 制定具体的执行计划
3. **执行阶段** → 调用相应工具完成任务
4. **反馈阶段** → 整理结果并回复用户`,
    
    status: `当前状态: ${data.status}
配置信息: ${JSON.stringify(data.config)}`,
    
    examples: `**示例对话**:
用户: "帮我查询北京的天气"
助手: 好的，我来为您查询北京的实时天气信息...

用户: "明天适合出门吗？"  
助手: 根据天气预报，我来分析明天的出行建议...`
})
```

### 3. 工具描述编写规范

工具描述应该清晰、具体，包含使用场景：

```typescript
const tool = createTool({
    name: 'AnalyzeCode',
    description: `分析代码质量和潜在问题。
    
**使用场景**: 
- 代码审查和质量检测
- 识别潜在的bug和性能问题
- 提供代码改进建议

**输入**: 代码内容和分析类型
**输出**: 结构化的分析报告`,
    
    // ... 其他配置
});
```

## 提示处理器（PromptProcessor）开发指南

### 1. PromptProcessor 架构概述

PromptProcessor 是框架的核心组件，负责管理对话历史、步骤提示生成和结果提取。框架提供了两种内置模式：

- **StandardPromptProcessor**：标准模式，支持简单的思考和响应结构
- **EnhancedPromptProcessor**：增强模式，支持结构化思考（分析、计划、推理）

### 2. 历史步骤管理机制

#### 2.1 ChatHistory 结构

每个步骤的内容都会被记录到 `chatHistory` 中：

```typescript
interface ChatMessage {
    role: 'user' | 'agent' | 'system';
    step: number;                    // 步骤索引
    type: MessageType;              // 消息类型
    content: string;                // 消息内容
    timestamp: string;              // 时间戳
}

enum MessageType {
    MESSAGE = 'message',            // 普通消息
    TOOL_CALL = 'tool_call',       // 工具调用
    ERROR = 'error',               // 错误信息
    THINKING = 'thinking',         // 思考内容
    ANALYSIS = 'analysis',         // 分析内容
    PLAN = 'plan',                 // 计划内容
    REASONING = 'reasoning',       // 推理内容
    INTERACTIVE = 'interactive',   // 交互内容
    RESPONSE = 'response',         // 响应内容
    STOP_SIGNAL = 'stop_signal'   // 停止信号
}
```

#### 2.2 历史步骤过滤配置

通过 `ChatHistoryConfig` 控制不同类型消息的保留数量：

```typescript
interface ChatHistoryConfig {
    [MessageType.MESSAGE]: number;        // 保留最近 n 步的普通消息
    [MessageType.TOOL_CALL]: number;      // 保留最近 n 步的工具调用
    [MessageType.ERROR]: number;          // 保留最近 n 步的错误信息
    [MessageType.THINKING]: number;       // 保留最近 n 步的思考内容
    [MessageType.ANALYSIS]: number;       // 保留最近 n 步的分析内容
    [MessageType.PLAN]: number;           // 保留最近 n 步的计划内容
    [MessageType.REASONING]: number;      // 保留最近 n 步的推理内容
    [MessageType.INTERACTIVE]: number;    // 保留最近 n 步的交互内容
    [MessageType.RESPONSE]: number;       // 保留最近 n 步的响应内容
    [MessageType.STOP_SIGNAL]: number;    // 保留最近 n 步的停止信号
}

// 默认配置示例
const defaultConfig: ChatHistoryConfig = {
    [MessageType.MESSAGE]: 100,       // 保留最近100步的消息
    [MessageType.TOOL_CALL]: 5,      // 保留最近5步的工具调用
    [MessageType.ERROR]: 5,          // 保留最近5步的错误
    [MessageType.THINKING]: 5,       // 保留最近5步的思考
    [MessageType.ANALYSIS]: 5,       // 保留最近5步的分析
    [MessageType.PLAN]: 5,           // 保留最近5步的计划
    [MessageType.REASONING]: 5,      // 保留最近5步的推理
    [MessageType.INTERACTIVE]: 5,    // 保留最近5步的交互
    [MessageType.RESPONSE]: 5,       // 保留最近5步的响应
    [MessageType.STOP_SIGNAL]: 2     // 保留最近2步的停止信号
};
```

#### 2.3 历史步骤的使用示例

```typescript
// 配置历史步骤保留策略
const customConfig: Partial<ChatHistoryConfig> = {
    [MessageType.PLAN]: 10,          // 保留更多计划历史
    [MessageType.TOOL_CALL]: 8,      // 保留更多工具调用历史
    [MessageType.ERROR]: 15          // 保留更多错误历史用于调试
};

// 在智能体中应用配置
const agent = new MyCustomAgent('agent-id', 'Agent Name', 'Description', 10);
const processor = agent.getPromptProcessor();
processor.setChatHistoryConfig(customConfig);

// 动态调整特定类型的保留数量
processor.updateChatHistoryTypeConfig(MessageType.ANALYSIS, 12);
```

### 3. 实现自定义 PromptProcessor

#### 3.1 继承 BasePromptProcessor

```typescript
import { BasePromptProcessor, ExtractorResult, ChatHistoryConfig } from '@continue-reasoning/core/interfaces';

// 定义自定义提取结果类型
interface CustomExtractorResult extends ExtractorResult {
    thinking?: string;
    action?: string;
    reflection?: string;
    response?: string;
    stopSignal?: boolean;
}

export class CustomPromptProcessor extends BasePromptProcessor<CustomExtractorResult> {
    constructor(
        systemPrompt: string,
        contextManager?: IContextManager,
        chatHistoryConfig?: Partial<ChatHistoryConfig>
    ) {
        super('enhanced', chatHistoryConfig);
        this.systemPrompt = systemPrompt;
        if (contextManager) {
            this.setContextManager(contextManager);
        }
    }

    // 实现文本提取逻辑
    textExtractor(responseText: string): CustomExtractorResult {
        const result: CustomExtractorResult = {};
        
        // 提取思考内容
        const thinkingMatch = responseText.match(/<think>([\s\S]*?)<\/think>/);
        if (thinkingMatch) {
            result.thinking = thinkingMatch[1].trim();
        }
        
        // 提取行动内容
        const actionMatch = responseText.match(/<action>([\s\S]*?)<\/action>/);
        if (actionMatch) {
            result.action = actionMatch[1].trim();
        }
        
        // 提取反思内容
        const reflectionMatch = responseText.match(/<reflection>([\s\S]*?)<\/reflection>/);
        if (reflectionMatch) {
            result.reflection = reflectionMatch[1].trim();
        }
        
        // 提取响应内容
        const responseMatch = responseText.match(/<response>([\s\S]*?)<\/response>/);
        if (responseMatch) {
            result.response = responseMatch[1].trim();
        }
        
        // 提取停止信号
        const stopMatch = responseText.match(/<stop_signal[^>]*type="boolean"[^>]*>([\s\S]*?)<\/stop_signal>/);
        if (stopMatch) {
            const stopValue = stopMatch[1].trim().toLowerCase();
            result.stopSignal = stopValue === 'true';
            this.setStopSignal(result.stopSignal);
        }
        
        return result;
    }

    // 实现提取结果渲染逻辑
    renderExtractorResultToPrompt(extractorResult: CustomExtractorResult, stepIndex: number): void {
        // 渲染思考内容
        if (extractorResult.thinking) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.THINKING,
                content: `<thinking>${extractorResult.thinking}</thinking>`,
                timestamp: new Date().toISOString()
            });
        }
        
        // 渲染行动内容
        if (extractorResult.action) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.MESSAGE, // 使用自定义类型或现有类型
                content: `<action>${extractorResult.action}</action>`,
                timestamp: new Date().toISOString()
            });
        }
        
        // 渲染反思内容
        if (extractorResult.reflection) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.MESSAGE,
                content: `<reflection>${extractorResult.reflection}</reflection>`,
                timestamp: new Date().toISOString()
            });
        }
        
        // 渲染响应内容
        if (extractorResult.response) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.RESPONSE,
                content: extractorResult.response,
                timestamp: new Date().toISOString()
            });
        }
        
        // 渲染停止信号
        if (extractorResult.stopSignal !== undefined) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.STOP_SIGNAL,
                content: `<stop_signal type="boolean">${extractorResult.stopSignal}</stop_signal>`,
                timestamp: new Date().toISOString()
            });
        }
    }
}
```

#### 3.2 高级自定义：实现 IEnhancedPromptProcessor

```typescript
import { IEnhancedPromptProcessor, EnhancedThinkingExtractorResult } from '@continue-reasoning/core/interfaces';

export class AdvancedCustomProcessor extends BasePromptProcessor<EnhancedThinkingExtractorResult> 
    implements IEnhancedPromptProcessor<EnhancedThinkingExtractorResult> {
    
    thinkingMode: 'enhanced' | 'custom' = 'custom';
    
    constructor(systemPrompt: string, contextManager?: IContextManager) {
        super('enhanced');
        this.systemPrompt = systemPrompt;
        if (contextManager) {
            this.setContextManager(contextManager);
        }
    }
    
    setThinkingMode(mode: 'enhanced' | 'custom'): void {
        this.thinkingMode = mode;
    }
    
    // 提取结构化思考内容
    extractStructuredThinking(responseText: string): {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    } {
        const result: { analysis?: string; plan?: string; reasoning?: string } = {};
        
        // 提取分析内容
        const analysisMatch = responseText.match(/<analysis>([\s\S]*?)<\/analysis>/);
        if (analysisMatch) {
            result.analysis = analysisMatch[1].trim();
        }
        
        // 提取计划内容
        const planMatch = responseText.match(/<plan>([\s\S]*?)<\/plan>/);
        if (planMatch) {
            result.plan = planMatch[1].trim();
        }
        
        // 提取推理内容
        const reasoningMatch = responseText.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
        if (reasoningMatch) {
            result.reasoning = reasoningMatch[1].trim();
        }
        
        return result;
    }
    
    // 提取交互内容
    extractInteractiveContent(responseText: string): {
        response?: string;
        stopSignal?: boolean;
    } {
        const result: { response?: string; stopSignal?: boolean } = {};
        
        // 提取响应内容
        const responseMatch = responseText.match(/<response>([\s\S]*?)<\/response>/);
        if (responseMatch) {
            result.response = responseMatch[1].trim();
        }
        
        // 提取停止信号
        const stopMatch = responseText.match(/<stop_signal[^>]*type="boolean"[^>]*>([\s\S]*?)<\/stop_signal>/);
        if (stopMatch) {
            const stopValue = stopMatch[1].trim().toLowerCase();
            result.stopSignal = stopValue === 'true';
        }
        
        return result;
    }
    
    // 渲染思考内容到提示
    renderThinkingToPrompt(thinking: {
        analysis?: string;
        plan?: string;
        reasoning?: string;
    }, stepIndex: number): void {
        if (thinking.analysis) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.ANALYSIS,
                content: thinking.analysis,
                timestamp: new Date().toISOString()
            });
        }
        
        if (thinking.plan) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.PLAN,
                content: thinking.plan,
                timestamp: new Date().toISOString()
            });
        }
        
        if (thinking.reasoning) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.REASONING,
                content: thinking.reasoning,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // 渲染交互内容到提示
    renderInteractiveToPrompt(interactive: {
        response?: string;
        stopSignal?: boolean;
    }, stepIndex: number): void {
        if (interactive.response) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.RESPONSE,
                content: interactive.response,
                timestamp: new Date().toISOString()
            });
        }
        
        if (interactive.stopSignal !== undefined) {
            this.chatHistory.push({
                role: 'agent',
                step: stepIndex,
                type: MessageType.STOP_SIGNAL,
                content: `<stop_signal type="boolean">${interactive.stopSignal}</stop_signal>`,
                timestamp: new Date().toISOString()
            });
            this.setStopSignal(interactive.stopSignal);
        }
    }
    
    // 实现基类的抽象方法
    textExtractor(responseText: string): EnhancedThinkingExtractorResult {
        const thinking = this.extractStructuredThinking(responseText);
        const interactive = this.extractInteractiveContent(responseText);
        
        return {
            analysis: thinking.analysis,
            plan: thinking.plan,
            reasoning: thinking.reasoning,
            response: interactive.response,
            stopSignal: interactive.stopSignal
        };
    }
    
    renderExtractorResultToPrompt(extractorResult: EnhancedThinkingExtractorResult, stepIndex: number): void {
        // 渲染思考部分
        this.renderThinkingToPrompt({
            analysis: extractorResult.analysis,
            plan: extractorResult.plan,
            reasoning: extractorResult.reasoning
        }, stepIndex);
        
        // 渲染交互部分
        this.renderInteractiveToPrompt({
            response: extractorResult.response,
            stopSignal: extractorResult.stopSignal
        }, stepIndex);
    }
}
```

### 4. 在智能体中使用自定义 PromptProcessor

```typescript
export class CustomAgent extends BaseAgent {
    constructor(
        id: string,
        name: string,
        description: string,
        maxSteps: number = 10,
        logLevel: LogLevel = LogLevel.INFO
    ) {
        super(id, name, description, maxSteps, logLevel, {
            promptProcessorOptions: {
                type: 'enhanced' // 先使用默认类型初始化
            }
        });
    }
    
    async setup(): Promise<void> {
        // 先调用父类的 setup
        await super.setup();
        
        // 创建并设置自定义 PromptProcessor
        const customProcessor = new CustomPromptProcessor(
            this.getBaseSystemPrompt(this.getActiveTools(), 'enhanced'),
            this.contextManager,
            {
                [MessageType.PLAN]: 15,        // 保留更多计划历史
                [MessageType.TOOL_CALL]: 10,   // 保留更多工具调用历史
                [MessageType.ANALYSIS]: 8      // 保留更多分析历史
            }
        );
        
        // 替换默认的 PromptProcessor
        this.setPromptProcessor(customProcessor);
        
        console.log('Custom PromptProcessor has been set up');
    }
}
```

### 5. PromptProcessor 最佳实践

#### 5.1 历史步骤管理策略

```typescript
// 针对不同场景的配置建议
const configs = {
    // 调试模式：保留更多历史信息
    debug: {
        [MessageType.ERROR]: 20,
        [MessageType.TOOL_CALL]: 15,
        [MessageType.THINKING]: 10
    },
    
    // 生产模式：平衡性能和功能
    production: {
        [MessageType.MESSAGE]: 50,
        [MessageType.TOOL_CALL]: 5,
        [MessageType.ERROR]: 8,
        [MessageType.PLAN]: 6
    },
    
    // 内存优化模式：最小化内存使用
    minimal: {
        [MessageType.MESSAGE]: 10,
        [MessageType.TOOL_CALL]: 3,
        [MessageType.ERROR]: 5,
        [MessageType.THINKING]: 2
    }
};
```

#### 5.2 自定义提取器设计原则

1. **精确匹配**：使用精确的正则表达式匹配特定的XML标签
2. **容错处理**：处理格式不完整或错误的情况
3. **类型安全**：确保提取结果符合定义的接口
4. **性能优化**：避免复杂的正则表达式影响性能

```typescript
// 容错的提取器示例
textExtractor(responseText: string): CustomExtractorResult {
    const result: CustomExtractorResult = {};
    
    try {
        // 使用更安全的提取方法
        const thinkingMatch = this.safeExtract(responseText, 'think');
        if (thinkingMatch) {
            result.thinking = thinkingMatch;
        }
        
        // 处理可能的格式错误
        const stopSignalMatch = this.extractStopSignal(responseText);
        if (stopSignalMatch !== null) {
            result.stopSignal = stopSignalMatch;
            this.setStopSignal(stopSignalMatch);
        }
        
    } catch (error) {
        console.error('提取器错误:', error);
        // 返回部分结果而不是完全失败
        result.stopSignal = false;
    }
    
    return result;
}

private safeExtract(text: string, tag: string): string | null {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : null;
}

private extractStopSignal(text: string): boolean | null {
    const matches = [
        /stop_signal[^>]*type="boolean"[^>]*>([\s\S]*?)<\/stop_signal>/i,
        /<stop_signal[^>]*>(true|false)<\/stop_signal>/i,
        /stopSignal:\s*(true|false)/i
    ];
    
    for (const regex of matches) {
        const match = text.match(regex);
        if (match) {
            const value = match[1].trim().toLowerCase();
            return value === 'true';
        }
    }
    
    return null;
}
```

#### 5.3 性能监控和调试

```typescript
export class MonitoredPromptProcessor extends BasePromptProcessor<StandardExtractorResult> {
    private extractionStats = {
        totalExtractions: 0,
        successfulExtractions: 0,
        averageExtractionTime: 0
    };
    
    textExtractor(responseText: string): StandardExtractorResult {
        const startTime = Date.now();
        this.extractionStats.totalExtractions++;
        
        try {
            const result = super.textExtractor(responseText);
            this.extractionStats.successfulExtractions++;
            
            // 更新平均提取时间
            const extractionTime = Date.now() - startTime;
            this.extractionStats.averageExtractionTime = 
                (this.extractionStats.averageExtractionTime + extractionTime) / 2;
            
            return result;
        } catch (error) {
            console.error('提取失败:', error);
            throw error;
        }
    }
    
    getStats() {
        return {
            ...this.extractionStats,
            successRate: this.extractionStats.successfulExtractions / this.extractionStats.totalExtractions,
            totalMessages: this.chatHistory.length,
            currentStep: this.chatHistory.length > 0 ? Math.max(...this.chatHistory.map(m => m.step)) : 0
        };
    }
}
```

通过这些高级功能，您可以创建完全定制化的 PromptProcessor，精确控制历史步骤的管理和提示生成逻辑，满足特定业务场景的需求。

## 最佳实践

### 1. 工具设计原则

- **单一职责**：每个工具只做一件事，做好一件事
- **参数验证**：使用Zod Schema严格验证输入参数
- **错误处理**：提供详细的错误信息和恢复建议
- **异步支持**：IO密集型操作使用异步执行
- **文档完整**：提供清晰的描述和使用示例

### 2. 上下文设计原则

- **领域专注**：每个上下文专注于特定的业务领域
- **工具集成**：合理组织相关工具，避免工具散乱
- **状态管理**：妥善管理上下文状态和配置
- **RAG集成**：适当使用RAG增强知识检索能力
- **提示优化**：设计清晰的工作流程和示例

### 3. 智能体设计原则

- **职责明确**：智能体应该有明确的角色定位
- **上下文组合**：合理选择和组合相关上下文
- **配置灵活**：支持多种配置选项满足不同需求
- **错误恢复**：具备良好的错误处理和恢复能力
- **会话管理**：支持多轮对话和会话状态持久化

### 4. 性能优化建议

- **并行调用**：启用并行工具调用提高效率
- **缓存策略**：对重复查询实施缓存机制
- **资源管理**：合理管理内存和文件资源
- **批量处理**：支持批量操作减少调用次数
- **监控日志**：完善的日志记录便于调试和监控

## RAG 开发指南

### 1. RAG 架构概述

RAG（Retrieval-Augmented Generation）系统为 Agent 提供知识检索和增强能力。框架支持多种向量数据库和嵌入模型：

```typescript
import { RAGBuilder } from '@core/rag';
import { createRAGContext } from '@core/contexts/rag';

// 使用 RAGBuilder 创建 RAG 实例
const rag = new RAGBuilder()
  .setName('knowledge-base', 'Company knowledge base')
  .setVectorStore('chroma', {
    url: 'http://localhost:8000',
    collectionName: 'company_docs'
  })
  .setEmbeddingModel('openai', {
    modelName: 'text-embedding-ada-002'
  })
  .setIndexConfig({
    dimension: 1536,
    metric: 'cosine'
  })
  .setChunkingStrategy({
    method: 'fixed',
    size: 1000,
    overlap: 200
  })
  .build();
```

### 2. RAG-enabled Context 开发

使用 `createRAGContext` 工具创建具备 RAG 能力的 Context：

```typescript
// 创建 RAG Context 的完整示例
const createKnowledgeContext = createTool({
  id: 'create_knowledge_context',
  name: 'Create Knowledge Context',
  description: 'Create a knowledge base context with RAG capabilities',
  inputSchema: z.object({
    domain: z.string().describe('Knowledge domain (e.g., "legal", "technical")'),
    documents: z.array(z.string()).describe('Initial documents to index')
  }),
  async execute(params, agent) {
    // 使用 createRAGContext 创建 Context
    const result = await agent.callTool('create_rag_context_with_mcp', {
      contextId: `knowledge_${params.domain}`,
      contextDescription: `Knowledge base for ${params.domain} domain`,
      mcpServer: {
        name: `${params.domain}_mcp`,
        type: 'stdio',
        command: 'node',
        args: ['./mcp-servers/knowledge-server.js'],
        env: { DOMAIN: params.domain },
        autoActivate: true
      },
      initialData: {
        documents: params.documents,
        indexedAt: new Date().toISOString()
      }
    });
    
    return result;
  }
});
```

### 3. 自定义 RAG 实现

扩展 RAG 系统支持新的向量数据库：

```typescript
import { IRAG, VectorStoreConfig, EmbeddingConfig } from '@core/interfaces';

export class CustomRAG implements IRAG {
  constructor(
    private name: string,
    private description: string,
    private embeddingConfig: EmbeddingConfig,
    private vectorStoreConfig: VectorStoreConfig
  ) {}

  async initialize(): Promise<void> {
    // 初始化自定义向量数据库连接
  }

  async addDocuments(documents: string[]): Promise<void> {
    // 实现文档添加逻辑
  }

  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    // 实现相似性搜索
  }

  async deleteDocument(documentId: string): Promise<void> {
    // 实现文档删除
  }
}

// 在 RAGBuilder 中注册新的 RAG 类型
// 修改 ragBuilder.ts 的 build() 方法添加支持
```

## SessionManager 开发指南

### 1. SessionManager 架构

SessionManager 负责管理 Agent 的会话状态和生命周期：

```typescript
import { SessionManager } from '@core/session';
import { BaseAgent } from '@core/agent';

// 创建 Agent 和 SessionManager
const agent = new BaseAgent({
  id: 'my-agent',
  name: 'My Custom Agent',
  llm: myLLMInstance,
  // ... 其他配置
});

const sessionManager = new SessionManager(agent);

// 设置回调处理
sessionManager.setCallbacks({
  onSessionStart: (sessionId) => {
    console.log(`Session started: ${sessionId}`);
  },
  onAgentStep: (step) => {
    console.log(`Agent step: ${step.stepIndex}`);
  },
  onToolCallResult: (result) => {
    console.log(`Tool result: ${result.name}`);
  }
});
```

### 2. 自定义 Client 实现

基于 SessionManager 创建自定义客户端：

```typescript
import { IClient, ISessionManager } from '@core/interfaces';

export class CustomClient implements IClient {
  name = 'CustomClient';
  currentSessionId?: string;
  sessionManager?: ISessionManager;

  setSessionManager(sessionManager: ISessionManager): void {
    this.sessionManager = sessionManager;
    
    // 设置自定义回调
    sessionManager.setCallbacks({
      onAgentStep: (step) => this.handleAgentStep(step),
      onToolCall: (toolCall) => this.handleToolCall(toolCall),
      onToolCallResult: (result) => this.handleToolCallResult(result),
      onSessionStart: (sessionId) => {
        this.currentSessionId = sessionId;
        this.onSessionStarted(sessionId);
      },
      onSessionEnd: (sessionId) => {
        this.onSessionEnded(sessionId);
      }
    });
  }

  async sendMessageToAgent(message: string): Promise<void> {
    if (!this.sessionManager) {
      throw new Error('SessionManager not set');
    }

    if (!this.currentSessionId) {
      this.newSession();
    }

    await this.sessionManager.sendMessageToAgent(
      message, 
      100, // maxSteps
      this.currentSessionId!
    );
  }

  newSession(): void {
    if (!this.sessionManager) {
      throw new Error('SessionManager not set');
    }
    
    this.currentSessionId = this.sessionManager.createSession(
      'user-123', // userId
      'custom-agent' // agentId
    );
  }

  // 实现自定义处理逻辑
  handleAgentStep(step: AgentStep<any>): void {
    // 处理 Agent 步骤
    if (step.extractResult.response) {
      this.displayResponse(step.extractResult.response);
    }
  }

  handleToolCall(toolCall: ToolCallParams): void {
    // 处理工具调用
    this.displayToolCall(toolCall);
  }

  handleToolCallResult(result: ToolExecutionResult): void {
    // 处理工具执行结果
    this.displayToolResult(result);
  }

  private displayResponse(response: string): void {
    // 自定义响应显示逻辑
    console.log(`Agent: ${response}`);
  }

  private displayToolCall(toolCall: ToolCallParams): void {
    console.log(`🔧 Calling tool: ${toolCall.name}`);
  }

  private displayToolResult(result: ToolExecutionResult): void {
    console.log(`✅ Tool completed: ${result.name}`);
  }

  private onSessionStarted(sessionId: string): void {
    console.log(`🚀 New session started: ${sessionId}`);
  }

  private onSessionEnded(sessionId: string): void {
    console.log(`🏁 Session ended: ${sessionId}`);
  }
}
```

### 3. 会话状态管理

SessionManager 提供丰富的会话管理功能：

```typescript
// 获取会话统计
const stats = sessionManager.getStats();
console.log(`Total sessions: ${stats.totalSessions}`);
console.log(`Active sessions: ${stats.activeSessions}`);

// 获取特定会话详情
const details = sessionManager.getSessionDetails(sessionId);
if (details) {
  console.log(`Session duration: ${details.sessionDuration}ms`);
  console.log(`Total tokens used: ${details.totalTokensUsed}`);
}

// 清理过期会话
const cleanedCount = sessionManager.cleanupExpiredSessions(
  24 * 60 * 60 * 1000 // 24小时
);
console.log(`Cleaned ${cleanedCount} expired sessions`);

// 更新 Token 使用量
await sessionManager.updateTokenUsage(sessionId, 150);

// 获取所有会话摘要
const sessions = sessionManager.getAllSessionsSummary();
sessions.forEach(session => {
  console.log(`Session ${session.sessionId}: ${session.agentStepsCount} steps`);
});
```

### 4. 扩展 SessionManager

创建自定义的 SessionManager 实现：

```typescript
export class PersistentSessionManager extends SessionManager {
  constructor(agent: IAgent, private dbConnection: DatabaseConnection) {
    super(agent);
  }

  async loadSession(sessionId: string): Promise<AgentStorage | null> {
    // 先尝试从内存加载
    let session = await super.loadSession(sessionId);
    
    // 如果内存中没有，从数据库加载
    if (!session) {
      session = await this.loadFromDatabase(sessionId);
      if (session) {
        // 加载到内存中
        this.sessions.set(sessionId, session);
      }
    }
    
    return session;
  }

  async saveSession(sessionId: string, state: AgentStorage): Promise<void> {
    // 保存到内存
    await super.saveSession(sessionId, state);
    
    // 异步保存到数据库
    this.saveToDatabase(state).catch(error => {
      logger.error(`Failed to persist session ${sessionId}:`, error);
    });
  }

  private async loadFromDatabase(sessionId: string): Promise<AgentStorage | null> {
    // 实现数据库加载逻辑
    try {
      const result = await this.dbConnection.query(
        'SELECT * FROM sessions WHERE session_id = ?',
        [sessionId]
      );
      return result.length > 0 ? JSON.parse(result[0].data) : null;
    } catch (error) {
      logger.error(`Failed to load session ${sessionId} from database:`, error);
      return null;
    }
  }

  private async saveToDatabase(state: AgentStorage): Promise<void> {
    // 实现数据库保存逻辑
    await this.dbConnection.query(
      'INSERT OR REPLACE INTO sessions (session_id, data, updated_at) VALUES (?, ?, ?)',
      [state.sessionId, JSON.stringify(state), Date.now()]
    );
  }
}
```

## 扩展最佳实践

### RAG 设计原则
- **数据质量**：确保知识库数据的准确性和时效性
- **分块策略**：根据文档特性选择合适的分块方法
- **检索优化**：调整检索参数以平衡准确性和性能
- **缓存机制**：对频繁查询的结果进行缓存

### Session 管理原则
- **状态隔离**：确保不同会话之间的状态独立
- **资源管理**：及时清理过期会话，避免内存泄漏
- **持久化策略**：根据业务需求选择合适的持久化方案
- **监控告警**：监控会话数量和资源使用情况

### 额外性能优化建议
- **批量处理**：对大量数据操作使用批量处理
- **连接池**：使用连接池管理数据库连接
- **异步处理**：充分利用异步操作提高并发性能
- **内存优化**：合理设置历史记录保留策略

---

通过本指南，您应该能够基于 Continue Reasoning 框架开发出功能强大、设计良好的工具、上下文和智能体。如有疑问，请参考框架源码或提交Issue获取帮助。 