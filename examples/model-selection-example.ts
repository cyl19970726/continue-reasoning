import { BaseAgent, AgentOptions } from "../src/core/agent";
import { ContextManager } from "../src/core/context";
import { MapMemoryManager } from "../src/core/memory/baseMemory";
import { OPENAI_MODELS, ANTHROPIC_MODELS, GOOGLE_MODELS, GOOGLE_IMAGE_MODELS, GOOGLE_VIDEO_MODELS, SupportedModel, getModelProvider } from "../src/core/models";
import { LogLevel } from "../src/core/utils/logger";

/**
 * 模型选择示例
 * 展示如何使用新的智能模型配置系统
 */

async function demonstrateModelSelection() {
    console.log("🚀 模型选择功能演示\n");

    // 1. 基本模型检测
    console.log("=== 1. 模型提供商检测 ===");
    const testModels: SupportedModel[] = [
        OPENAI_MODELS.GPT_4O,
        ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022, 
        GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20,
        OPENAI_MODELS.GPT_4_5_PREVIEW
    ];

    for (const model of testModels) {
        const provider = getModelProvider(model);
        console.log(`模型: ${model}`);
        console.log(`  提供商: ${provider}`);
        console.log("");
    }

    // 2. 不同类型的模型展示
    console.log("=== 2. 不同类型的模型 ===");
    console.log(`文本模型: ${OPENAI_MODELS.GPT_4O} (${getModelProvider(OPENAI_MODELS.GPT_4O)})`);
    console.log(`音频模型: ${OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17} (${getModelProvider(OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17)})`);
    console.log(`图像模型: ${GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002} (${getModelProvider(GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002)})`);
    console.log(`视频模型: ${GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001} (${getModelProvider(GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001)})`);
    console.log("");

    // 4. 创建使用具体模型的 Agent
    console.log("=== 4. 创建不同模型的 Agent ===");
    
    const contextManager = new ContextManager("demo-context", "Demo Context Manager", "Context manager for model selection demo", {});
    const memoryManager = new MapMemoryManager("demo-memory", "Demo Memory Manager", "Memory manager for model selection demo");

    // 示例 1: 使用最新的 GPT-4.5 模型
    const gpt45Options: AgentOptions = {
        model: OPENAI_MODELS.GPT_4_5_PREVIEW,
        temperature: 0.3,
        maxTokens: 4000,
        enableParallelToolCalls: true
    };

    const gpt45Agent = new BaseAgent(
        "gpt45-agent",
        "GPT-4.5 Agent",
        "使用最新 GPT-4.5 模型的智能代理",
        contextManager,
        memoryManager,
        [],
        10,
        LogLevel.INFO,
        gpt45Options
    );

    console.log("✅ 创建 GPT-4.5 Agent 成功");

    // 示例 2: 使用 Claude 3.5 Sonnet 模型
    const claudeOptions: AgentOptions = {
        model: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022,
        temperature: 0.7,
        maxTokens: 8000
    };

    const claudeAgent = new BaseAgent(
        "claude-agent",
        "Claude 3.5 Agent", 
        "使用 Claude 3.5 Sonnet 模型的推理代理",
        contextManager,
        memoryManager,
        [],
        10,
        LogLevel.INFO,
        claudeOptions
    );

    console.log("✅ 创建 Claude 3.5 Agent 成功");

    // 示例 3: 使用 Gemini 2.5 Flash 模型
    const geminiOptions: AgentOptions = {
        model: GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20,
        temperature: 0.5,
        maxTokens: 6000
    };

    const geminiAgent = new BaseAgent(
        "gemini-agent",
        "Gemini 2.5 Agent",
        "使用 Gemini 2.5 Flash 模型的多模态代理",
        contextManager,
        memoryManager,
        [],
        10,
        LogLevel.INFO,
        geminiOptions
    );

    console.log("✅ 创建 Gemini 2.5 Agent 成功");

    // 示例 4: 使用音频模型
    const audioOptions: AgentOptions = {
        model: OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17,
        temperature: 0.8,
        enableParallelToolCalls: false
    };

    const audioAgent = new BaseAgent(
        "audio-agent",
        "Audio Agent",
        "使用音频模型的代理",
        contextManager,
        memoryManager,
        [],
        10,
        LogLevel.INFO,
        audioOptions
    );

    console.log("✅ 创建音频 Agent 成功");

    // 示例 5: 使用默认模型
    console.log("\n=== 5. 使用默认模型 ===");
    const defaultOptions: AgentOptions = {
        // 不指定 model，使用默认的 GPT-4o
        temperature: 0.7
    };

    const defaultAgent = new BaseAgent(
        "default-agent",
        "Default Agent",
        "使用默认模型的代理",
        contextManager,
        memoryManager,
        [],
        10,
        LogLevel.INFO,
        defaultOptions
    );

    console.log("✅ 默认模型创建 Agent 成功");

    console.log("\n🎉 模型选择功能演示完成！");
}

/**
 * 高级使用场景示例
 */
async function advancedUsageExamples() {
    console.log("\n🔧 高级使用场景\n");

    // 场景 1: 多模态工作流
    console.log("=== 场景 1: 多模态工作流 ===");
    console.log("文本分析 → 图像生成 → 视频制作");
    
    const textModel = OPENAI_MODELS.GPT_4O;
    const imageModel = GOOGLE_IMAGE_MODELS.IMAGEN_3_0_GENERATE_002;
    const videoModel = GOOGLE_VIDEO_MODELS.VEO_2_0_GENERATE_001;
    
    console.log(`1. 文本分析: ${textModel} (${getModelProvider(textModel)})`);
    console.log(`2. 图像生成: ${imageModel} (${getModelProvider(imageModel)})`);
    console.log(`3. 视频制作: ${videoModel} (${getModelProvider(videoModel)})`);

    // 场景 2: 成本优化选择
    console.log("\n=== 场景 2: 成本优化选择 ===");
    console.log("根据任务复杂度选择合适的模型:");
    
    const scenarios = [
        { task: "简单问答", model: OPENAI_MODELS.GPT_4O_MINI },
        { task: "复杂推理", model: OPENAI_MODELS.GPT_4_5_PREVIEW },
        { task: "代码生成", model: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022 },
        { task: "实时对话", model: OPENAI_MODELS.GPT_4O_REALTIME_PREVIEW_2024_12_17 }
    ];

    scenarios.forEach(scenario => {
        const provider = getModelProvider(scenario.model);
        console.log(`${scenario.task}: ${scenario.model} (${provider})`);
    });

    // 场景 3: 动态模型切换
    console.log("\n=== 场景 3: 动态模型切换 ===");
    console.log("根据用户输入类型动态选择最佳模型");
    
    const inputTypes = [
        { input: "语音消息", recommended: OPENAI_MODELS.GPT_4O_AUDIO_PREVIEW_2024_12_17 },
        { input: "图片描述请求", recommended: GOOGLE_MODELS.GEMINI_2_5_FLASH_PREVIEW_05_20 },
        { input: "复杂逻辑问题", recommended: ANTHROPIC_MODELS.CLAUDE_3_5_SONNET_20241022 },
        { input: "代码调试", recommended: OPENAI_MODELS.GPT_4_5_PREVIEW }
    ];

    inputTypes.forEach(type => {
        const provider = getModelProvider(type.recommended);
        console.log(`${type.input} → ${type.recommended} (${provider})`);
    });

    console.log("\n✨ 高级场景演示完成！");
}

// 运行演示
if (require.main === module) {
    demonstrateModelSelection()
        .then(() => advancedUsageExamples())
        .catch(console.error);
} 