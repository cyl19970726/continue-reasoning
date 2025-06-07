/**
 * 🚀 InteractionHub + CLI Client + CodingAgent 集成演示
 * 
 * 展示如何使用新的架构：
 * - InteractionHub 作为中心协调器
 * - CLIClient 作为用户交互层
 * - CodingAgent 提供编程功能
 * - 完整的事件驱动通信
 */

import { EventBus } from '../src/core/events/eventBus';
import { InteractionHub } from '../src/core/hub/interaction-hub'; // 🆕 使用新的 InteractionHub
import { CLIClient } from '../src/core/interactive/cliClient';
import { CodingAgent } from '../src/agents/coding-agent';
import { LogLevel } from '../src/core/utils/logger';
import { OPENAI_MODELS } from '../src/core/models';
import path from 'path';
import { logger } from '../src/core/utils/logger';

async function runInteractionHubDemo() {
    console.log('🚀 Starting InteractionHub Demo...');
    
    try {
        // 1. 创建 EventBus
        const eventBus = new EventBus();
        await eventBus.start();
        console.log('✅ EventBus started');

        // 2. 创建 InteractionHub
        const interactionHub = new InteractionHub(eventBus);
        console.log('✅ InteractionHub created');

        // 3. 创建 CLI Client
        const cliClient = CLIClient.createDefault(eventBus);
        console.log('✅ CLI Client created');

        // 4. 创建 CodingAgent
        const workspacePath = path.join(process.cwd(), 'demo-workspace');
        const codingAgent = new CodingAgent(
            'demo-coding-agent',
            'Demo Coding Agent',
            'A demonstration coding agent for the InteractionHub',
            workspacePath,
            10, // maxSteps
            LogLevel.INFO,
            {
                model: OPENAI_MODELS.GPT_4O_MINI, // 使用更便宜的模型做演示
                enableThinkingSystem: true,
                executionMode: 'manual' // 需要用户批准操作
            }
        );
        console.log('✅ CodingAgent created');

        // 5. 注册组件到 InteractionHub
        await interactionHub.registerAgent(codingAgent);
        await interactionHub.registerInteractiveLayer(cliClient);
        console.log('✅ Components registered to InteractionHub');

        // 6. 设置 CLI Client 的 InteractionHub 引用
        cliClient.setInteractionHub(interactionHub);

        // 7. 启动系统
        await interactionHub.start();
        console.log('🎉 InteractionHub Demo started successfully!');

        // 8. 显示使用说明
        displayUsageInstructions();

        // 9. 设置优雅退出
        setupGracefulShutdown(interactionHub);

        // 10. 让系统运行，等待用户交互
        console.log('\n💡 The system is now running. Try these interactions:');
        console.log('   • Send a message to start working with the agent');
        console.log('   • Use /help to see available commands');
        console.log('   • Try requesting file operations to see approval workflows');
        console.log('   • Use /mode to change execution mode');
        console.log('\n🔥 Ready for interaction! Type your first message...\n');

    } catch (error) {
        logger.error('❌ Failed to start InteractionHub Demo:', error);
        process.exit(1);
    }
}

function displayUsageInstructions() {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 INTERACTION HUB DEMO - USAGE INSTRUCTIONS');
    console.log('='.repeat(80));
    console.log('');
    console.log('📋 This demo showcases:');
    console.log('  • 🏗️  Complete architecture integration');
    console.log('  • 🤝 User interaction workflows (approval/input requests)');
    console.log('  • 🧠 Agent thinking system');
    console.log('  • 📁 File operations with approval');
    console.log('  • 📊 Plan execution tracking');
    console.log('  • ⚡ Real-time event communication');
    console.log('');
    console.log('🔧 Try these example requests:');
    console.log('  1. "Create a simple calculator function"');
    console.log('  2. "Help me organize my project files"');
    console.log('  3. "Write tests for existing code"');
    console.log('  4. "Explain this codebase structure"');
    console.log('');
    console.log('⚙️  Available Commands:');
    console.log('  • /mode [auto|manual|supervised] - Change execution mode');
    console.log('  • /help - Show CLI help');
    console.log('  • /plan - Show plan status');
    console.log('  • /stats - Show system statistics');
    console.log('  • /### - Start multi-line input');
    console.log('  • /file <path> - Load file content');
    console.log('');
    console.log('🛡️  Security Features:');
    console.log('  • All file operations require approval in manual mode');
    console.log('  • Input validation for user requests');
    console.log('  • Risk level assessment for operations');
    console.log('');
    console.log('='.repeat(80));
}

function setupGracefulShutdown(interactionHub: InteractionHub) {
    const shutdown = async () => {
        console.log('\n🛑 Shutting down InteractionHub Demo...');
        try {
            await interactionHub.stop();
            console.log('✅ InteractionHub stopped gracefully');
            process.exit(0);
        } catch (error) {
            logger.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    };

    // 处理各种退出信号
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('SIGQUIT', shutdown);

    // 处理未捕获的异常
    process.on('uncaughtException', async (error) => {
        logger.error('❌ Uncaught exception:', error);
        await shutdown();
    });

    process.on('unhandledRejection', async (reason, promise) => {
        logger.error('❌ Unhandled rejection at:', promise, 'reason:', reason);
        await shutdown();
    });
}

// 演示特定功能的辅助函数
async function demonstrateInteractiveWorkflow(interactionHub: InteractionHub) {
    console.log('\n🎭 Demonstrating Interactive Workflow...');
    
    // 获取系统状态
    const systemStatus = interactionHub.getSystemStatus();
    console.log('📊 System Status:', JSON.stringify(systemStatus, null, 2));

    // 演示健康检查
    const health = interactionHub.checkHealth();
    console.log('🏥 Health Check:', health);

    // 演示事件广播
    await interactionHub.broadcastToAgents('demo_event', {
        message: 'This is a demo broadcast to all agents',
        timestamp: Date.now()
    });

    await interactionHub.broadcastToInteractiveLayers('demo_notification', {
        message: 'This is a demo notification to all interactive layers',
        timestamp: Date.now()
    });

    console.log('✅ Interactive workflow demonstration completed');
}

// 主执行函数
if (require.main === module) {
    runInteractionHubDemo().catch((error) => {
        logger.error('❌ Demo failed:', error);
        process.exit(1);
    });
}

export { runInteractionHubDemo, demonstrateInteractiveWorkflow }; 