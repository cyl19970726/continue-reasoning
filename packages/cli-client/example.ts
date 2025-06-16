/**
 * CLI Client 使用示例
 * 
 * 展示如何使用新的 CLI Client 实现 IClient 接口
 */

import { 
  CLIClient, 
  createCLIClient, 
  createCLIClientWithSession,
  startCLIClient,
  formatThinking,
  formatFinalAnswer,
  formatToolCallStart,
  formatToolCallResult
} from './src/index';

// 模拟 SessionManager
class MockSessionManager {
  private sessions: Set<string> = new Set();

  createSession(userId?: string): string {
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.sessions.add(sessionId);
    return sessionId;
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  sendMessageToAgent(message: string, maxSteps: number, sessionId: string): string {
    console.log(`📤 Sending to agent (session: ${sessionId}): ${message}`);
    
    // 模拟 Agent 响应
    setTimeout(() => {
      this.simulateAgentResponse(message, sessionId);
    }, 1000);
    
    return sessionId;
  }

  private simulateAgentResponse(userMessage: string, sessionId: string): void {
    // 模拟思考过程
    console.log(formatThinking('分析用户的问题，准备制定解决方案...'));
    
    setTimeout(() => {
      // 模拟工具调用
      console.log(formatToolCallStart('search', { query: userMessage, limit: 5 }));
      
      setTimeout(() => {
        // 模拟工具结果
        console.log(formatToolCallResult('找到了相关信息', true));
        
        setTimeout(() => {
          // 模拟最终回复
          console.log(formatFinalAnswer(`根据您的问题"${userMessage}"，我已经为您找到了相关信息。这是一个很好的问题！`));
        }, 500);
      }, 1500);
    }, 1000);
  }
}

async function basicExample() {
  console.log('🚀 基本使用示例\n');
  
  const client = createCLIClient({
    name: 'Example CLI Client',
    enableColors: true,
    enableTimestamps: true,
    promptPrefix: '❯'
  });

  console.log(`✅ 创建了客户端: ${client.name}`);
  console.log(`📊 客户端统计:`, client.getStats());
}

async function sessionManagerExample() {
  console.log('\n🔗 SessionManager 集成示例\n');
  
  const sessionManager = new MockSessionManager();
  
  const client = createCLIClientWithSession(sessionManager, {
    name: 'Session-Enabled CLI',
    userId: 'demo-user',
    enableColors: true
  });

  console.log(`✅ 创建了带会话管理的客户端: ${client.name}`);
  console.log(`🆔 当前会话: ${client.currentSessionId}`);
  console.log(`📈 活跃会话数: ${sessionManager.getSessionCount()}`);

  // 模拟 IClient 接口调用
  console.log('\n🤖 模拟 Agent 交互:');
  
  // 模拟 Agent 步骤
  client.handleAgentStep({
    stepIndex: 1,
    extractorResult: {
      thinking: '正在分析用户输入...',
      finalAnswer: '我理解了您的需求，让我来帮助您。'
    }
  });

  // 模拟工具调用
  client.handleToolCall({
    type: 'function',
    name: 'file_search',
    call_id: 'call-123',
    parameters: { pattern: '*.ts', directory: './src' }
  });

  // 模拟工具调用结果
  setTimeout(() => {
    client.handleToolCallResult({
      name: 'file_search',
      call_id: 'call-123',
      status: 'succeed',
      result: ['file1.ts', 'file2.ts', 'file3.ts'],
      message: 'Found 3 TypeScript files'
    });
  }, 2000);

  // 发送消息给 Agent
  setTimeout(() => {
    console.log('\n📤 发送消息给 Agent:');
    client.sendMessageToAgent('请帮我分析这些文件', sessionManager);
  }, 3000);
}

async function displayFormattingExample() {
  console.log('\n🎨 显示格式化示例\n');
  
  // 展示各种格式化效果
  console.log('思考格式:');
  console.log(formatThinking('我需要仔细分析这个问题的各个方面...'));
  
  console.log('\n最终回复格式:');
  console.log(formatFinalAnswer('经过分析，我建议您采用以下解决方案...'));
  
  console.log('\n工具调用格式:');
  console.log(formatToolCallStart('bash', 'ls -la'));
  console.log(formatToolCallResult('total 48\ndrwxr-xr-x  12 user  staff   384 Nov 20 10:30 .', true));
}

// 运行示例
async function runExamples() {
  try {
    await basicExample();
    await sessionManagerExample();
    await displayFormattingExample();
    
    console.log('\n✨ 所有示例运行完成！');
    console.log('\n💡 提示: 在实际使用中，您需要:');
    console.log('   1. 提供真实的 SessionManager 实例');
    console.log('   2. 调用 client.start() 启动交互式界面');
    console.log('   3. 使用 createCLIClientWithSession() 进行集成');
    
  } catch (error) {
    console.error('❌ 示例运行出错:', error);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runExamples();
}

export {
  MockSessionManager,
  basicExample,
  sessionManagerExample,
  displayFormattingExample
}; 