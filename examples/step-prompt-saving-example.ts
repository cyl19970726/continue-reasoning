import { createEnhancedPromptProcessor, LogLevel, OPENAI_MODELS, EventBus, IEventBus, AgentEvent, ToolEvent } from '../packages/core/index.js';
import { CodingAgent } from '../packages/agents/coding-agent.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 设置事件监听器来显示 Agent 执行过程
 */
function setupEventListeners(eventBus: IEventBus) {
    console.log('🎧 Setting up event listeners for execution monitoring...\n');
    
    // 监听 Agent 步骤完成事件
    eventBus.subscribe('agent.step.completed', (event: AgentEvent) => {
        if (event.type === 'agent.step.completed') {
            console.log(`\n📋 Step ${event.stepIndex} completed:`);
            if (event.data?.step?.extractorResult?.response) {
                const response = event.data.step.extractorResult.response;
                const preview = response.length > 200 ? response.substring(0, 200) + '...' : response;
                console.log(`   💭 Agent Response: ${preview}`);
            }
            if (event.data?.step?.toolExecutionResults?.length && event.data.step.toolExecutionResults.length > 0) {
                console.log(`   🔧 Tools used: ${event.data.step.toolExecutionResults.length}`);
                // 显示工具名称
                const toolNames = event.data.step.toolExecutionResults.map(result => result.name);
                console.log(`   🛠️  Tool names: ${toolNames.join(', ')}`);
            }
            if (event.data?.step?.rawText) {
                const rawText = event.data.step.rawText;
                if (rawText.length > 0) {
                    console.log(`   📝 Raw text length: ${rawText.length} characters`);
                }
            }
        }
    });
    
    // 监听工具执行开始事件
    eventBus.subscribe('tool.execution.started', (event: ToolEvent) => {
        if (event.type === 'tool.execution.started' && event.data?.toolCall) {
            console.log(`\n🔧 Executing tool: ${event.data.toolCall.name}`);
            if (event.data.toolCall.parameters) {
                const params = JSON.stringify(event.data.toolCall.parameters, null, 2);
                const preview = params.length > 100 ? params.substring(0, 100) + '...' : params;
                console.log(`   📥 Parameters: ${preview}`);
            }
        }
    });
    
    // 监听工具执行完成事件
    eventBus.subscribe('tool.execution.completed', (event: ToolEvent) => {
        if (event.type === 'tool.execution.completed' && event.data?.result) {
            const result = event.data.result;
            console.log(`   ✅ Tool ${result.name} completed`);
            if (result.message) {
                const preview = result.message.length > 150 ? result.message.substring(0, 150) + '...' : result.message;
                console.log(`   📤 Result: ${preview}`);
            }
        }
    });
    
    // 监听工具执行失败事件
    eventBus.subscribe('tool.execution.failed', (event: ToolEvent) => {
        if (event.type === 'tool.execution.failed' && event.data?.result) {
            console.log(`   ❌ Tool ${event.data.result.name} failed: ${event.data.result.message}`);
        }
    });
    
    // 监听 Agent 停止事件
    eventBus.subscribe('agent.stopped', (event: AgentEvent) => {
        if (event.type === 'agent.stopped') {
            console.log(`\n🛑 Agent stopped: ${event.data?.reason || 'Task completed'}`);
        }
    });
    
    // 监听会话开始事件
    eventBus.subscribe('session.started', (event: any) => {
        if (event.type === 'session.started') {
            console.log(`\n🚀 Session started: ${event.sessionId}`);
        }
    });
    
    // 监听会话结束事件
    eventBus.subscribe('session.ended', (event: any) => {
        if (event.type === 'session.ended') {
            console.log(`\n👋 Session ended: ${event.sessionId}`);
        }
    });
    
    // 监听错误事件
    eventBus.subscribe('error.occurred', (event: any) => {
        if (event.type === 'error.occurred') {
            console.log(`\n❌ Error occurred: ${event.data?.error?.message || 'Unknown error'}`);
        }
    });
    
    console.log('✅ Event listeners configured successfully\n');
}

