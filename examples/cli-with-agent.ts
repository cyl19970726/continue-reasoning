import { BaseAgent } from '../src/core/agent';
import { ContextManager } from '../src/core/context';
import { MapMemoryManager } from '../src/core/memory/baseMemory';
import { CLIClient } from '../src/core/interactive/cliClient';
import { EventBus } from '../src/core/events/eventBus';
import { 
  InteractiveContext, 
  UserInputContext, 
  PlanContext,
} from '../src/core/contexts/interaction';
import { createCodingContext } from '../src/core/contexts/coding';
import { ToolCallContext } from '../src/core/contexts/tool';
import { InteractionHub } from '../src/core/interactive/interactionHub';
import { LogLevel } from '../src/core/utils/logger';
import chalk from 'chalk';
import * as path from 'path';
import { ANTHROPIC_MODELS, OPENAI_MODELS } from '@/core/models';

async function main() {
  console.log(chalk.green('🚀 Starting HHH-AGI CLI with Agent...'));

  // 创建 EventBus
  const eventBus = new EventBus();
  await eventBus.start();

  // 创建 CLI 客户端
  const cliClient = CLIClient.createDefault(eventBus);

  // 创建 Agent
  const contextManager = new ContextManager(
    'cli-context-manager', 
    'CLI Context Manager', 
    { mode: 'standard', maxTokens: 8000 } // 使用 minimal 模式优化 prompt
  );

  // 创建 Coding Context (需要工作空间路径)
  const workspacePath = path.resolve(process.cwd());
  const codingContext = createCodingContext(workspacePath);

  const agent = new BaseAgent(
    'cli-agent',
    'CLI Interactive Agent',
    'An agent that interacts with users through CLI interface, supports execution mode switching, and provides coding capabilities with planning',
    [], // 不需要传统的 clients，我们使用 EventBus
    30, // maxSteps
    LogLevel.INFO,
    {
      model: OPENAI_MODELS.GPT_4O_MINI,
      enableParallelToolCalls: false,
      temperature: 0.7,
      taskConcurency: 3,
      executionMode: 'manual', // 默认为 manual 模式
      promptOptimization: {
        mode: 'standard',
        customSystemPrompt: "",
        maxTokens: 200000,
      }
    },
    [
      UserInputContext, 
      PlanContext, 
      codingContext, 
      ToolCallContext,
      // InteractiveContext, 
    ], // 添加所有 interaction 和 coding contexts
    eventBus // 传递 EventBus
  );

  // 配置协调上下文的集成设置
  // const coordinationContext = agent.contextManager.findContextById('coordination-context');
  // if (coordinationContext) {
  //   const coordinationData = coordinationContext.getData();
  //   coordinationData.integrationSettings = {
  //     autoCreatePlansForCoding: true,      // 自动为编码任务创建计划项目
  //     requireApprovalForFileOps: false,    // CLI 模式下不需要审批（提高效率）
  //     syncCodingProgress: true,            // 同步编码进度到计划
  //     consolidatePrompts: true             // 启用 prompt 合并
  //   };
  //   coordinationContext.setData(coordinationData);
  //   console.log(chalk.blue('🔧 Coordination settings configured for CLI mode'));
  // }

  // 创建 InteractionHub 来管理 Agent 和 CLI 的协作
  const interactionHub = new InteractionHub(eventBus);
  
  // 注册组件
  interactionHub.registerAgent(agent);
  interactionHub.registerInteractiveLayer(cliClient);

  // 启动交互中心 (InteractionHub会自动调用agent.setup())
  await interactionHub.start();

  console.log(chalk.cyan('\n📋 Available Commands:'));
  console.log(chalk.white('  /help - Show help'));
  console.log(chalk.white('  /mode [auto|manual|supervised] - Switch execution mode'));
  console.log(chalk.white('  /multiline - Start multi-line input mode'));
  console.log(chalk.white('  /file <path> - Load and send file content'));
  console.log(chalk.white('  /history - Show command history'));
  console.log(chalk.white('  /clear - Clear screen'));
  console.log(chalk.white('  /events - Show active events'));
  console.log(chalk.white('  /stats - Show event bus statistics'));
  console.log(chalk.white('  /exit - Exit application'));

  console.log(chalk.yellow('\n💡 Tips:'));
  console.log(chalk.gray('  - In AUTO mode: Agent executes actions without approval'));
  console.log(chalk.gray('  - In MANUAL mode: Agent requests approval for risky actions'));
  console.log(chalk.gray('  - In SUPERVISED mode: Agent provides detailed explanations'));
  console.log(chalk.gray('  - Type your requests naturally, the agent will understand'));
  console.log(chalk.gray('  - Use /file <path> to load file content directly'));
  
  console.log(chalk.yellow('\n📝 Multi-line Input Guide:'));
  console.log(chalk.gray('  1. Type ### and press Enter to start multi-line mode'));
  console.log(chalk.gray('  2. Type your message with line breaks (Enter creates new lines)'));
  console.log(chalk.gray('  3. Type ### and press Enter to finish and send the message'));
  console.log(chalk.gray('  Example:'));
  console.log(chalk.cyan('    ### ← Start multi-line mode'));
  console.log(chalk.cyan('    Create a React component with:'));
  console.log(chalk.cyan('    - useState for state management'));
  console.log(chalk.cyan('    - useEffect for side effects'));
  console.log(chalk.cyan('    - TypeScript interfaces'));
  console.log(chalk.cyan('    ### ← End multi-line mode and send'));

  console.log(chalk.green('\n🎯 Available Capabilities:'));
  console.log(chalk.white('  📝 Planning: Create and manage task plans'));
  console.log(chalk.white('  💻 Coding: Read, write, and execute code'));
  console.log(chalk.white('  🔄 Coordination: Sync coding progress with plans'));
  console.log(chalk.white('  🗣️  Interaction: User communication and approval workflows'));
  console.log(chalk.white(`  📁 Workspace: ${workspacePath}`));

  console.log(chalk.green('\n✅ CLI Agent is ready! Type your commands below:\n'));

  // 监听进程退出信号
  process.on('SIGINT', async () => {
    console.log(chalk.yellow('\n🛑 Shutting down...'));
    
    try {
      await interactionHub.stop();
      console.log(chalk.green('✅ Shutdown complete'));
      process.exit(0);
    } catch (error) {
      console.error(chalk.red('Error during shutdown:'), error);
      process.exit(1);
    }
  });

  // 监听执行模式变更事件
  eventBus.subscribe('execution_mode_change', async (event: any) => {
    const { fromMode, toMode, reason } = event.payload;
    console.log(chalk.magenta(`\n🔄 Execution mode changed: ${fromMode} → ${toMode}`));
    if (reason) {
      console.log(chalk.gray(`   Reason: ${reason}`));
    }
  });

  // 监听 Agent 状态变化
  eventBus.subscribe('agent_state_change', async (event: any) => {
    const { fromState, toState, reason } = event.payload;
    const stateIcon = getStateIcon(toState);
    console.log(chalk.blue(`${stateIcon} Agent state: ${fromState} → ${toState}`));
    if (reason) {
      console.log(chalk.gray(`   ${reason}`));
    }
  });

  // 监听 Agent 步骤事件
  eventBus.subscribe('agent_step', async (event: any) => {
    const { stepNumber, action, error } = event.payload;
    
    if (action === 'start') {
      console.log(chalk.cyan(`🔄 Agent step ${stepNumber} starting...`));
    } else if (action === 'complete') {
      console.log(chalk.green(`✅ Agent step ${stepNumber} completed`));
    } else if (action === 'error') {
      console.log(chalk.red(`❌ Agent step ${stepNumber} failed: ${error}`));
    }
  });

  // 监听用户消息事件
  eventBus.subscribe('user_message', async (event: any) => {
    console.log(chalk.blue(`📝 Processing user message: "${event.payload.content}"`));
    // InteractionHub会自动处理事件路由，无需手动处理
  });

  // 监听计划相关事件
  eventBus.subscribe('plan_created', async (event: any) => {
    const { planId, title } = event.payload;
    console.log(chalk.green(`📋 Plan created: "${title}" (${planId})`));
  });

  eventBus.subscribe('plan_updated', async (event: any) => {
    const { planId, status, title } = event.payload;
    const statusIcon = getStatusIcon(status);
    console.log(chalk.yellow(`${statusIcon} Plan updated: "${title}" → ${status}`));
  });

  // 监听编码进度同步事件
  eventBus.subscribe('coding_progress_synced', async (event: any) => {
    const { filePath, status, planItemUpdated } = event.payload;
    const icon = status === 'completed' ? '✅' : status === 'started' ? '🚀' : '🔄';
    console.log(chalk.cyan(`${icon} Coding progress: ${filePath} → ${status}`));
    if (planItemUpdated) {
      console.log(chalk.gray('   📋 Plan item updated automatically'));
    }
  });

  // 监听工具调用事件
  eventBus.subscribe('tool_call_start', async (event: any) => {
    const { toolName, params } = event.payload;
    if (toolName.includes('coding') || toolName.includes('file') || toolName.includes('plan')) {
      console.log(chalk.magenta(`🔧 Tool: ${toolName}`));
    }
  });

  // 保持进程运行
  await new Promise(() => {}); // 永远等待
}

function getStateIcon(state: string): string {
  switch (state) {
    case 'idle': return '😴';
    case 'running': return '🏃';
    case 'stopping': return '🛑';
    case 'error': return '💥';
    default: return '❓';
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'pending': return '⏳';
    case 'in_progress': return '🔄';
    case 'completed': return '✅';
    case 'cancelled': return '❌';
    default: return '❓';
  }
}

// 错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('Unhandled Rejection at:'), promise, chalk.red('reason:'), reason);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('Uncaught Exception:'), error);
  process.exit(1);
});

// 启动应用
main().catch(error => {
  console.error(chalk.red('Failed to start CLI agent:'), error);
  process.exit(1);
}); 