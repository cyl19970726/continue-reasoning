import { LogLevel, createThinkingContext, globalEventBus, logger, OPENAI_MODELS } from '@continue-reasoning/core';
import { CodingAgent } from '@continue-reasoning/agents';
import path from 'path';
import fs from 'fs';

async function stepPromptSavingExample() {
    console.log('📝 Step-by-Step Prompt Saving Example\n');

    await globalEventBus.start();
    
    const workspacePath = path.join(process.cwd(), 'test-step-prompt-saving');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }


    // 🆕 使用 CodingAgent
    const agent = new CodingAgent(
        'step-prompt-demo',
        'Step Prompt Demo Coding Agent',
        'Coding agent for demonstrating step-by-step prompt saving',
        workspacePath,
        5, // 运行5步来生成足够的示例
        LogLevel.DEBUG,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: false,
            temperature: 0.1,
        },
        [],
        globalEventBus
    );

    await agent.setup();
    agent.setEnableToolCallsForStep((stepIndex) => {
        if(stepIndex === 0){
            return false;
        }
        return true;
    });

    try {
        console.log('🎯 Demo: Creating a Python web scraper with step-by-step prompt saving\n');

        // 🆕 配置每步保存选项
        const promptSaveOptions = {
            savePromptPerStep: true,                    // 启用每步保存
            promptSaveDir: './demo-step-prompts',       // 保存目录
            promptSaveFormat: 'both' as const           // 同时保存 markdown 和 json
        };

        console.log('⚙️  Prompt saving configuration:');
        console.log(`   📁 Directory: ${promptSaveOptions.promptSaveDir}`);
        console.log(`   📋 Format: ${promptSaveOptions.promptSaveFormat}`);
        console.log(`   ⚡ Real-time: Save after each step completion\n`);

        // 执行任务
        const task = `刚刚以下任务执行到一半，请继续完成：

Task:创建一个Python网页爬虫项目，具体要求如下：

1. **目标网站**: https://news.ycombinator.com (Hacker News首页)
2. **提取内容**: 提取首页前20条新闻的标题和链接
3. **技术栈**: 使用 requests 和 BeautifulSoup 库
4. **输出格式**: 将结果保存到 news_headlines.json 文件
5. **文件结构**: 
   - news_scraper.py (主爬虫脚本)
   - requirements.txt (依赖列表)
   - README.md (使用说明)
6. **功能要求**: 
   - 添加错误处理和重试机制
   - 添加用户代理头部避免被屏蔽
   - 添加适当的延时避免过于频繁请求
   - 代码要有详细注释

任务状态：
爬虫测试成功执行，输出文件 news_headlines.json，并且但是程序没有成功提取并保存了前20条新闻到 news_headlines.json 文件

项目总结：
- 创建了以下文件: news_scraper.py, requirements.txt, README.md
- 实现了爬虫功能: 使用 requests 和 BeautifulSoup 进行网页爬取
- 提取了Hacker News首页前20条新闻的标题和链接
- 添加了错误处理、用户代理头部、请求延时等功能
- 测试结果: 生成了 news_headlines.json 文件,但是没有数据

在你给出最终结果前，请你阅读下 news_headlines.json 文件，确保你已经成功提取了前20条新闻的标题和链接。`;
        
        console.log('🚀 Starting task with step-by-step prompt saving...\n');
        
        await agent.startWithUserInput(task, 20, promptSaveOptions);

        console.log('\n✅ Task completed! Analyzing saved prompts...\n');

        // 分析保存的文件
        const stepDir = promptSaveOptions.promptSaveDir;
        if (fs.existsSync(stepDir)) {
            const files = fs.readdirSync(stepDir).sort();
            
            console.log('📊 Step-by-step prompt analysis:');
            console.log(`   📁 Total files saved: ${files.length}`);
            
            const markdownFiles = files.filter(f => f.endsWith('.md'));
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            console.log(`   📝 Markdown files: ${markdownFiles.length}`);
            console.log(`   🔗 JSON files: ${jsonFiles.length}\n`);

            // 显示每个步骤的文件大小和内容概览
            console.log('📋 Step-by-step file overview:');
            
            const stepNumbers = new Set();
            files.forEach(file => {
                const match = file.match(/step-(\d+)-/);
                if (match) stepNumbers.add(parseInt(match[1]));
            });

            Array.from(stepNumbers).sort((a, b) => (a as number) - (b as number)).forEach((stepNum: any) => {
                console.log(`\n   📌 Step ${stepNum}:`);
                
                const stepMarkdown = files.find(f => f.includes(`step-${String(stepNum).padStart(3, '0')}`) && f.endsWith('.md'));
                const stepJson = files.find(f => f.includes(`step-${String(stepNum).padStart(3, '0')}`) && f.endsWith('.json'));
                
                if (stepMarkdown) {
                    const mdPath = path.join(stepDir, stepMarkdown);
                    const mdStats = fs.statSync(mdPath);
                    const sizeKB = (mdStats.size / 1024).toFixed(1);
                    console.log(`      📝 Markdown: ${stepMarkdown} (${sizeKB} KB)`);
                    
                    // 显示文件的前几行作为预览
                    try {
                        const content = fs.readFileSync(mdPath, 'utf-8');
                        const lines = content.split('\n');
                        const promptSection = lines.findIndex(line => line.includes('**Prompt:**'));
                        if (promptSection !== -1 && lines[promptSection + 2]) {
                            const preview = lines[promptSection + 2].substring(0, 80);
                            console.log(`      👀 Preview: ${preview}...`);
                        }
                    } catch (error) {
                        console.log(`      ❌ Error reading file: ${error}`);
                    }
                }
                
                if (stepJson) {
                    const jsonPath = path.join(stepDir, stepJson);
                    const jsonStats = fs.statSync(jsonPath);
                    const sizeKB = (jsonStats.size / 1024).toFixed(1);
                    console.log(`      🔗 JSON: ${stepJson} (${sizeKB} KB)`);
                }
            });

            // 提供使用建议
            console.log('\n💡 How to use these files:');
            console.log('   1. 📖 Open Markdown files to read human-friendly prompt evolution');
            console.log('   2. 🔍 Compare consecutive steps to see context growth');
            console.log('   3. 📊 Use JSON files for programmatic analysis');
            console.log('   4. 🎯 Identify optimization opportunities in prompt length');
            console.log('   5. 🔧 Adjust maxConversationHistory/maxExecutionHistory based on growth');

            // 简单的增长分析
            try {
                const promptLengths: number[] = [];
                
                Array.from(stepNumbers).sort((a, b) => (a as number) - (b as number)).forEach((stepNum: any) => {
                    const stepJson = files.find(f => f.includes(`step-${String(stepNum).padStart(3, '0')}`) && f.endsWith('.json'));
                    if (stepJson) {
                        const jsonPath = path.join(stepDir, stepJson);
                        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                        if (jsonData.steps && jsonData.steps[0] && jsonData.steps[0].prompt) {
                            promptLengths.push(jsonData.steps[0].prompt.length);
                        }
                    }
                });

                if (promptLengths.length > 1) {
                    console.log('\n📈 Quick growth analysis:');
                    promptLengths.forEach((length, index) => {
                        const kb = (length / 1024).toFixed(1);
                        const growth = index > 0 ? length - promptLengths[index - 1] : 0;
                        const growthPercent = index > 0 ? ((growth / promptLengths[index - 1]) * 100).toFixed(1) : '0';
                        console.log(`   Step ${index}: ${length} chars (${kb} KB) ${index > 0 ? `[+${growth} chars, +${growthPercent}%]` : ''}`);
                    });
                }
            } catch (error) {
                console.log('   ℹ️  Could not perform growth analysis');
            }

        } else {
            console.log('❌ Step prompts directory not found');
        }

    } catch (error) {
        console.error('❌ Example failed:', error);
    } finally {
        await globalEventBus.stop();
    }
}

stepPromptSavingExample().catch(console.error); 