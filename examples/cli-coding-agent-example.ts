import { LogLevel, globalEventBus, logger, OPENAI_MODELS, DEEPSEEK_MODELS } from '@continue-reasoning/core';
import { CodingAgent } from '@continue-reasoning/agents';
import { createCLIClient, createCLIClientWithSession } from '../packages/cli-client/src/index';
import { SessionManager } from '../packages/core/session/sessionManager';
import path from 'path';
import fs from 'fs';

/**
 * CLI + CodingAgent 集成示例
 * 
 * 展示如何将 CLI Client 与 CodingAgent 结合，创建一个交互式的编程助手
 */
async function cliCodingAgentExample() {
    console.log('🚀 CLI + CodingAgent Integration Example\n');
    
    // 设置工作空间
    const workspacePath = path.join(process.cwd(), 'cli-coding-workspace');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
        console.log(`📁 Created workspace: ${workspacePath}`);
    }

    try {
        // 🤖 创建 CodingAgent
        console.log('🤖 Creating CodingAgent...');
        const agent = new CodingAgent(
            'cli-coding-agent',
            'Interactive Coding Assistant',
            'A coding agent that works through CLI interface for interactive development',
            workspacePath,
            500, // 允许更多步骤进行交互
            LogLevel.NONE,
            {
                model: OPENAI_MODELS.O3,
                enableParallelToolCalls: true,
                temperature: 0.1,
            },
            [],
        );

        // 🔗 创建 SessionManager
        console.log('🔗 Creating SessionManager...');
        const sessionManager = new SessionManager(agent);
        
        // 🖥️ 创建 CLI Client 并设置 SessionManager
        console.log('🖥️  Creating CLI Client with SessionManager...');
        const client = createCLIClientWithSession(sessionManager, {
            name: 'Coding Assistant CLI',
            userId: 'developer',
            agentId: 'cli-coding-agent',
            enableColors: true,
            enableTimestamps: true,
            enableHistory: true,
            historyFile: path.join(workspacePath, '.cli_history'),
            promptPrefix: '💻',
            multilineDelimiter: '```',
            maxSteps: 50
        });
        
        // 🔍 调试：确认 SessionManager 是否正确设置
        console.log('🔍 Debug: SessionManager setup verification');
        console.log('  - SessionManager created:', !!sessionManager);
        console.log('  - Client has sessionManager:', !!client.sessionManager);
        console.log('  - Current session ID:', client.currentSessionId);

        // 🛠️ 设置 Agent
        console.log('🛠️  Setting up Agent...');
        await agent.setup();
        
        // 配置工具调用策略（第一步不使用工具，后续步骤可以使用）
        agent.setEnableToolCallsForStep((stepIndex) => {
            return stepIndex > 0;
        });

        // 🚀 启动 CLI Client（这会开始交互式会话）
        await client.start();

    } catch (error) {
        console.error('❌ Example failed:', error);
        
    } finally {
        // 清理资源
        try {
            console.log('🧹 Cleanup completed');
        } catch (cleanupError) {
            console.error('⚠️  Cleanup error:', cleanupError);
        }
    }
}

/**
 * 演示模式 - 自动执行一些示例任务
 */
async function demoMode() {
    console.log('🎬 Demo Mode: Automated Coding Tasks\n');
    
    const workspacePath = path.join(process.cwd(), 'demo-coding-workspace');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    try {
        // 创建 Agent
        const agent = new CodingAgent(
            'demo-coding-agent',
            'Demo Coding Assistant',
            'Automated demo of coding capabilities',
            workspacePath,
            20,
            LogLevel.NONE,
            {
                model: OPENAI_MODELS.GPT_4O_MINI,
                enableParallelToolCalls: false,
                temperature: 0.1,
            },
            [],
        );

        // 创建 SessionManager
        const sessionManager = new SessionManager(agent);

        // 创建 CLI Client 并设置 SessionManager
        const client = createCLIClientWithSession(sessionManager, {
            name: 'Demo CLI',
            userId: 'demo-user',
            agentId: 'demo-coding-agent',
            enableColors: true,
            enableTimestamps: true,
            maxSteps: 20
        });

        await agent.setup();
        agent.setEnableToolCallsForStep((stepIndex) => stepIndex > 0);

        // 演示任务列表
        const demoTasks = [
            {
                name: 'Simple Python Script',
                task: 'Create a simple Python script that calculates the factorial of a number and saves the result to a file.'
            },
            {
                name: 'JavaScript Utility Function',
                task: 'Write a JavaScript utility function that validates email addresses and includes unit tests.'
            },
            {
                name: 'HTML/CSS Landing Page',
                task: 'Create a simple HTML landing page with CSS styling for a fictional product.'
            }
        ];

        console.log('🎯 Running automated demo tasks...\n');

        for (let i = 0; i < demoTasks.length; i++) {
            const { name, task } = demoTasks[i];
            
            console.log(`\n${'='.repeat(50)}`);
            console.log(`📋 Demo Task ${i + 1}: ${name}`);
            console.log(`${'='.repeat(50)}`);
            console.log(`📝 Task: ${task}\n`);

            // 创建新会话
            const sessionId = sessionManager.createSession('demo-user', 'demo-coding-agent');
            
            // 发送任务给 Agent
            await new Promise<void>((resolve) => {
                // 设置完成监听
                const originalHandleAgentStep = client.handleAgentStep.bind(client);
                let stepCount = 0;
                
                client.handleAgentStep = (step: any) => {
                    originalHandleAgentStep(step);
                    stepCount++;
                    
                    // 如果有最终答案，认为任务完成
                    if (step.extractorResult?.finalAnswer) {
                        console.log(`\n✅ Task ${i + 1} completed in ${stepCount} steps\n`);
                        client.handleAgentStep = originalHandleAgentStep;
                        setTimeout(resolve, 1000); // 给一点时间显示结果
                    }
                };
                
                // 发送任务
                sessionManager.sendMessageToAgent(task, 15, sessionId);
            });

            // 任务间暂停
            if (i < demoTasks.length - 1) {
                console.log('⏳ Preparing next task...\n');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        console.log('\n🎉 All demo tasks completed!');
        console.log(`📁 Check the workspace: ${workspacePath}`);

    } catch (error) {
        console.error('❌ Demo failed:', error);
    }
}

/**
 * 主函数 - 选择运行模式
 */
async function main() {
    const args = process.argv.slice(2);
    const mode = args[0] || 'interactive';

    switch (mode) {
        case 'demo':
            await demoMode();
            break;
        case 'interactive':
        default:
            await cliCodingAgentExample();
            break;
    }
}

// 运行示例
if (require.main === module) {
    main().catch(console.error);
}

export { cliCodingAgentExample, demoMode }; 