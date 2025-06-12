#!/usr/bin/env node

/**
 * 简单实用的CLI客户端 - 支持多行输入和粘贴
 */

import { CodingAgent } from '@continue-reasoning/agents';
import { EventBus } from '../packages/core/events/eventBus';
import { LogLevel, OPENAI_MODELS } from '../packages/core';
import readline from 'readline';
import path from 'path';
import fs from 'fs';

class SimpleCLI {
  private rl: readline.Interface;
  private agent: CodingAgent;
  private multilineMode = false;
  private multilineBuffer: string[] = [];
  
  constructor(agent: CodingAgent) {
    this.agent = agent;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> '
    });
    
    this.setupHandlers();
  }
  
  private setupHandlers() {
    this.rl.on('line', async (input) => {
      await this.handleInput(input);
    });
    
    this.rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
    
    // 处理 Ctrl+C
    process.on('SIGINT', () => {
      if (this.multilineMode) {
        console.log('\n❌ Cancelled multiline input');
        this.exitMultilineMode();
        this.rl.prompt();
      } else {
        process.exit(0);
      }
    });
  }
  
  private async handleInput(input: string) {
    const trimmed = input.trim();
    
    // 处理命令
    if (trimmed.startsWith('/')) {
      await this.handleCommand(trimmed);
      return;
    }
    
    // 检查是否是多行输入开始标记
    if (trimmed === '```' || trimmed === '###') {
      this.enterMultilineMode();
      return;
    }
    
    // 多行模式处理
    if (this.multilineMode) {
      if (trimmed === '```' || trimmed === '###') {
        await this.processMultilineInput();
        return;
      } else {
        this.multilineBuffer.push(input);
        this.rl.setPrompt('... ');
        this.rl.prompt();
        return;
      }
    }
    
    // 检查是否是大段粘贴内容
    if (this.isLikelyPastedContent(input)) {
      console.log('📋 检测到粘贴内容，正在处理...');
      await this.sendToAgent(input);
      return;
    }
    
    // 普通单行输入
    if (trimmed) {
      await this.sendToAgent(trimmed);
    } else {
      this.rl.prompt();
    }
  }
  
  private enterMultilineMode() {
    this.multilineMode = true;
    this.multilineBuffer = [];
    console.log('📝 进入多行输入模式，输入 ``` 或 ### 结束');
    this.rl.setPrompt('... ');
    this.rl.prompt();
  }
  
  private async processMultilineInput() {
    const content = this.multilineBuffer.join('\n');
    this.exitMultilineMode();
    
    if (content.trim()) {
      console.log(`📤 发送多行内容 (${this.multilineBuffer.length} 行)`);
      await this.sendToAgent(content);
    } else {
      console.log('⚠️ 空内容，已取消');
    }
  }
  
  private exitMultilineMode() {
    this.multilineMode = false;
    this.multilineBuffer = [];
    this.rl.setPrompt('> ');
  }
  
  private isLikelyPastedContent(input: string): boolean {
    // 检测可能的粘贴内容
    return input.includes('\n') || 
           input.length > 200 || 
           /```[\s\S]*```/.test(input) ||
           input.includes('function ') ||
           input.includes('class ') ||
           input.includes('import ') ||
           input.includes('{') && input.includes('}');
  }
  
  private async sendToAgent(content: string) {
    try {
      console.log(`📤 发送给 CodingAgent: "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`);
      await this.agent.processUserInput(content, 'cli-session');
    } catch (error) {
      console.error('❌ 错误:', error);
    }
    this.rl.prompt();
  }
  
  private async handleCommand(command: string) {
    const [cmd, ...args] = command.slice(1).split(' ');
    
    switch (cmd) {
      case 'help':
        this.showHelp();
        break;
      case 'quit':
      case 'exit':
        process.exit(0);
        break;
      case 'multi':
        this.enterMultilineMode();
        return; // 不要调用 prompt，已在 enterMultilineMode 中处理
      case 'paste':
        console.log('📋 粘贴模式：直接粘贴内容，会自动检测并处理');
        break;
      default:
        console.log(`❓ 未知命令: ${cmd}. 输入 /help 查看帮助`);
    }
    
    this.rl.prompt();
  }
  
  private showHelp() {
    console.log('\n🛠️  命令列表:');
    console.log('  /help     - 显示帮助');
    console.log('  /quit     - 退出');
    console.log('  /multi    - 进入多行输入模式');
    console.log('  /paste    - 粘贴提示');
    console.log('\n📝 多行输入:');
    console.log('  1. 输入 ``` 或 ### 开始多行输入');
    console.log('  2. 输入内容（支持换行）');
    console.log('  3. 输入 ``` 或 ### 结束');
    console.log('\n📋 粘贴支持:');
    console.log('  直接粘贴代码，会自动检测和处理');
    console.log('  支持带换行的大段文本');
    console.log('\n💡 示例:');
    console.log('  "Create a React component"');
    console.log('  "帮我重构这段代码"');
    console.log();
  }
  
  start() {
    console.log('🚀 简单CLI客户端启动！');
    console.log('支持多行输入和粘贴，输入 /help 查看帮助\n');
    this.rl.prompt();
  }
}

async function main() {
  try {
    // 初始化组件
    const eventBus = new EventBus();
    await eventBus.start();
    
    const workspacePath = path.join(process.cwd(), 'cli-workspace');
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
    
    // 创建Agent
    const agent = new CodingAgent(
      'cli-agent',
      'CLI Agent',
      'Simple CLI coding agent',
      workspacePath,
      10,
      LogLevel.INFO,
      {
        model: OPENAI_MODELS.GPT_4O_MINI,
        executionMode: 'manual'
      },
      [],
      eventBus
    );
    
    await agent.setup();
    
    // 启动CLI
    const cli = new SimpleCLI(agent);
    cli.start();
    
  } catch (error) {
    console.error('❌ 启动失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
} 