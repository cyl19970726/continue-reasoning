# 简化模型选择指南

## 概述

HHH-AGI 现在支持简化的模型选择功能。你可以直接指定任意具体的 AI 模型，系统会自动检测提供商。

## 核心概念

### SupportedModel 类型

所有支持的模型都定义在一个联合类型中：

```typescript
export type SupportedModel = 
    | OPENAI_MODELS 
    | ANTHROPIC_MODELS 
    | GOOGLE_MODELS 
    | GOOGLE_IMAGE_MODELS 
    | GOOGLE_VIDEO_MODELS;
```

### 自动提供商检测

使用 `getModelProvider()` 函数自动检测模型提供商：

```typescript
import { getModelProvider, OPENAI_MODELS } from "./src/core/models";

const provider = getModelProvider(OPENAI_MODELS.GPT_4O); // 返回 'openai'
```

## 使用方法

### 1. 指定具体模型

```typescript
import { BaseAgent, AgentOptions } from "./src/core/agent";
import { OPENAI_MODELS, ANTHROPIC_MODELS, GOOGLE_MODELS } from "./src/core/models";

// 使用 OpenAI GPT-4.5
const options: AgentOptions = {
    model: OPENAI_MODELS.GPT_4_5_PREVIEW,
    temperature: 0.3,
    maxTokens: 4000
};

// 使用 Claude 3.5 Sonnet
const claudeOptions: AgentOptions = {
    model: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022,
    temperature: 0.7
};

// 使用 Gemini 2.5 Flash
const geminiOptions: AgentOptions = {
    model: GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20,
    temperature: 0.5
};
```

### 2. 使用默认模型

```typescript
// 不指定模型时，自动使用默认模型 (GPT-4o)
const defaultOptions: AgentOptions = {
    temperature: 0.7,
    maxTokens: 4000
};
```

## 支持的模型

### OpenAI 模型

```typescript
import { OPENAI_MODELS } from "./src/core/models";

// 最新模型
OPENAI_MODELS.GPT_4_5_PREVIEW                    // GPT-4.5 (2025最新)
OPENAI_MODELS.GPT_4_1                           // GPT-4.1
OPENAI_MODELS.GPT_4_1_MINI                      // GPT-4.1 Mini

// 核心模型
OPENAI_MODELS.GPT_4O                            // GPT-4o
OPENAI_MODELS.GPT_4O_MINI                       // GPT-4o Mini

// 专业模型
OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17   // 音频模型
OPENAI_MODELS.GPT_4O_REALTIME_PREVIEW_2024_12_17 // 实时对话
```

### Anthropic 模型

```typescript
import { ANTHROPIC_MODELS } from "./src/core/models";

ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022     // Claude 3.5 Sonnet (最新)
ANTHROPIC_MODELS.CLAUDE_3_5_HAIKU_20241022      // Claude 3.5 Haiku
ANTHROPIC_MODELS.CLAUDE_3_OPUS_20240229         // Claude 3 Opus
```

### Google 模型

```typescript
import { GOOGLE_MODELS, GOOGLE_IMAGE_MODELS, GOOGLE_VIDEO_MODELS } from "./src/core/models";

// 文本模型
GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20    // Gemini 2.5 Flash
GOOGLE_MODELS.GEMINI_2_5_PRO_PREVIEW_05_06      // Gemini 2.5 Pro

// 图像生成
GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002     // Imagen 3

// 视频生成
GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001        // Veo 2
```

## 实际应用示例

### 多模态工作流

```typescript
// 文本分析
const textAgent = new BaseAgent(/* ... */, {
    model: OPENAI_MODELS.GPT_4O
});

// 图像生成
const imageAgent = new BaseAgent(/* ... */, {
    model: GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002
});

// 视频制作
const videoAgent = new BaseAgent(/* ... */, {
    model: GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001
});
```

### 成本优化

```typescript
// 简单任务 - 使用成本较低的模型
const simpleAgent = new BaseAgent(/* ... */, {
    model: OPENAI_MODELS.GPT_4O_MINI
});

// 复杂任务 - 使用能力更强的模型
const complexAgent = new BaseAgent(/* ... */, {
    model: OPENAI_MODELS.GPT_4_5_PREVIEW
});
```

### 专业任务

```typescript
// 实时对话
const realtimeAgent = new BaseAgent(/* ... */, {
    model: OPENAI_MODELS.GPT_4O_REALTIME_PREVIEW_2024_12_17
});

// 音频处理
const audioAgent = new BaseAgent(/* ... */, {
    model: OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17
});

// 代码生成
const codingAgent = new BaseAgent(/* ... */, {
    model: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022
});
```

## 动态模型选择

```typescript
function createAgentForTask(taskType: string): BaseAgent {
    let model: SupportedModel;
    
    switch (taskType) {
        case 'voice':
            model = OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17;
            break;
        case 'image':
            model = GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20;
            break;
        case 'reasoning':
            model = ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022;
            break;
        case 'code':
            model = OPENAI_MODELS.GPT_4_5_PREVIEW;
            break;
        default:
            model = OPENAI_MODELS.GPT_4O;
    }
    
    return new BaseAgent(/* ... */, { model });
}
```

## 类型安全

TypeScript 会确保你只能使用支持的模型：

```typescript
// ✅ 正确 - 使用枚举值
const options: AgentOptions = {
    model: OPENAI_MODELS.GPT_4O
};

// ❌ 错误 - TypeScript 会报错
const badOptions: AgentOptions = {
    model: "invalid-model" // Type error!
};
```

## 迁移指南

### 从复杂版本迁移

**旧方式**:
```typescript
const options: AgentOptions = {
    modelName: "gpt-4o",
    llmProvider: 'openai'
};
```

**新方式**:
```typescript
const options: AgentOptions = {
    model: OPENAI_MODELS.GPT_4O
};
```

### 从提供商配置迁移

**旧方式**:
```typescript
const options: AgentOptions = {
    llmProvider: 'openai'
};
```

**新方式**:
```typescript
// 方式1: 明确指定模型
const options: AgentOptions = {
    model: OPENAI_MODELS.GPT_4O
};

// 方式2: 使用默认模型（推荐）
const options: AgentOptions = {
    // 不指定 model，自动使用 GPT-4o
};
```

## 优势

1. **类型安全**: TypeScript 确保只能使用有效模型
2. **简单直观**: 直接使用枚举值，无需复杂配置
3. **自动检测**: 系统自动检测模型提供商
4. **极简配置**: 只需指定模型，无需额外配置
5. **易于维护**: 所有模型定义在一个地方

## 最佳实践

1. **优先使用 `model` 参数**: 更明确和类型安全
2. **根据任务选择模型**: 不同任务使用最适合的模型
3. **考虑成本**: 简单任务使用 Mini 版本
4. **利用 TypeScript**: 让编译器帮你检查模型有效性

这个简化的API让模型选择变得更加直观和安全！ 