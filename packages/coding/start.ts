#!/usr/bin/env node

import { program } from 'commander';
import { launchCodingAgent, launchReactCLI } from './src/launchers/index.js';
import { ReactCLIConfig } from '@continue-reasoning/react-cli';
const reactConfig: ReactCLIConfig = {
    name: 'coding-agent',
    theme: 'dark',
    compactMode: false,
    showTimestamps: true,
    enableStreaming: true,
    userId: 'developer',
    agentId: 'cr-coding-agent',
    maxSteps: 50,
    debug: false,
    enableToolFormatting: true,
    enableFileImport: true,
    eventDisplay: {
        agent: {
            showStepCompleted: true,
            showStepDetails: false,
            showStopped: false,
            showResponse: true,
            showReasoning: true,
        },
        tool: {
            showStarted: true,
            showCompleted: true,
            showFailed: true,
            showDetails: true,
        },
        error: {
            showErrors: true,
            showStackTrace: true,
        },
        session: {
            showStarted: false,
            showEnded: false,
            showSwitched: true,
        },
    }
  };
/**
 * 新的清洁启动入口点
 */
async function main() {
  program
    .name('coding-agent')
    .description('Continue Reasoning Coding Agent')
    .version('0.1.0')
    .option('-w, --workspace <path>', 'Workspace directory', process.cwd())
    .parse(process.argv);

  const options = program.opts();

  try {
    // 使用React CLI
    console.log('🎨 Launching with React CLI...');
    await launchCodingAgent(options.workspace, reactConfig);
  } catch (error) {
    console.error('❌ Failed to start:', error);
    process.exit(1);
  }
}

// 运行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});