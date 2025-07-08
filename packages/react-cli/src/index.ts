#!/usr/bin/env node

import { program } from 'commander';
import { ReactCLIClient } from './ReactCLIClient.js';
import { ReactCLIConfig } from './interfaces/index.js';
import { SessionManager } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * React CLI 入口点
 */
async function main() {
  program
    .name('cr-react')
    .description('React-based CLI for Continue Reasoning')
    .version('0.1.0')
    .option('-t, --theme <theme>', 'Color theme (light/dark/auto)', 'dark')
    .option('-c, --compact', 'Enable compact mode', false)
    .option('--no-timestamps', 'Hide timestamps')
    .option('--no-streaming', 'Disable streaming mode')
    .option('-s, --session <id>', 'Session ID to resume')
    .option('-u, --user <id>', 'User ID')
    .option('-a, --agent <id>', 'Agent ID', 'coding-agent')
    .option('--max-messages <n>', 'Maximum messages to keep', '100')
    .option('--max-steps <n>', 'Maximum agent steps', '50')
    .option('-d, --debug', 'Enable debug mode')
    .parse(process.argv);

  const options = program.opts();

  // 构建配置
  const config: ReactCLIConfig = {
    name: 'React CLI',
    theme: options.theme as any,
    compactMode: options.compact,
    showTimestamps: options.timestamps !== false,
    enableStreaming: options.streaming !== false,
    sessionId: options.session,
    userId: options.user,
    agentId: options.agent,
    maxMessages: parseInt(options.maxMessages, 10),
    maxSteps: parseInt(options.maxSteps, 10),
    debug: options.debug,
    enableToolFormatting: true,
    enableFileImport: true
  };

  try {
    // 创建客户端
    const client = new ReactCLIClient(config);
    await client.initialize();

    // 如果提供了 agent，创建 SessionManager
    if (options.agent) {
      // 这里需要实际的 agent 实例
      // 在实际使用中，你需要根据 agentId 创建相应的 agent
      console.log(`Using agent: ${options.agent}`);
      
      // 示例：创建一个模拟的 SessionManager
      // const agent = await createAgent(options.agent);
      // const sessionManager = new SessionManager(agent, client);
      // client.setSessionManager(sessionManager);
    }

    // 启动客户端
    await client.start();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// 导出公共 API
export { ReactCLIClient } from './ReactCLIClient.js';
export * from './interfaces/index.js';
export * from './formatters/index.js';
export * from './importers/index.js';

// ESM 方式检查是否直接运行
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 如果直接运行，启动 CLI
if (process.argv[1] === __filename) {
  main().catch(console.error);
}