import { BaseAgent } from '../src/core/agent';
import { LogLevel } from '../src/core/utils/logger';
import { createCodingContext } from '../src/core/contexts/coding';
import { createThinkingContext } from '../src/core/thinking/thinking-context';
import { globalEventBus } from '../src/core/events/eventBus';
import { logger } from '../src/core/utils/logger';
import { OPENAI_MODELS } from '../src/core/models';
import path from 'path';
import fs from 'fs';

async function promptAnalysisExample() {
    console.log('🔍 Prompt Analysis Example - Recording and Analyzing Prompts\n');

    await globalEventBus.start();
    
    const workspacePath = path.join(process.cwd(), 'test-prompt-analysis');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    // 创建Agent
    const codingContext = createCodingContext(workspacePath);
    const thinkingContext = createThinkingContext(logger, globalEventBus);
    
    const contexts = [codingContext, thinkingContext];

    const agent = new BaseAgent(
        'prompt-analysis',
        'Prompt Analysis Agent',
        'Agent for demonstrating prompt recording and analysis',
        5, // 运行5步来生成足够的prompt数据
        LogLevel.DEBUG,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: false,
            temperature: 0.1,
            enableThinkingSystem: true,
            thinkingOptions: {
                maxConversationHistory: 5,
                maxExecutionHistory: 3
            }
        },
        contexts,
        globalEventBus
    );

    await agent.setup();

    if (!agent.isThinkingEnabled()) {
        console.error('❌ Thinking system not enabled');
        return;
    }

    console.log('✅ Starting task to generate prompt data...');
    
    try {
        // 执行一个任务来生成prompt历史
        await agent.startWithUserInput(
            'Create a simple Python calculator with basic operations (add, subtract, multiply, divide)', 
            5
        );

        // 等待任务完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 获取thinking系统实例
        const thinkingSystem = (agent as any).thinkingSystem;
        if (!thinkingSystem) {
            throw new Error('Thinking system not available');
        }

        console.log('\n📊 Analyzing prompt data...');

        // 1. 获取prompt统计信息
        const stats = thinkingSystem.getPromptStats();
        console.log('\n📈 Prompt Statistics:');
        console.log(`   📊 Total steps with prompts: ${stats.totalStepsWithPrompts}`);
        console.log(`   📏 Average prompt length: ${stats.averagePromptLength} characters`);
        console.log(`   📐 Prompt length range: ${stats.minPromptLength} - ${stats.maxPromptLength} characters`);
        
        if (stats.promptLengthTrend.length > 0) {
            console.log('   📈 Length trend:');
            stats.promptLengthTrend.forEach((trend: { stepNumber: number; length: number }) => {
                console.log(`      Step ${trend.stepNumber}: ${trend.length} chars`);
            });
        }

        // 2. 分析prompt演化模式
        const evolution = thinkingSystem.analyzePromptEvolution();
        console.log('\n🔄 Prompt Evolution Analysis:');
        console.log(`   📊 Growth pattern: ${evolution.lengthGrowthPattern}`);
        console.log(`   📈 Average growth per step: ${evolution.averageGrowthPerStep} characters`);
        
        if (evolution.significantChanges.length > 0) {
            console.log('   🚨 Significant changes:');
            evolution.significantChanges.forEach((change: { fromStep: number; toStep: number; changePercent: number }) => {
                console.log(`      Step ${change.fromStep} → ${change.toStep}: ${change.changePercent > 0 ? '+' : ''}${change.changePercent}%`);
            });
        }

        // 3. 创建输出目录
        const outputDir = path.join(process.cwd(), 'prompt-analysis');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // 4. 保存prompt历史（不同格式）
        console.log('\n💾 Saving prompt history...');
        
        // Markdown格式（推荐用于阅读）
        const markdownFile = path.join(outputDir, `prompts-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.md`);
        await thinkingSystem.savePromptHistory(markdownFile, {
            formatType: 'markdown',
            includeMetadata: true
        });
        console.log(`   📝 Markdown saved: ${markdownFile}`);

        // JSON格式（用于程序分析）
        const jsonFile = path.join(outputDir, `prompts-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`);
        await thinkingSystem.savePromptHistory(jsonFile, {
            formatType: 'json',
            includeMetadata: true
        });
        console.log(`   🔗 JSON saved: ${jsonFile}`);

        // 保存最近的prompt（用于快速查看）
        const recentFile = path.join(outputDir, 'recent-prompts.md');
        await thinkingSystem.saveRecentPrompts(recentFile, 3);
        console.log(`   ⏰ Recent prompts saved: ${recentFile}`);

        console.log('\n✅ Prompt analysis complete!');
        console.log(`📁 Files saved in: ${outputDir}`);
        
        // 5. 显示如何使用这些文件进行分析
        console.log('\n🔍 How to use the saved files:');
        console.log('   📝 Open the Markdown file to review prompt evolution');
        console.log('   🔗 Use the JSON file for programmatic analysis');
        console.log('   ⏰ Check recent-prompts.md for the latest prompt examples');
        console.log('   📊 Look for patterns in prompt length growth');
        console.log('   🎯 Identify areas for prompt optimization');

    } catch (error) {
        console.error('❌ Prompt analysis failed:', error);
    } finally {
        await globalEventBus.stop();
    }
}

promptAnalysisExample().catch(console.error); 