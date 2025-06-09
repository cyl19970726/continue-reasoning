#!/usr/bin/env npx tsx

/**
 * 启动增强的 CLI 客户端（包含对话历史功能）
 */

import { CLIClient, EventBus, logger } from '@continue-reasoning/core';

async function startEnhancedCLI() {
  console.log('🚀 Starting Enhanced CLI with Conversation History...\n');

  try {
    // 创建事件总线
    console.log('📡 Creating EventBus...');
    const eventBus = new EventBus();
    await eventBus.start();
    console.log('✅ EventBus started successfully');
    
    // 创建增强的CLI客户端
    console.log('🖥️  Creating Enhanced CLI Client...');
    const cli = CLIClient.createDefault(eventBus);
    
    // 设置用户ID（可以通过环境变量或命令行参数自定义）
    const userId = process.env.CLI_USER_ID || 'cli-user';
    cli.setUserId(userId);
    console.log(`👤 User ID set to: ${userId}`);
    
    // 启动CLI
    console.log('🎯 Starting CLI Client...');
    await cli.start();
    console.log('✅ Enhanced CLI Client started successfully');
    
    console.log('\n🎉 CLI is ready! You can now interact with the system.');
    console.log('💡 Type /help for available commands');
    console.log('🧠 Conversation history is automatically enabled');
    
    // 处理优雅退出
    process.on('SIGINT', async () => {
      console.log('\n\n👋 Goodbye! Shutting down gracefully...');
      try {
        await cli.stop();
        await eventBus.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    process.on('SIGTERM', async () => {
      console.log('\n\n🔄 Received SIGTERM, shutting down gracefully...');
      try {
        await cli.stop();
        await eventBus.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    // 处理未捕获的异常
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught Exception:', error);
      try {
        await cli.stop();
        await eventBus.stop();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      try {
        await cli.stop();
        await eventBus.stop();
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError);
      }
      process.exit(1);
    });
    
    // 防止进程退出
    process.stdin.resume();
    
  } catch (error) {
    console.error('❌ Failed to start Enhanced CLI:', error);
    process.exit(1);
  }
}

// 运行启动脚本
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  startEnhancedCLI().catch(console.error);
}

export { startEnhancedCLI }; 