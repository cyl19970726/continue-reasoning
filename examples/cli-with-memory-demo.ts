#!/usr/bin/env npx tsx

/**
 * 演示增强的 CLI 客户端对话历史功能
 */

import { CLIClient, EventBus, logger } from '@continue-reasoning/core';

async function demonstrateEnhancedCLI() {
  console.log('🎬 Enhanced CLI with Conversation History - Demo');
  console.log('=' .repeat(60));

  try {
    // 1. 创建和启动系统
    console.log('\n🚀 Setting up Enhanced CLI System...');
    
    const eventBus = new EventBus();
    await eventBus.start();
    
    // 创建增强的CLI客户端（包含对话历史功能）
    const cli = CLIClient.createDefault(eventBus);
    
    // 设置用户信息
    cli.setUserId('demo-user-001');
    
    await cli.start();
    
    console.log('✅ Enhanced CLI System started successfully!');
    console.log('📡 EventBus running');
    console.log('🧠 Conversation History enabled');
    console.log('💾 Interactive Memory ready');
    
    // 2. 模拟对话历史交互（自动模式）
    console.log('\n' + '─'.repeat(60));
    console.log('🎭 Simulating Conversation History Features...');
    
    // 获取内存实例
    const memory = cli.getInteractiveMemory();
    
    // 模拟一些对话记录
    const sessionId = cli.getCurrentSession();
    
    // 记录用户消息
    await memory.recordConversation({
      sessionId,
      userId: 'demo-user-001',
      agentId: 'demo-agent',
      type: 'user_message',
      role: 'user',
      content: '你好，我需要帮助创建一个 React 组件'
    });
    
    // 记录Agent回复
    await memory.recordConversation({
      sessionId,
      userId: 'demo-user-001',
      agentId: 'demo-agent',
      type: 'agent_reply',
      role: 'agent',
      content: '当然可以！我可以帮你创建 React 组件。你想创建什么类型的组件？'
    });
    
    // 记录更多对话
    await memory.recordConversation({
      sessionId,
      userId: 'demo-user-001',
      agentId: 'demo-agent',
      type: 'user_message',
      role: 'user',
      content: '我需要一个用户登录表单组件，包含用户名和密码输入框'
    });
    
    await memory.recordConversation({
      sessionId,
      userId: 'demo-user-001',
      agentId: 'demo-agent',
      type: 'agent_reply',
      role: 'agent',
      content: '好的，我来为你创建一个登录表单组件。我会包含用户名和密码字段，以及基本的验证功能。'
    });
    
    console.log('📝 Simulated conversation history created');
    
    // 3. 展示对话历史功能
    console.log('\n📚 Demonstrating Conversation History Features:');
    
    // 获取对话历史
    const history = await memory.getConversationHistory(sessionId, 10);
    console.log(`\n💬 Conversation History (${history.length} messages):`);
    console.log('─'.repeat(50));
    
    history.forEach((record, index) => {
      const timestamp = new Date(record.timestamp).toLocaleTimeString();
      const roleIcon = record.role === 'user' ? '👤' : record.role === 'agent' ? '🤖' : '⚙️';
      console.log(`${index + 1}. [${timestamp}] ${roleIcon} ${record.role}:`);
      console.log(`   ${record.content}`);
      console.log('');
    });
    
    // 4. 展示搜索功能
    console.log('🔍 Demonstrating Search Functionality:');
    
    const searchResults = await memory.searchConversations('React', {
      sessionId,
      limit: 5
    });
    
    console.log(`\n📋 Search Results for "React" (${searchResults.length} matches):`);
    searchResults.forEach((record, index) => {
      const roleIcon = record.role === 'user' ? '👤' : '🤖';
      console.log(`${index + 1}. ${roleIcon} ${record.role}: ${record.content}`);
    });
    
    // 5. 展示统计信息
    console.log('\n📊 Memory Statistics:');
    
    const memoryStats = (memory as any).getMemoryStats();
    console.log(`Total Conversations: ${memoryStats.totalConversations}`);
    console.log(`Total Sessions: ${memoryStats.totalSessions}`);
    console.log(`Average Messages/Session: ${memoryStats.averageConversationsPerSession.toFixed(1)}`);
    console.log(`Memory Usage: ${memoryStats.memoryUsage}`);
    
    // 6. 展示会话信息
    console.log('\n🏷️ Session Information:');
    console.log(`Session ID: ${sessionId}`);
    console.log(`User ID: demo-user-001`);
    console.log(`Execution Mode: auto`);
    console.log(`Memory Instance: ${memory.id}`);
    
    // 7. 模拟持久化保存
    console.log('\n💾 Demonstrating Persistence:');
    const saveFile = './demo-conversation-history.json';
    await (memory as any).saveToPersistentStorage(saveFile);
    console.log(`✅ Conversation history saved to: ${saveFile}`);
    
    // 8. 性能测试
    console.log('\n⚡ Performance Test:');
    const startTime = Date.now();
    
    // 快速记录100条消息
    for (let i = 1; i <= 100; i++) {
      await memory.recordConversation({
        sessionId,
        userId: 'demo-user-001',
        agentId: 'demo-agent',
        type: i % 2 === 0 ? 'user_message' : 'agent_reply',
        role: i % 2 === 0 ? 'user' : 'agent',
        content: `Performance test message ${i}`
      });
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`📈 Performance Results:`);
    console.log(`   Messages: 100`);
    console.log(`   Time: ${duration}ms`);
    console.log(`   Average: ${(duration / 100).toFixed(2)}ms per message`);
    console.log(`   Rate: ${(100 / (duration / 1000)).toFixed(1)} messages/second`);
    
    // 9. 最终统计
    const finalStats = (memory as any).getMemoryStats();
    console.log('\n📊 Final Statistics:');
    console.log(`Total Conversations: ${finalStats.totalConversations}`);
    console.log(`Memory Usage: ${finalStats.memoryUsage}`);
    
    console.log('\n🎉 Demo completed successfully!');
    console.log('\n💡 Key Features Demonstrated:');
    console.log('  ✓ Automatic conversation recording');
    console.log('  ✓ Conversation history retrieval');
    console.log('  ✓ Content search functionality');
    console.log('  ✓ Memory statistics and monitoring');
    console.log('  ✓ Persistent storage capabilities');
    console.log('  ✓ High-performance message handling');
    
    console.log('\n🚀 To start the interactive CLI:');
    console.log('  npx tsx examples/start-enhanced-cli.ts');
    
    // 清理
    await cli.stop();
    await eventBus.stop();
    
  } catch (error) {
    console.error('❌ Demo failed:', error);
    process.exit(1);
  }
}

// 运行演示
if (require.main === module || import.meta.url === `file://${process.argv[1]}`) {
  demonstrateEnhancedCLI().catch(console.error);
}

export { demonstrateEnhancedCLI }; 