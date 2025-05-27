import { BaseAgent } from '../src/core/agent';
import { ContextManager } from '../src/core/context';
import { MapMemoryManager } from '../src/core/memory/baseMemory';
import { EventBus } from '../src/core/events/eventBus';
import { CLIClient } from '../src/core/interactive/cliClient';
import { InteractiveLayerConfig } from '../src/core/events/interactiveLayer';
import { InteractiveCapabilities } from '../src/core/events/types';

// Import contexts
import { ToolCallContext } from '../src/core/contexts/tool';
import { ClientContext } from '../src/core/contexts/client';
import { SystemToolContext } from '../src/core/contexts/system';
import { ExecuteToolsContext } from '../src/core/contexts/execute';
import { InteractiveContext } from '../src/core/contexts/interaction';
import { OPENAI_MODELS } from '@/core/models';

// Mock client for demonstration
class MockClient {
  public id: string = 'mock-client';
  public description: string = 'Mock client for testing';
  public input: any = null;
  public output: any = null;
  
  constructor() {
    this.output = {
      responseTool: {
        id: 'mock-response',
        name: 'mock-response',
        description: 'Mock response tool',
        inputSchema: {} as any,
        outputSchema: {} as any,
        async: false,
        execute: (params: any) => {
          console.log('Mock Client Response:', params.message);
          return { success: true, text: params.message };
        }
      }
    };
  }
}

async function demonstrateApprovalWorkflow() {
  console.log('=== Interactive Approval Workflow Example ===\n');
  
  // 1. 创建 EventBus
  const eventBus = new EventBus();
  await eventBus.start();
  
  // 2. 创建 Interactive Layer (CLI Client)
  const cliCapabilities: InteractiveCapabilities = {
    supportsRealTimeUpdates: true,
    supportsFilePreview: true,
    supportsCodeHighlighting: false,
    supportsInteractiveApproval: true,
    supportsCollaboration: true,
    maxConcurrentSessions: 1,
    supportedEventTypes: [
      'approval_request',
      'approval_response',
      'collaboration_request',
      'collaboration_response',
      'input_request',
      'input_response',
      'status_update',
      'error'
    ]
  };

  const cliConfig: InteractiveLayerConfig = {
    name: 'CLI Client',
    capabilities: cliCapabilities,
    eventBus: eventBus,
    sessionTimeout: 300000, // 5 minutes
    messageQueueSize: 100,
    enablePersistence: false
  };

  const cliClient = new CLIClient(cliConfig);
  
  // 3. 创建 Agent with EventBus
  const contextManager = new ContextManager(
    'demo-context-manager',
    'Demo Context Manager',
    'Context manager for approval demo',
    {}
  );
  const memoryManager = new MapMemoryManager(
    'demo-memory-manager',
    'Demo Memory Manager',
    'Memory manager for approval demo'
  );
  const mockClient = new MockClient();
  
  const agent = new BaseAgent(
    'approval-demo-agent',
    'Approval Demo Agent',
    'An agent that demonstrates the approval workflow',
    contextManager,
    memoryManager,
    [mockClient],
    10, // maxSteps
    undefined, // logLevel
    {
      model: OPENAI_MODELS.GPT_4O,
      enableParallelToolCalls: false,
      temperature: 0.7
    },
    [
      ToolCallContext,
      ClientContext,
      SystemToolContext,
      ExecuteToolsContext,
      InteractiveContext // 添加 InteractiveContext
    ],
    eventBus // 传入 EventBus
  );

  // 4. 设置 Agent
  await agent.setup();
  
  // 5. 启动 CLI Client
  await cliClient.start();
  
  console.log('System initialized. Starting approval workflow demonstration...\n');
  
  // 6. 模拟 Agent 使用 approval_request tool
  setTimeout(async () => {
    console.log('🤖 Agent: I need to create a configuration file. Requesting approval...\n');
    
    // 模拟 Agent 调用 approval_request tool
    try {
      const approvalTool = agent.getActiveTools().find(tool => tool.name === 'approval_request');
      
      if (!approvalTool) {
        console.error('❌ Approval tool not found!');
        return;
      }

      const result = await approvalTool.execute({
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
      }, agent);

      console.log('\n🎯 Approval Result:', result);
      
      if (result.approved) {
        console.log('✅ Action approved! Proceeding with file creation...');
        // 这里可以继续执行文件创建逻辑
      } else {
        console.log('❌ Action rejected or failed. Will not proceed.');
      }
      
    } catch (error) {
      console.error('❌ Error in approval workflow:', error);
    }
    
    // 清理
    setTimeout(async () => {
      await cliClient.stop();
      await eventBus.stop();
      console.log('\n=== Demo completed ===');
      process.exit(0);
    }, 2000);
    
  }, 2000);
  
  return { agent, cliClient, eventBus };
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