# 智能模型选择指南

## 概述

HHH-AGI 现在支持智能模型选择功能，允许你指定任意具体的 AI 模型，而不仅仅是选择提供商。系统会自动检测模型提供商、验证模型有效性，并提供智能推荐。

## 核心功能

### 1. 自动模型检测

系统可以根据模型名称自动检测提供商：

```typescript
import { detectProvider, validateModel } from "./src/core/models/modelConfig";

// 自动检测提供商
const provider = detectProvider("gpt-4o"); // 返回 'openai'
const provider2 = detectProvider("claude-3-5-sonnet-20241022"); // 返回 'anthropic'
const provider3 = detectProvider("gemini-2.5-flash-preview-05-20"); // 返回 'google'

// 验证模型
const config = validateModel("gpt-4o");
console.log(config);
// {
//   provider: 'openai',
//   modelName: 'gpt-4o',
//   isValid: true,
//   category: 'text'
// }
```

### 2. 智能模型推荐

根据任务类型推荐最佳模型：

```typescript
import { recommendModel } from "./src/core/models/modelConfig";

const textModel = recommendModel('text');        // GPT-4o
const audioModel = recommendModel('audio');      // GPT-4o Audio Preview
const imageModel = recommendModel('image');      // Gemini 2.0 Flash Image Generation
const videoModel = recommendModel('video');      // Veo 2.0
const codeModel = recommendModel('code');        // GPT-4.5 Preview
const reasoningModel = recommendModel('reasoning'); // Claude 3.5 Sonnet
```

### 3. 按类别筛选模型

```typescript
import { getModelsByCategory } from "./src/core/models/modelConfig";

const audioModels = getModelsByCategory('audio');
// 返回所有音频相关模型的列表
```

## Agent 配置

### 基本用法

#### 1. 指定具体模型

```typescript
import { BaseAgent, AgentOptions } from "./src/core/agent";
import { OPENAI_MODELS } from "./src/core/models";

const options: AgentOptions = {
    modelName: OPENAI_MODELS.GPT_4_5_PREVIEW, // 具体模型名称
    temperature: 0.3,
    maxTokens: 4000,
    enableParallelToolCalls: true
};

const agent = new BaseAgent(
    "my-agent",
    "My Agent",
    "使用 GPT-4.5 的智能代理",
    contextManager,
    memoryManager,
    [],
    10,
    LogLevel.INFO,
    options
);
```

#### 2. 自动检测提供商

```typescript
const options: AgentOptions = {
    modelName: "claude-3-5-sonnet-20241022", // 不指定提供商，自动检测
    temperature: 0.7
};
```

#### 3. 传统方式（仍然支持）

```typescript
const options: AgentOptions = {
    llmProvider: 'openai', // 使用默认模型
    temperature: 0.5
};
```

### 高级配置

#### 错误处理和后备方案

```typescript
const options: AgentOptions = {
    modelName: "invalid-model-name",
    llmProvider: 'openai', // 作为后备提供商
    temperature: 0.7
};

// 系统会自动使用 OpenAI 的默认模型并记录警告
```

## 支持的模型

### OpenAI 模型

```typescript
import { OPENAI_MODELS } from "./src/core/models";

// 最新模型
OPENAI_MODELS.GPT_4_5_PREVIEW                    // GPT-4.5 (2025最新)
OPENAI_MODELS.GPT_4_1                           // GPT-4.1
OPENAI_MODELS.GPT_4_1_MINI                      // GPT-4.1 Mini
OPENAI_MODELS.GPT_4_1_NANO                      // GPT-4.1 Nano

// 核心模型
OPENAI_MODELS.GPT_4O                            // GPT-4o
OPENAI_MODELS.GPT_4O_MINI                       // GPT-4o Mini

// 专业模型
OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17   // 音频模型
OPENAI_MODELS.GPT_4O_REALTIME_PREVIEW_2024_12_17 // 实时对话
OPENAI_MODELS.GPT_4O_SEARCH_PREVIEW_2025_03_11   // 搜索增强
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
GOOGLE_MODELS.GEMINI_2_0_FLASH                  // Gemini 2.0 Flash

// 音频模型
GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_NATIVE_AUDIO_DIALOG // 音频对话
GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_TTS      // 文本转语音

// 图像生成
GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002     // Imagen 3
GOOGLE_IMAGE_MODELS.GEMINI_2_0_FLASH_PREVIEW_IMAGE_GENERATION

// 视频生成
GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001        // Veo 2
```