async function stepPromptSavingExample() {
    console.log('📝 Step-by-Step Prompt Saving Example\n');

    
    const workspacePath = path.join(process.cwd(), 'test-step-prompt-saving-think');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    // 🆕 创建 EventBus 用于事件监听
    console.log('🔗 Setting up event monitoring...');
    const eventBus = new EventBus(1000);
    
    // 设置事件监听器来显示执行过程
    setupEventListeners(eventBus);

    // 🆕 使用 CodingAgent
    const agent = new CodingAgent(
        'step-prompt-demo',
        'Step Prompt Demo Coding Agent',
        'Coding agent for demonstrating step-by-step prompt saving',
        workspacePath,
        5, // 运行5步来生成足够的示例
        LogLevel.DEBUG,
        {
            model: OPENAI_MODELS.GPT_4O,
            enableParallelToolCalls: true,
            temperature: 0.1,
        },
        [],
        eventBus as any // 传递 EventBus
    );

    await agent.setup();
    agent.setEnableToolCallsForStep(() => {
        return true;
    });

    try {
        console.log('🎯 Demo: Creating a simple Python project with step-by-step prompt saving\n');

        // 🆕 配置每步保存选项
        const promptSaveOptions = {
            savePromptPerStep: true,                    // 启用每步保存
            promptSaveDir: './demo-step-prompts-1',       // 保存目录
            promptSaveFormat: 'markdown' as const           // 同时保存 markdown 和 json
        };

        console.log('⚙️  Prompt saving configuration:');
        console.log(`   📁 Directory: ${promptSaveOptions.promptSaveDir}`);
        console.log(`   📋 Format: ${promptSaveOptions.promptSaveFormat}`);
        console.log(`   ⚡ Real-time: Save after each step completion\n`);

        // 🆕 首先创建.snapshotignore文件以避免news_headlines.json破坏状态连续性
        console.log('🛡️  Setting up snapshot ignore rules to prevent state continuity issues...\n');

        // 执行任务
        const task = `
帮我创建一个简单的Python项目，具体要求如下：
1. **项目名称**: Hello World Demo
2. **主要功能**: 创建一个简单的Python脚本，打印问候语并进行基本的文件操作
3. **文件结构**: 
   - main.py (主脚本)
   - requirements.txt (依赖列表)
   - README.md (使用说明)
4. **功能要求**: 
   - 打印欢迎信息
   - 创建一个包含当前时间的文本文件
   - 读取该文件并显示内容
   - 代码要有详细注释
   - 在任务完成之后，请运行 main.py 脚本验证功能正常
`;
        
        console.log('🚀 Starting task with step-by-step prompt saving...\n');
        
        // 🔧 修复：使用正确的参数顺序和类型
        const sessionId = `step-prompt-demo-${Date.now()}`;
        await agent.startWithUserInput(task, 5, sessionId, promptSaveOptions);

        console.log('\n✅ Task completed! Analyzing saved prompts...\n');
        
        // 验证系统提示是否正确包含在第一步中
        console.log('🔍 Verifying system prompt fix...');
        const firstStepPath = path.join(promptSaveOptions.promptSaveDir, 'step-000.md');
        if (fs.existsSync(firstStepPath)) {
            const firstStepContent = fs.readFileSync(firstStepPath, 'utf-8');
            if (firstStepContent.includes('AI Agent Role Definition') || 
                firstStepContent.includes('think') || 
                firstStepContent.includes('reasoning')) {
                console.log('✅ System prompt is correctly included in the first step!');
            } else {
                console.log('❌ System prompt seems to be missing from the first step.');
            }
        } else {
            console.log('⚠️  Could not find first step file to verify system prompt.');
        }
        console.log('');

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
            
            const stepNumbers = new Set<number>();
            files.forEach(file => {
                const match = file.match(/step-(\d+)-/);
                if (match) stepNumbers.add(parseInt(match[1]));
            });

            Array.from(stepNumbers).sort((a, b) => a - b).forEach((stepNum) => {
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
                
                Array.from(stepNumbers).sort((a, b) => a - b).forEach((stepNum) => {
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
    }
}

stepPromptSavingExample().catch(console.error);