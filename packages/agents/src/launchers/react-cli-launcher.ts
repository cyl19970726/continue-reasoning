#!/usr/bin/env node

import { ReactCLIClient, ReactCLIConfig } from '@continue-reasoning/react-cli';
import { ANTHROPIC_MODELS, EventBus, logger, LogLevel } from '@continue-reasoning/core';
import { CodingAgent } from '../../coding-agent.js';
import * as path from 'path';

/**
 * React CLI 启动器 - 专门用于启动带React界面的Coding Agent
 * 使用简化架构，直接在Client中管理Agent实例
 */
export class ReactCLILauncher {
  private eventBus: EventBus;
  private agent!: CodingAgent;
  private client!: ReactCLIClient;

  constructor(
    private workspacePath: string = process.cwd(),
    private options: Partial<ReactCLIConfig> = {}
  ) {
    // 创建事件总线
    this.eventBus = new EventBus(1000);
  }

  /**
   * 初始化所有组件
   */
  async initialize(): Promise<void> {
    console.log('🚀 Continue Reasoning - Coding Agent with React CLI\n');
    console.log(`📁 Working directory: ${this.workspacePath}\n`);

    // 1. 创建Agent
    console.log('🤖 Initializing Coding Agent...');
    this.agent = new CodingAgent(
      'cr-coding-agent',
      'Interactive Coding Assistant',
      'A coding agent that works through CLI interface for interactive development',
      this.workspacePath,
      500, // Allow more steps for interactive sessions
      LogLevel.NONE,
      {
        model: ANTHROPIC_MODELS.CLAUDE_3_7_SONNET_LATEST,
        enableParallelToolCalls: true,
        temperature: 0.1,
      },
      this.eventBus
    );

    // 2. 设置Agent
    await this.agent.setup();
    this.agent.setEnableToolCallsForStep(() => true);

    // 3. 创建React CLI客户端
    console.log('🖥️  Creating React CLI interface...');
    const config: ReactCLIConfig = {
      name: 'Continue Reasoning - Coding Assistant',
      userId: 'developer',
      agentId: 'cr-coding-agent',
      theme: 'dark',
      enableStreaming: true,
      showTimestamps: true,
      showStepNumbers: true,
      compactMode: false,
      maxSteps: 50,
      debug: false,
      enableToolFormatting: true,
      enableFileImport: true,
      // 事件显示配置
      eventDisplay: {
        session: {
          showStarted: true,
          showEnded: true,
          showSwitched: true
        },
        agent: {
          showStepCompleted: false,
          showStepDetails: false,
          showStopped: true,
          showResponse: true,
          showReasoning: false
        },
        tool: {
          showStarted: true,
          showCompleted: true,
          showFailed: true,
          showDetails: false
        },
        error: {
          showErrors: true,
          showStackTrace: false
        }
      },
      ...this.options
    };

    this.client = new ReactCLIClient(config);
    await this.client.initialize();

    // 4. 设置事件总线 (关键步骤！)
    console.log('🔗 Connecting event bus...');
    this.client.setEventBus(this.eventBus);

    // 5. 直接在Client中设置Agent实例 (简化架构)
    console.log('🔗 Connecting agent to client...');
    this.client.setAgent(this.agent);

    console.log('✅ All components initialized successfully!\n');
  }

  /**
   * 启动应用
   */
  async start(): Promise<void> {
    if (!this.client) {
      throw new Error('Launcher not initialized. Call initialize() first.');
    }

    console.log('🎮 Starting interactive session...\n');
    console.log('💡 Tips:');
    console.log('   - Use ``` to enter multiline mode');
    console.log('   - Type "/help" for available commands');
    console.log('   - Type "/exit" or Ctrl+C to quit');
    console.log('   - Press ESC to interrupt agent execution\n');

    await this.client.start();
  }

  /**
   * 停止应用
   */
  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
    }
  }

  /**
   * 获取Agent实例
   */
  getAgent(): CodingAgent {
    return this.agent;
  }

  /**
   * 获取Client实例
   */
  getClient(): ReactCLIClient {
    return this.client;
  }

  /**
   * 获取EventBus实例
   */
  getEventBus(): EventBus {
    return this.eventBus;
  }
}

/**
 * 快速启动函数
 */
export async function launchReactCLI(
  workspacePath?: string,
  options?: Partial<ReactCLIConfig>
): Promise<ReactCLILauncher> {
  const launcher = new ReactCLILauncher(workspacePath, options);
  await launcher.initialize();
  await launcher.start();
  return launcher;
}

/**
 * CLI入口点
 */
async function main() {
  try {
    const launcher = new ReactCLILauncher();
    await launcher.initialize();
    await launcher.start();
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// 如果直接运行，启动CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}