## 实际应用场景

### 1. 多模态工作流

```typescript
// 文本分析 → 图像生成 → 视频制作
const textAgent = new BaseAgent(/* ... */, {
    modelName: OPENAI_MODELS.GPT_4O
});

const imageAgent = new BaseAgent(/* ... */, {
    modelName: GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002
});

const videoAgent = new BaseAgent(/* ... */, {
    modelName: GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001
});
```

### 2. 成本优化

```typescript
// 根据任务复杂度选择合适的模型
const simpleTaskAgent = new BaseAgent(/* ... */, {
    modelName: OPENAI_MODELS.GPT_4O_MINI // 成本较低
});

const complexTaskAgent = new BaseAgent(/* ... */, {
    modelName: OPENAI_MODELS.GPT_4_5_PREVIEW // 能力更强
});
```

### 3. 专业任务

```typescript
// 实时对话
const realtimeAgent = new BaseAgent(/* ... */, {
    modelName: OPENAI_MODELS.GPT_4O_REALTIME_PREVIEW_2024_12_17
});

// 代码生成
const codingAgent = new BaseAgent(/* ... */, {
    modelName: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022
});

// 音频处理
const audioAgent = new BaseAgent(/* ... */, {
    modelName: OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17
});
```

### 4. 动态模型切换

```typescript
function createAgentForTask(taskType: string) {
    let modelName: string;
    
    switch (taskType) {
        case 'voice':
            modelName = OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17;
            break;
        case 'image':
            modelName = GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20;
            break;
        case 'reasoning':
            modelName = ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022;
            break;
        default:
            modelName = OPENAI_MODELS.GPT_4O;
    }
    
    return new BaseAgent(/* ... */, { modelName });
}
```

## 最佳实践

### 1. 模型选择原则

- **简单任务**: 使用 Mini 版本模型（如 GPT-4o Mini）
- **复杂推理**: 使用最新的大模型（如 GPT-4.5, Claude 3.5 Sonnet）
- **多模态任务**: 使用 Gemini 系列
- **实时交互**: 使用 Realtime 模型
- **成本敏感**: 优先选择 Mini 或较旧版本

### 2. 错误处理

```typescript
const options: AgentOptions = {
    modelName: "preferred-model",
    llmProvider: 'openai', // 后备提供商
    temperature: 0.7
};

// 系统会自动处理无效模型名称
```

### 3. 性能优化

```typescript
// 预验证模型
const config = validateModel("gpt-4o");
if (config.isValid) {
    const agent = new BaseAgent(/* ... */, {
        modelName: config.modelName
    });
}
```

### 4. 日志和监控

系统会自动记录模型选择信息：

```
[INFO] Using OpenAI model: gpt-4.5-preview (category: text)
[WARN] Invalid model name: invalid-model. Using default model for provider: openai
```

## 迁移指南

### 从旧版本迁移

**旧方式**:
```typescript
const options: AgentOptions = {
    llmProvider: 'openai'
};
```

**新方式**:
```typescript
const options: AgentOptions = {
    modelName: OPENAI_MODELS.GPT_4O // 或任何具体模型
};
```

### 兼容性

- 旧的 `llmProvider` 配置仍然支持
- 可以同时指定 `modelName` 和 `llmProvider`（modelName 优先）
- 所有现有代码无需修改即可继续工作

## 故障排除

### 常见问题

1. **模型名称无效**
   - 检查模型名称拼写
   - 使用 `validateModel()` 验证
   - 查看支持的模型列表

2. **提供商检测失败**
   - 指定 `llmProvider` 作为后备
   - 使用 `detectProvider()` 测试

3. **API 密钥问题**
   - 确保环境变量正确设置
   - 检查对应提供商的 API 密钥

### 调试技巧

```typescript
// 启用详细日志
const agent = new BaseAgent(/* ... */, options, LogLevel.DEBUG);

// 验证模型配置
const config = validateModel(modelName);
console.log('Model config:', config);

// 检查可用模型
const allModels = getAllModels();
console.log('Available models:', allModels);
```

## 未来计划

- [ ] 支持更多模型提供商
- [ ] 动态模型性能监控
- [ ] 自动模型选择优化
- [ ] 模型成本分析
- [ ] 模型能力评估

## 参考资料

- [OpenAI Models Documentation](https://platform.openai.com/docs/models)
- [Anthropic Models Documentation](https://docs.anthropic.com/claude/docs/models-overview)
- [Google AI Models Documentation](https://ai.google.dev/models) 