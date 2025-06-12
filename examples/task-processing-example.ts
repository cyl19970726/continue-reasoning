import { LogLevel, createThinkingContext, globalEventBus, logger, OPENAI_MODELS } from '@continue-reasoning/core';
import { CodingAgent } from '@continue-reasoning/agents';
import path from 'path';

async function demonstrateTaskProcessing() {
    console.log('🎯 Demonstrating Task Processing System...\n');

    // 启动全局事件总线
    await globalEventBus.start();

    // 创建测试工作空间目录
    const workspacePath = path.join(process.cwd(), 'test-agent');
    
    // 确保测试目录存在
    if (!require('fs').existsSync(workspacePath)) {
        require('fs').mkdirSync(workspacePath, { recursive: true });
        console.log(`📁 Created test workspace: ${workspacePath}`);
    }

    const thinkingContext = createThinkingContext(logger, globalEventBus);
    
    // 🆕 使用专门的 CodingAgent 而不是通用的 BaseAgent
    const agent = new CodingAgent(
        'coding-task-agent',
        'Coding Task Processing Agent',
        'Specialized agent for coding tasks with advanced programming capabilities',
        workspacePath,  // 工作空间路径
        10, // maxSteps
        LogLevel.DEBUG,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: false,
            temperature: 0.7,
            taskConcurency: 3,
            mcpConfigPath: path.join(process.cwd(), 'config', 'mcp.json'),
            promptOptimization: {
                mode: 'standard',
                maxTokens: 8192
            }
        },
        [thinkingContext],  // 额外的contexts（coding context 会自动添加）
        globalEventBus  // 传入事件总线
    );

    console.log('🔧 Setting up agent...');
    await agent.setup();
    console.log('✅ Agent is ready!');

    // 订阅思考事件
    let thinkingEventCount = 0;
    let replyEventCount = 0;
    
    const thinkingSubscriptionId = globalEventBus.subscribe('agent_thinking', async (event: any) => {
        thinkingEventCount++;
        const { stepNumber, thinking, toolCalls } = event.payload;
        
        console.log(`\n🧠 [Step ${stepNumber}] Agent Thinking Process:`);
        
        if (thinking.analysis) {
            console.log(`   📊 Analysis: ${thinking.analysis.substring(0, 150)}${thinking.analysis.length > 150 ? '...' : ''}`);
        }
        
        if (thinking.plan) {
            console.log(`   📋 Plan: ${thinking.plan.substring(0, 150)}${thinking.plan.length > 150 ? '...' : ''}`);
        }
        
        if (thinking.reasoning) {
            console.log(`   🤔 Reasoning: ${thinking.reasoning.substring(0, 150)}${thinking.reasoning.length > 150 ? '...' : ''}`);
        }
        
        if (thinking.nextAction) {
            console.log(`   ⚡ Next Action: ${thinking.nextAction.substring(0, 150)}${thinking.nextAction.length > 150 ? '...' : ''}`);
        }
        
        console.log(`   🔧 Tools to call: ${toolCalls.length} tools`);
        if (toolCalls.length > 0) {
            const toolNames = toolCalls.map((tc: any) => tc.name || tc.function?.name).join(', ');
            console.log(`   🛠️  Tool names: ${toolNames}`);
        }
        console.log(`   📈 Execution Status: ${thinking.executionStatus || 'continue'}`);
        console.log(`   ⏰ Progress: Step ${stepNumber}/20`);
    });

    // 订阅回复事件
    const replySubscriptionId = globalEventBus.subscribe('agent_reply', async (event: any) => {
        replyEventCount++;
        const { content, replyType, metadata } = event.payload;
        
        console.log(`\n💬 [Reply ${replyEventCount}] Agent Communication:`);
        console.log(`   📝 Content: ${content.substring(0, 200)}${content.length > 200 ? '...' : ''}`);
        console.log(`   📊 Type: ${replyType}`);
        
        if (metadata?.confidence) {
            console.log(`   🎯 Confidence: ${metadata.confidence}%`);
        }
        
        if (metadata?.reasoning) {
            console.log(`   💭 Reasoning: ${metadata.reasoning.substring(0, 100)}${metadata.reasoning.length > 100 ? '...' : ''}`);
        }
    });

    // 示例任务 - 更复杂的多步骤任务
    const task = `Create a complete Python web scraping project with the following requirements:

1. **Project Structure**: Create a well-organized project with proper directory structure
2. **Core Module**: Build a web scraper that can extract article titles and links from a news website
3. **Configuration**: Add configuration file support (JSON/YAML) for target URLs and scraping parameters
4. **Data Storage**: Implement data storage functionality (CSV and JSON formats)
5. **Error Handling**: Include comprehensive error handling and logging
6. **Testing**: Write unit tests for the core functionality
7. **Documentation**: Create README.md with installation and usage instructions
8. **Requirements**: Generate requirements.txt with all dependencies
9. **CLI Interface**: Add a command-line interface for easy usage
10. **Validation**: Run the tests to ensure everything works

The project should be production-ready with proper code organization, error handling, and documentation. Use modern Python practices and include type hints where appropriate.`;

    // const task = `Create a simple Python script that calculates the factorial of a number in our test workspace. Please include proper error handling and comments.`;
    console.log('\n📋 Processing complex multi-step task...\n');

    try {
        console.log(`🚀 Starting complex task:\n"${task}"\n`);
        
        // 记录开始时间
        const startTime = Date.now();
        
        // 🆕 启用每步保存 prompt 功能
        const promptSaveOptions = {
            savePromptPerStep: true,                    // 启用prompt文件保存
            promptSaveDir: '.prompt-saving/task-step-prompts',       // 保存目录
            promptSaveFormat: 'both' as const           // 同时保存 markdown 和 json
        };
        
        console.log('📝 Prompt saving enabled:');
        console.log(`   📁 Save directory: ${promptSaveOptions.promptSaveDir}`);
        console.log(`   📋 Save format: ${promptSaveOptions.promptSaveFormat}`);
        console.log('   💾 Will save all prompts after completion for analysis\n');
        
        // 使用更多的步骤来处理复杂任务，并启用 prompt 保存
        await agent.startWithUserInput(task, 40, promptSaveOptions);
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`\n✅ Task processing completed!`);
        console.log(`⏱️  Execution time: ${executionTime}ms`);
        
        // 显示基本统计信息
        console.log('\n📊 Task Processing Performance Analysis:');
        console.log(`   🧠 Total thinking events: ${thinkingEventCount}`);
        console.log(`   💬 Total reply events: ${replyEventCount}`);
        console.log(`   📈 Execution steps: ${agent.currentStep}`);
        console.log(`   ⚡ Average thinking per step: ${thinkingEventCount > 0 ? (thinkingEventCount / Math.max(agent.currentStep, 1)).toFixed(2) : 0}`);
        console.log(`   💭 Communication ratio: ${thinkingEventCount > 0 ? (replyEventCount / thinkingEventCount * 100).toFixed(1) : 0}%`);
        
        // 🆕 添加 Prompt 分析功能
        console.log('\n🔍 Analyzing Prompt Evolution...');
        try {
            // 获取 prompt 处理器统计信息
            const promptStats = agent.getPromptProcessorStats();
            console.log('\n📈 Prompt Processor Statistics:');
            console.log(`   📊 Total messages: ${promptStats.totalMessages}`);
            console.log(`   📏 Current step: ${promptStats.currentStep}`);
            console.log(`   📐 Has final answer: ${promptStats.hasFinalAnswer}`);
            
            if (promptStats.finalAnswer) {
                console.log(`   ✅ Final answer: ${promptStats.finalAnswer.substring(0, 100)}${promptStats.finalAnswer.length > 100 ? '...' : ''}`);
            }

            // 获取当前 prompt 内容用于分析
            const currentPrompt = await agent.getPrompt();
            const promptLength = currentPrompt.length;
            const tokenEstimate = Math.round(promptLength / 4); // Rough token estimation
            
            console.log('\n💡 Prompt Analysis:');
            console.log(`   📏 Current prompt length: ${promptLength} characters`);
            console.log(`   🎯 Estimated tokens: ~${tokenEstimate} tokens`);
            
            if (tokenEstimate > 6000) {
                console.log('   💰 High token usage - consider prompt compression techniques');
            } else if (tokenEstimate > 4000) {
                console.log('   ⚠️  Moderate token usage - monitor for efficiency');
            } else {
                console.log('   ✅ Reasonable token usage');
            }

            // 保存当前 prompt 到文件
            console.log('\n💾 Saving prompt analysis...');
            
            // 创建输出目录
            const outputDir = path.join(process.cwd(), 'task-analysis');
            if (!require('fs').existsSync(outputDir)) {
                require('fs').mkdirSync(outputDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            
            // 保存当前 prompt
            const promptFile = path.join(outputDir, `task-prompt-${timestamp}.md`);
            require('fs').writeFileSync(promptFile, `# Task Processing Prompt Analysis\n\n**Generated:** ${new Date().toISOString()}\n**Task:** ${task.substring(0, 200)}...\n**Steps:** ${agent.currentStep}\n**Prompt Length:** ${promptLength} characters\n\n## Current Prompt\n\n\`\`\`\n${currentPrompt}\n\`\`\``);
            console.log(`   📝 Current prompt saved: ${promptFile}`);
            
            // 保存统计信息
            const statsFile = path.join(outputDir, `task-stats-${timestamp}.json`);
            const stats = {
                timestamp: new Date().toISOString(),
                task: task,
                executionTime,
                thinkingEventCount,
                replyEventCount,
                currentStep: agent.currentStep,
                promptStats,
                promptLength,
                tokenEstimate
            };
            require('fs').writeFileSync(statsFile, JSON.stringify(stats, null, 2));
            console.log(`   🔗 Statistics saved: ${statsFile}`);

            console.log(`\n📁 All analysis files saved in: ${outputDir}`);
            
            // 🆕 提供每步保存文件的信息
            console.log(`\n📋 Step prompt files saved in: ${promptSaveOptions.promptSaveDir}`);
            console.log('   📝 Each step has individual Markdown and JSON files');
            console.log('   🔍 Review step-by-step prompt evolution');
            console.log('   📊 Compare prompt changes between consecutive steps');
            console.log('   💡 Identify specific points where prompt optimization is needed');
            
            // 检查每步文件是否存在
            try {
                const stepFiles = require('fs').readdirSync(promptSaveOptions.promptSaveDir);
                const markdownFiles = stepFiles.filter((f: string) => f.endsWith('.md')).length;
                const jsonFiles = stepFiles.filter((f: string) => f.endsWith('.json')).length;
                console.log(`   📄 Generated files: ${markdownFiles} Markdown, ${jsonFiles} JSON`);
            } catch (error) {
                console.log('   ℹ️  Step files directory not found or empty');
            }
            
        } catch (error) {
            console.error(`   ❌ Error during prompt analysis: ${error}`);
        }
        
        // 检查工作空间中是否创建了文件
        console.log('\n📁 Analyzing created project structure...');
        try {
            const fs = require('fs');
            const path = require('path');
            
            function analyzeDirectory(dir: string, prefix: string = ''): void {
                const files = fs.readdirSync(dir).sort();
                
                files.forEach((file: string, index: number) => {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    const isLast = index === files.length - 1;
                    const connector = isLast ? '└──' : '├──';
                    
                    if (stats.isDirectory()) {
                        console.log(`${prefix}${connector} 📁 ${file}/`);
                        const newPrefix = prefix + (isLast ? '    ' : '│   ');
                        analyzeDirectory(filePath, newPrefix);
                    } else {
                        const sizeKB = (stats.size / 1024).toFixed(1);
                        const extension = path.extname(file);
                        let icon = '📄';
                        
                        // 根据文件类型选择图标
                        if (extension === '.py') icon = '🐍';
                        else if (extension === '.md') icon = '📖';
                        else if (extension === '.json') icon = '⚙️';
                        else if (extension === '.yaml' || extension === '.yml') icon = '⚙️';
                        else if (extension === '.txt') icon = '📝';
                        else if (extension === '.csv') icon = '📊';
                        
                        console.log(`${prefix}${connector} ${icon} ${file} (${sizeKB} KB)`);
                    }
                });
            }
            
            const files = fs.readdirSync(workspacePath);
            if (files.length > 0) {
                console.log('   ✅ Project structure created:');
                analyzeDirectory(workspacePath, '      ');
                
                // 统计文件类型
                const fileStats: {[key: string]: number} = {};
                function countFiles(dir: string): void {
                    const files = fs.readdirSync(dir);
                    files.forEach((file: string) => {
                        const filePath = path.join(dir, file);
                        const stats = fs.statSync(filePath);
                        if (stats.isDirectory()) {
                            countFiles(filePath);
                        } else {
                            const ext = path.extname(file) || 'no-extension';
                            fileStats[ext] = (fileStats[ext] || 0) + 1;
                        }
                    });
                }
                countFiles(workspacePath);
                
                console.log('\n   📊 File type summary:');
                Object.entries(fileStats).forEach(([ext, count]) => {
                    console.log(`      ${ext}: ${count} file(s)`);
                });
                
            } else {
                console.log('   ℹ️  No files created in workspace');
            }
        } catch (error) {
            console.log(`   ⚠️  Error analyzing workspace: ${error}`);
        }
        
        // 任务完成度评估
        console.log('\n🎯 Task Completion Assessment:');
        const taskRequirements = [
            'Project Structure',
            'Core Module', 
            'Configuration',
            'Data Storage',
            'Error Handling',
            'Testing',
            'Documentation',
            'Requirements',
            'CLI Interface',
            'Validation'
        ];
        
        try {
            const fs = require('fs');
            const completedRequirements: string[] = [];
            
            // 检查项目结构
            if (fs.existsSync(path.join(workspacePath, 'src')) || 
                fs.existsSync(path.join(workspacePath, 'scraper')) ||
                fs.readdirSync(workspacePath).some((f: string) => f.endsWith('.py'))) {
                completedRequirements.push('Project Structure');
            }
            
            // 检查核心模块
            if (fs.readdirSync(workspacePath).some((f: string) => f.includes('scrap') && f.endsWith('.py'))) {
                completedRequirements.push('Core Module');
            }
            
            // 检查配置文件
            if (fs.readdirSync(workspacePath).some((f: string) => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml'))) {
                completedRequirements.push('Configuration');
            }
            
            // 检查文档
            if (fs.readdirSync(workspacePath).some((f: string) => f.toLowerCase().includes('readme'))) {
                completedRequirements.push('Documentation');
            }
            
            // 检查requirements
            if (fs.readdirSync(workspacePath).some((f: string) => f.includes('requirements'))) {
                completedRequirements.push('Requirements');
            }
            
            // 检查测试文件
            if (fs.readdirSync(workspacePath).some((f: string) => f.includes('test') && f.endsWith('.py'))) {
                completedRequirements.push('Testing');
            }
            
            const completionRate = (completedRequirements.length / taskRequirements.length * 100).toFixed(1);
            console.log(`   📋 Requirements completed: ${completedRequirements.length}/${taskRequirements.length} (${completionRate}%)`);
            
            completedRequirements.forEach(req => {
                console.log(`   ✅ ${req}`);
            });
            
            const remainingRequirements = taskRequirements.filter(req => !completedRequirements.includes(req));
            if (remainingRequirements.length > 0) {
                console.log('\n   📋 Remaining requirements:');
                remainingRequirements.forEach(req => {
                    console.log(`   ⏳ ${req}`);
                });
            }
            
        } catch (error) {
            console.log(`   ⚠️  Error assessing task completion: ${error}`);
        }
        
    } catch (error) {
        console.error(`❌ Task processing failed: ${error}`);
    } finally {
        // 清理事件订阅
        globalEventBus.unsubscribe(thinkingSubscriptionId);
        globalEventBus.unsubscribe(replySubscriptionId);
        
        // 停止事件总线
        await globalEventBus.stop();
    }

    console.log('\n🎉 Task processing demonstration completed!');
}

// 运行示例
if (require.main === module) {
    demonstrateTaskProcessing()
        .then(() => {
            console.log('\n✨ Example completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

export { demonstrateTaskProcessing }; 