import { BaseAgent } from '../src/core/agent';
import { CliClient } from '../src/core/contexts/client';
import { LogLevel } from '../src/core/utils/logger';
import { createCodingContext } from '../src/core/contexts/coding';
import { ToolCallContext } from '../src/core/contexts/tool';
import { InteractiveContext } from '../src/core/contexts/interaction/interactive';
import { PlanContext } from '../src/core/contexts/plan';
import { UserInputContext } from '../src/core/contexts/interaction/userInput';
import { ExecuteToolsContext } from '../src/core/contexts/execute';
import { globalEventBus } from '../src/core/events/eventBus';
import path from 'path';
import { ANTHROPIC_MODELS, GOOGLE_MODELS, OPENAI_MODELS } from '@/core/models';

async function demonstrateTaskProcessing() {
    console.log('🎯 Demonstrating Task Processing System with Thinking...\n');

    // 启动全局事件总线
    await globalEventBus.start();
    
    // 创建测试工作空间目录
    const workspacePath = path.join(process.cwd(), 'test-agent');
    
    // 确保测试目录存在
    if (!require('fs').existsSync(workspacePath)) {
        require('fs').mkdirSync(workspacePath, { recursive: true });
        console.log(`📁 Created test workspace: ${workspacePath}`);
    }

    const codingContext = createCodingContext(workspacePath);
    
    // 创建包含必要 Context 的列表
    const contexts = [
        // ToolCallContext,
        // UserInputContext,
        // PlanContext,
        codingContext,
        // ExecuteToolsContext,
        // InteractiveContext
    ];

    // 创建 Agent（启用思考系统）
    const agent = new BaseAgent(
        'task-agent',
        'Task Processing Agent',
        'Agent specialized in task processing and execution with thinking capabilities',
        [],
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
            },
            // 启用思考系统
            enableThinkingSystem: true,
            thinkingOptions: {
                maxConversationHistory: 10,
                maxExecutionHistory: 5
            }
        },
        contexts,
        globalEventBus  // 传入事件总线
    );

    console.log('🔧 Setting up agent...');
    await agent.setup();

    // 检查思考系统是否启用
    if (agent.isThinkingEnabled()) {
        console.log('✅ Agent is ready with thinking system enabled!');
    } else {
        console.error('❌ Agent thinking system is not enabled');
        return;
    }

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

    console.log('\n📋 Processing complex multi-step task with thinking system...\n');

    try {
        console.log(`🚀 Starting complex task:\n"${task}"\n`);
        
        // 记录开始时间
        const startTime = Date.now();
        
        // 使用更多的步骤来处理复杂任务
        await agent.startWithUserInput(task, 20); // 增加到20步
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;
        
        console.log(`\n✅ Task processing completed!`);
        console.log(`⏱️  Execution time: ${executionTime}ms`);
        
        // 显示思考系统统计信息
        const thinkingStats = agent.getThinkingStats();
        if (thinkingStats && !thinkingStats.error) {
            console.log('\n📊 Thinking System Performance Analysis:');
            console.log(`   🧠 Total thinking events: ${thinkingEventCount}`);
            console.log(`   💬 Total reply events: ${replyEventCount}`);
            console.log(`   📈 Execution steps: ${thinkingStats.execution?.totalSteps || 0}`);
            console.log(`   💬 Conversation messages: ${thinkingStats.conversation?.totalMessages || 0}`);
            console.log(`   ⚡ Average thinking per step: ${thinkingEventCount > 0 ? (thinkingEventCount / Math.max(thinkingStats.execution?.totalSteps || 1, 1)).toFixed(2) : 0}`);
            console.log(`   💭 Communication ratio: ${thinkingEventCount > 0 ? (replyEventCount / thinkingEventCount * 100).toFixed(1) : 0}%`);
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