import { EventBus, CLIClient, InteractiveCapabilities, OPENAI_MODELS } from '@continue-reasoning/core';

async function demonstrateApprovalWorkflow() {
  console.log('=== Interactive Approval Workflow Example ===\n');
  
  // 1. 创建 EventBus
  const eventBus = new EventBus();
  await eventBus.start();
  
  // 2. 创建 Interactive Layer (CLI Client)
  const cliClient = CLIClient.createDefault(eventBus);
  
  console.log('System initialized. Starting approval workflow demonstration...\n');
  
  // 3. 启动 CLI Client
  await cliClient.start();
  
  // 4. 模拟 approval request 事件
  setTimeout(async () => {
    console.log('🤖 Agent: I need to create a configuration file. Requesting approval...\n');
    
    const sessionId = eventBus.getActiveSessions()[0] || eventBus.createSession();
    
    // 发布 approval request 事件
    await eventBus.publish({
      type: 'approval_request',
      source: 'agent',
      sessionId,
      payload: {
        requestId: 'demo-123',
        actionType: 'file_write',
        description: 'Create database configuration file',
        details: {
          filePaths: ['./config/database.json'],
          riskLevel: 'medium',
          preview: JSON.stringify({
            host: 'localhost',
            port: 5432,
            database: 'myapp',
            ssl: false
          }, null, 2)
        },
        timeout: 30000
      }
    });

    console.log('📤 Approval request sent to CLI client\n');
    
    // 清理
    setTimeout(async () => {
      await cliClient.stop();
      await eventBus.stop();
      console.log('\n=== Demo completed ===');
      process.exit(0);
    }, 10000); // 10秒后自动退出
    
  }, 2000);
  
  return { cliClient, eventBus };
}

// 更简单的示例：直接事件发布
async function simpleApprovalExample() {
  console.log('=== Simple Approval Event Example ===\n');
  
  const eventBus = new EventBus();
  await eventBus.start();
  const sessionId = eventBus.createSession();
  
  let approvalReceived = false;
  
  // 订阅 approval_request 事件
  eventBus.subscribe('approval_request', async (message: any) => {
    console.log('📩 Approval Request Received:');
    console.log(`   Action: ${message.payload.actionType}`);
    console.log(`   Description: ${message.payload.description}`);
    console.log(`   Risk Level: ${message.payload.details.riskLevel}`);
    
    if (message.payload.details.preview) {
      console.log(`   Preview:\n${message.payload.details.preview}`);
    }
    
    // 模拟用户响应 (自动批准以便演示)
    setTimeout(async () => {
      await eventBus.publish({
        type: 'approval_response',
        source: 'user',
        sessionId,
        payload: {
          requestId: message.payload.requestId, // 使用 payload 中的 requestId，而不是 message.id
          decision: 'accept',
          rememberChoice: false
        }
      });
      console.log('✅ User approved the request\n');
      approvalReceived = true;
    }, 1000);
  });
  
  // 订阅 approval_response 事件
  eventBus.subscribe('approval_response', async (message: any) => {
    console.log('📝 Approval Response Processed:');
    console.log(`   Request ID: ${message.payload.requestId}`);
    console.log(`   Decision: ${message.payload.decision}`);
  });
  
  // 发布 approval_request 事件
  await eventBus.publish({
    type: 'approval_request',
    source: 'agent',
    sessionId,
    payload: {
      requestId: '123',
      actionType: 'file_write',
      description: 'Create config file',
      details: {
        filePaths: ['./config.json'],
        riskLevel: 'medium',
        preview: '{\n  "host": "localhost",\n  "port": 3000\n}'
      }
    }
  });
  
  // 等待完成
  while (!approvalReceived) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  await eventBus.stop();
  console.log('=== Simple example completed ===\n');
}

// 运行示例
async function main() {
  try {
    // 先运行简单示例
    // await simpleApprovalExample();
    
    // 然后运行完整的 Agent 示例
    console.log('Press Ctrl+C to exit or wait for automatic completion...\n');
    await demonstrateApprovalWorkflow();
    
  } catch (error) {
    console.error('Error running examples:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { demonstrateApprovalWorkflow, simpleApprovalExample }; 