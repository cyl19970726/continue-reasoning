/**
 * Complete Web UI + Agent Integration Example
 * 
 * This example starts both the Web UI client and the Agent core,
 * connecting them via the event bus for full functionality.
 * Updated for the new event-driven architecture.
 */

import { EventBus } from '../src/core/events/eventBus';
import { WebUIClient } from '../src/web/client/webUIClient';
import { BaseAgent } from '../src/core/agent';
import { ContextManager } from '../src/core/context';
import { MapMemoryManager } from '../src/core/memory/baseMemory';
import { z } from 'zod';
import { LogLevel } from '../src/core/utils/logger';
import { LLMModel } from '../src/core/interfaces';
import path from 'path';

async function startWebUIWithAgent() {
  console.log('=== Starting Web UI + Agent Integration (Event-Driven Architecture) ===\n');
  
  try {
    // 1. Create and start event bus
    const eventBus = new EventBus();
    await eventBus.start();
    console.log('✅ Event bus started');

    // 2. Create Web UI client first
    const webUIClient = new WebUIClient({
      name: 'Web UI Client',
      eventBus,
      capabilities: {
        supportsRealTimeUpdates: true,
        supportsFilePreview: true,
        supportsCodeHighlighting: true,
        supportsInteractiveApproval: true,
        supportsCollaboration: true,
        maxConcurrentSessions: 10,
        supportedEventTypes: [
          'approval_request',
          'approval_response',
          'collaboration_request',
          'collaboration_response',
          'input_request',
          'input_response',
          'status_update',
          'error',
          'execution_mode_change',
          'task_event',
          'file_operation',
          'command_execution'
        ]
      },
      serverPort: 3002,
      enableWebSocket: true,
      enableFileUpload: true
    });
    console.log('✅ Web UI client created');

    // 3. Start Web UI client (HTTP + WebSocket servers)
    await webUIClient.start();
    console.log('🌐 Web UI client started on http://localhost:3000');

    // 4. Create Agent core components
    const contextManager = new ContextManager("web-ui-agent", "Web UI Agent", "Agent integrated with Web UI", z.object({}));
    const memoryManager = new MapMemoryManager("web-ui-agent", "Web UI Agent", "Memory for Web UI Agent");

    // 5. Create a special Web UI adapter client that connects agent to event bus
    const webUIEventClient = {
      id: 'web-ui-event-client',
      description: 'Event-based client for Web UI integration',
      input: {
        subscribe: (fn: any) => {
          // Subscribe to user commands from Web UI
          eventBus.subscribe('input_request', async (event: any) => {
            if (event.payload?.requestId === 'web-ui-input') {
              console.log(`🔄 Processing input request: ${event.payload.prompt}`);
              await fn(event.payload.prompt || event.payload.command);
            }
          });
        }
      },
      output: {
        paramsSchema: z.object({
          content: z.string().describe('Response content to send to Web UI'),
          type: z.string().optional().describe('Response type: text, code, file, etc.')
        }),
        responseTool: {
          id: 'send_web_ui_response',
          type: 'function',
          name: 'send_web_ui_response',
          description: 'Send response back to Web UI',
          params: z.object({
            content: z.string().describe('Response content to send to Web UI'),
            type: z.string().optional().describe('Response type: text, code, file, etc.')
          }),
          async: false,
          execute: async (params: { content: string; type?: string }) => {
            // Publish response to Web UI via event bus
            const sessionId = eventBus.createSession();
            
            await eventBus.publish({
              type: 'status_update',
              source: 'agent',
              sessionId,
              payload: {
                stage: 'completed',
                message: params.content,
                progress: 100
              }
            });

            return { success: true, message: 'Response sent to Web UI' };
          },
          toCallParams: () => ({
            type: 'function' as const,
            name: 'send_web_ui_response',
            description: 'Send response back to Web UI',
            paramSchema: z.object({
              content: z.string().describe('Response content to send to Web UI'),
              type: z.string().optional().describe('Response type: text, code, file, etc.')
            }),
            async: false,
            strict: true,
            resultSchema: z.object({
              success: z.boolean(),
              message: z.string()
            }),
            resultDescription: 'Result of sending response to Web UI'
          })
        }
      }
    };

    // 6. Create Agent with Web UI integration
    const agentOptions = {
      llmProvider: 'openai' as const,
      enableParallelToolCalls: false,
      temperature: 0.7,
      maxTokens: 100000,
      taskConcurency: 5,
      mcpConfigPath: path.join(process.cwd(), 'config', 'mcp.json')
    };

    const agent = new BaseAgent(
      "web-ui-agent",
      "Web UI Agent", 
      "Agent that responds to Web UI commands",
      contextManager,
      memoryManager,
      [webUIEventClient],  // Use our event-based client
      100,  // maxSteps
      LogLevel.INFO,
      agentOptions,
      undefined, // contexts (use default)
      eventBus  // 传递EventBus
    );

    // 7. Setup agent
    await agent.setup();
    console.log('✅ Agent core setup completed');

    // 8. Subscribe to Agent internal events and forward to Web UI
    console.log('🔌 Setting up event subscriptions...');

    // 监听Agent状态变化
    eventBus.subscribe('agent_state_change', async (event: any) => {
      console.log(`📊 Agent state: ${event.payload.fromState} → ${event.payload.toState}`);
      
      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId: event.sessionId,
        payload: {
          stage: event.payload.toState === 'running' ? 'executing' : 
                 event.payload.toState === 'error' ? 'error' : 'completed',
          message: `Agent ${event.payload.toState}${event.payload.reason ? `: ${event.payload.reason}` : ''}`,
          progress: event.payload.toState === 'running' ? 50 : 
                   event.payload.toState === 'idle' ? 100 : 0
        }
      });
    });

    // 监听Agent步骤执行
    eventBus.subscribe('agent_step', async (event: any) => {
      const { stepNumber, action } = event.payload;
      
      console.log(`🔄 Agent step ${stepNumber}: ${action}`);
      
      let message = '';
      let progress = 0;
      let stage: 'planning' | 'executing' | 'testing' | 'reviewing' | 'completed' | 'error' = 'executing';
      
      switch (action) {
        case 'start':
          message = `Starting step ${stepNumber}...`;
          progress = Math.min(10 + (stepNumber * 10), 90);
          stage = 'executing';
          break;
        case 'complete':
          message = `Completed step ${stepNumber}`;
          progress = Math.min(20 + (stepNumber * 10), 95);
          stage = 'reviewing';
          break;
        case 'error':
          message = `Error in step ${stepNumber}: ${event.payload.error}`;
          progress = 0;
          stage = 'error';
          break;
      }

      await eventBus.publish({
        type: 'status_update',
        source: 'agent',
        sessionId: event.sessionId,
        payload: {
          stage,
          message,
          progress
        }
      });
    });

    // 监听工具执行结果
    eventBus.subscribe('tool_execution_result', async (event: any) => {
      const { toolName, success, result, error, executionTime } = event.payload;
      
      console.log(`🔧 Tool ${toolName}: ${success ? 'SUCCESS' : 'FAILED'} (${executionTime}ms)`);
      
      const message = success 
        ? `✅ Tool "${toolName}" completed successfully`
        : `❌ Tool "${toolName}" failed: ${error}`;

      await eventBus.publish({
        type: 'status_update',
        source: 'agent',
        sessionId: event.sessionId,
        payload: {
          stage: success ? 'executing' : 'error',
          message,
          progress: success ? 75 : 0,
          details: { toolName, executionTime, result: success ? result : error }
        }
      });
    });

    // 监听任务队列事件
    eventBus.subscribe('task_queue', async (event: any) => {
      const { action, taskType, taskId } = event.payload;
      
      console.log(`📋 Task Queue [${taskType}]: ${action} (${taskId})`);
      
      if (action === 'start' && taskType === 'processStep') {
        await eventBus.publish({
          type: 'status_update',
          source: 'system',
          sessionId: event.sessionId,
          payload: {
            stage: 'executing',
            message: 'Processing agent step...',
            progress: 30
          }
        });
      }
    });

    // 9. Connect Web UI commands to Agent
    eventBus.subscribe('command', async (message: any) => {
      const command = message.payload?.command;
      console.log(`📨 Received command from Web UI: "${command}"`);
      
      try {
        // 发布开始处理事件
        await eventBus.publish({
          type: 'status_update',
          source: 'system',
          sessionId: message.sessionId,
          payload: {
            stage: 'planning',
            message: 'Received your request. Starting to process...',
            progress: 5
          }
        });

        // Publish as input request for agent
        await eventBus.publish({
          type: 'input_request',
          source: 'user',
          sessionId: message.sessionId,
          payload: {
            requestId: 'web-ui-input',
            prompt: command,
            inputType: 'text' as const,
            validation: {
              required: true
            }
          }
        });

        // Start agent processing (non-blocking)
        console.log('🚀 Starting agent processing...');
        setImmediate(async () => {
          try {
            await agent.start(10); // Process up to 10 steps
            
            // 发布完成事件
            await eventBus.publish({
              type: 'status_update',
              source: 'agent',
              sessionId: message.sessionId,
              payload: {
                stage: 'completed',
                message: 'Task completed successfully!',
                progress: 100
              }
            });
            
          } catch (error) {
            console.error('❌ Agent processing error:', error);
            
            // Send error to Web UI
            await eventBus.publish({
              type: 'error',
              source: 'agent',
              sessionId: message.sessionId,
              payload: {
                errorType: 'runtime_error' as const,
                message: `Agent error: ${(error as Error).message}`,
                recoverable: true,
                suggestions: ['Try rephrasing your request', 'Check if all required files exist']
              }
            });
          }
        });

      } catch (error) {
        console.error('❌ Error processing command:', error);
        
        await eventBus.publish({
          type: 'error',
          source: 'system',
          sessionId: message.sessionId,
          payload: {
            errorType: 'validation_error' as const,
            message: `Command processing error: ${(error as Error).message}`,
            recoverable: true,
            suggestions: ['Check your command syntax', 'Try a simpler request first']
          }
        });
      }
    });

    // 10. Show capabilities and stats
    const capabilities = webUIClient.getWebUICapabilities();
    console.log('\n🎯 Web UI Capabilities:');
    console.log(`   File Upload: ${capabilities.supportsFileUpload}`);
    console.log(`   Code Highlighting: ${capabilities.supportsCodeHighlighting}`);
    console.log(`   Real-time Collaboration: ${capabilities.supportsRealTimeCollaboration}`);
    console.log(`   Max File Size: ${Math.round(capabilities.maxFileSize / 1024 / 1024)}MB`);

    // 11. Enhanced stats monitoring
    const showStats = () => {
      const webStats = webUIClient.getWebUIStats();
      const eventStats = eventBus.getStats();
      
      console.log('\n📊 Integrated System Stats:');
      console.log(`   Active Connections: ${webStats.activeConnections}`);
      console.log(`   Total Messages: ${webStats.totalMessages}`);
      console.log(`   Agent Running: ${agent.isRunning ? 'Yes' : 'No'}`);
      console.log(`   Agent State: ${agent.currentState}`);
      console.log(`   Current Step: ${agent.currentStep}`);
      console.log(`   Event Bus Events: ${eventStats.totalEventsPublished}`);
      console.log(`   Active Subscriptions: ${eventStats.activeSubscriptions}`);
      console.log(`   Event Processing: ${eventStats.averageProcessingTime.toFixed(2)}ms avg`);
      console.log(`   Uptime: ${Math.round(webStats.uptime / 1000)}s`);
      console.log(`   Memory Usage: ${Math.round(webStats.memoryUsage / 1024 / 1024)}MB`);
    };

    const statsInterval = setInterval(showStats, 10000);
    showStats();

    // 12. Enhanced welcome message with system status
    setTimeout(async () => {
      const sessionId = eventBus.createSession();
      await eventBus.publish({
        type: 'status_update',
        source: 'system',
        sessionId,
        payload: {
          stage: 'completed',
          message: '🤖 HHH-AGI Agent is ready! \n\n✨ Features available:\n• Code generation and editing\n• File system operations\n• Command execution\n• Real-time status updates\n\nSend me a coding task to get started!',
          progress: 100,
          details: {
            agentId: agent.id,
            capabilities: capabilities,
            eventBusStats: eventBus.getStats()
          }
        }
      });
    }, 1000);

    // 13. Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n🔄 Shutting down Web UI + Agent integration...');
      clearInterval(statsInterval);
      
      // Stop agent and wait for completion
      agent.stop();
      console.log('✅ Agent stopped');
      
      // Close all sessions
      eventBus.getActiveSessions().forEach(sessionId => {
        eventBus.closeSession(sessionId);
      });
      
      await webUIClient.stop();
      console.log('✅ Web UI client stopped');
      
      await eventBus.stop();
      console.log('✅ Event bus stopped');
      
      console.log('👋 Goodbye!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('\n💡 Instructions:');
    console.log('   1. Open http://localhost:3000 in your browser');
    console.log('   2. You should see the HHH-AGI Web UI with real-time status');
    console.log('   3. Send commands like:');
    console.log('      • "Create a hello world Python script"');
    console.log('      • "List files in current directory"');
    console.log('      • "Analyze this codebase structure"');
    console.log('      • "Help me debug this code issue"');
    console.log('   4. Watch real-time progress updates and agent status');
    console.log('   5. Press Ctrl+C to stop everything');
    console.log('\n🚀 Advanced Web UI + Agent integration is ready!');
    console.log('📡 Event-driven architecture with full bi-directional communication');

  } catch (error) {
    console.error('❌ Error starting Web UI + Agent integration:', error);
    process.exit(1);
  }
}

// Run the integration
if (require.main === module) {
  startWebUIWithAgent();
}

export { startWebUIWithAgent }; 