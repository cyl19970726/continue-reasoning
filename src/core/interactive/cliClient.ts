import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { 
  InteractiveMessage, 
  InteractiveCapabilities,
  ApprovalRequestEvent,
  InputRequestEvent,
  StatusUpdateEvent,
  ErrorEvent,
  CollaborationRequestEvent,
  AllEventMessages
} from '../events/types';
import { BaseInteractiveLayer, InteractiveLayerConfig } from '../events/interactiveLayer';
import { logger } from '../utils/logger';

export interface CLIClientConfig extends InteractiveLayerConfig {
  enableSyntaxHighlighting?: boolean;
  enableAutoComplete?: boolean;
  historyFile?: string;
  promptPrefix?: string;
  maxHistorySize?: number;
  enableMultilineInput?: boolean;
  multilineDelimiter?: string;
  enableFileInput?: boolean;
}

export class CLIClient extends BaseInteractiveLayer {
  private rl!: readline.Interface;
  protected config: CLIClientConfig;
  private commandHistory: string[] = [];
  private isWaitingForInput: boolean = false;
  private pendingPrompts: Array<{
    prompt: string;
    resolve: (input: string) => void;
    reject: (error: Error) => void;
  }> = [];
  private multilineBuffer: string[] = [];
  private isMultilineMode: boolean = false;

  constructor(config: CLIClientConfig) {
    super(config);
    this.config = config;
    this.setupReadline();
    this.loadHistory();
  }

  static createDefault(eventBus: any): CLIClient {
    const capabilities: InteractiveCapabilities = {
      supportsRealTimeUpdates: true,
      supportsFilePreview: false,
      supportsCodeHighlighting: true,
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
        'error',
        'execution_mode_change_request',
        'execution_mode_change_response',
        'task_event'
      ]
    };

    return new CLIClient({
      name: 'CLI Client',
      capabilities,
      eventBus,
      enableSyntaxHighlighting: true,
      enableAutoComplete: true,
      historyFile: path.join(process.cwd(), '.cli_history'),
      promptPrefix: '🤖',
      maxHistorySize: 1000,
      enableMultilineInput: true,
      multilineDelimiter: '###',
      enableFileInput: true
    });
  }

  async sendMessage(message: InteractiveMessage): Promise<void> {
    // EventBus expects events without id and timestamp (it will generate them)
    const { id, timestamp, ...eventWithoutIdAndTimestamp } = message;
    await this.config.eventBus.publish(eventWithoutIdAndTimestamp);
    this.displayMessage(message);
  }

  protected async onStart(): Promise<void> {
    // 订阅各种事件类型
    this.subscribe(['approval_request'], this.handleApprovalRequest.bind(this));
    this.subscribe(['input_request'], this.handleInputRequest.bind(this));
    this.subscribe(['status_update'], this.handleStatusUpdate.bind(this));
    this.subscribe(['error'], this.handleError.bind(this));
    this.subscribe(['collaboration_request'], this.handleCollaborationRequest.bind(this));
    this.subscribe(['agent_reply'], this.handleAgentReply.bind(this));
    
    // 订阅 plan 相关事件
    this.subscribe(['plan_created'], this.handlePlanCreated.bind(this));
    this.subscribe(['plan_step_started'], this.handlePlanStepStarted.bind(this));
    this.subscribe(['plan_step_completed'], this.handlePlanStepCompleted.bind(this));
    this.subscribe(['plan_progress_update'], this.handlePlanProgressUpdate.bind(this));
    this.subscribe(['plan_completed'], this.handlePlanCompleted.bind(this));
    this.subscribe(['plan_error'], this.handlePlanError.bind(this));

    this.displayWelcome();
    this.startInteractiveLoop();
  }

  protected async onStop(): Promise<void> {
    this.saveHistory();
    this.rl?.close();
  }

  private setupReadline(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.config.enableAutoComplete ? this.completer.bind(this) : undefined,
      history: this.commandHistory
    });

    // 处理用户输入
    this.rl.on('line', this.handleUserInput.bind(this));
    
    // 处理退出信号
    this.rl.on('SIGINT', () => {
      this.handleExit();
    });

    // 处理关闭事件
    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  private async handleUserInput(input: string): Promise<void> {
    const trimmedInput = input.trim();
    
    // 处理空输入
    if (!trimmedInput) {
      if (this.isMultilineMode) {
        this.multilineBuffer.push('');
      }
      this.showPrompt();
      return;
    }

    // 检查是否有等待的提示
    if (this.pendingPrompts.length > 0) {
      const prompt = this.pendingPrompts.shift()!;
      prompt.resolve(trimmedInput);
      return;
    }

    // 处理多行输入模式
    if (this.config.enableMultilineInput) {
      const delimiter = this.config.multilineDelimiter || '###';
      
      // 检查是否开始多行输入
      if (trimmedInput === delimiter && !this.isMultilineMode) {
        this.isMultilineMode = true;
        this.multilineBuffer = [];
        console.log(chalk.cyan(`📝 Multi-line input mode started!`));
        console.log(chalk.gray(`   • Press Enter to create new lines`));
        console.log(chalk.gray(`   • Type '${delimiter}' on a new line to finish and send`));
        this.showPrompt();
        return;
      }
      
      // 检查是否结束多行输入
      if (trimmedInput === delimiter && this.isMultilineMode) {
        this.isMultilineMode = false;
        const multilineContent = this.multilineBuffer.join('\n');
        this.multilineBuffer = [];
        
        if (multilineContent.trim()) {
          this.addToHistory(multilineContent);
          await this.sendUserMessage(multilineContent);
        }
        console.log(chalk.green('✅ Multi-line input completed.'));
        this.showPrompt();
        return;
      }
      
      // 在多行模式中收集输入
      if (this.isMultilineMode) {
        this.multilineBuffer.push(input); // 保留原始输入，包括空格
        this.showPrompt();
        return;
      }
    }

    // 处理文件输入命令
    if (this.config.enableFileInput && trimmedInput.startsWith('/file ')) {
      const filePath = trimmedInput.substring(6).trim();
      await this.handleFileInput(filePath);
      this.showPrompt();
      return;
    }

    // 处理特殊命令
    if (await this.handleSpecialCommands(trimmedInput)) {
      this.showPrompt();
      return;
    }

    // 添加到历史记录
    this.addToHistory(trimmedInput);

    // 发送用户消息
    await this.sendUserMessage(trimmedInput);
    this.showPrompt();
  }

  private async handleSpecialCommands(input: string): Promise<boolean> {
    const [command, ...args] = input.split(' ');

    switch (command.toLowerCase()) {
      case '/help':
        this.displayHelp();
        return true;

      case '/mode':
        if (args[0]) {
          await this.setExecutionMode(args[0] as 'auto' | 'manual' | 'supervised');
          console.log(chalk.green(`✓ Execution mode changed to: ${args[0]}`));
        } else {
          console.log(chalk.yellow(`Current execution mode: ${this.executionMode}`));
        }
        return true;

      case '/multiline':
        if (this.config.enableMultilineInput) {
          const delimiter = this.config.multilineDelimiter || '###';
          this.isMultilineMode = true;
          this.multilineBuffer = [];
          console.log(chalk.cyan(`📝 Multi-line input mode started. Type '${delimiter}' on a new line to finish.`));
        } else {
          console.log(chalk.red('Multi-line input is not enabled.'));
        }
        return true;

      case '/history':
        this.displayHistory(parseInt(args[0]) || 10);
        return true;

      case '/clear':
        console.clear();
        this.displayWelcome();
        return true;

      case '/events':
        this.displayActiveEvents();
        return true;

      case '/stats':
        this.displayStats();
        return true;

      case '/plan':
        this.displayPlanStatus();
        return true;

      case '/exit':
      case '/quit':
        await this.handleExit();
        return true;

      default:
        return false;
    }
  }

  private async handleFileInput(filePath: string): Promise<void> {
    try {
      // 解析相对路径
      const resolvedPath = path.resolve(filePath);
      
      // 检查文件是否存在
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.red(`❌ File not found: ${filePath}`));
        return;
      }

      // 检查是否是文件
      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        console.log(chalk.red(`❌ Path is not a file: ${filePath}`));
        return;
      }

      // 检查文件大小（限制为 1MB）
      const maxSize = 1024 * 1024; // 1MB
      if (stats.size > maxSize) {
        console.log(chalk.red(`❌ File too large (${Math.round(stats.size / 1024)}KB). Maximum size: ${Math.round(maxSize / 1024)}KB`));
        return;
      }

      // 读取文件内容
      const content = fs.readFileSync(resolvedPath, 'utf8');
      
      console.log(chalk.green(`📁 Loading file: ${filePath} (${stats.size} bytes)`));
      console.log(chalk.gray('File content:'));
      console.log(chalk.gray('-'.repeat(50)));
      console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      console.log(chalk.gray('-'.repeat(50)));

      // 添加到历史记录
      this.addToHistory(`[FILE: ${filePath}]\n${content}`);

      // 发送文件内容作为用户消息
      await this.sendUserMessage(`[FILE: ${filePath}]\n${content}`);
      
      console.log(chalk.green('✅ File content sent to agent.'));
      
    } catch (error) {
      console.log(chalk.red(`❌ Error reading file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async sendUserMessage(content: string): Promise<void> {
    // 发送用户消息事件而不是输入响应事件
    const message: InteractiveMessage = {
      id: '',
      timestamp: 0,
      type: 'user_message',
      source: 'user',
      sessionId: this.currentSession,
      payload: {
        content,
        messageType: 'question',
        context: {
          currentTask: 'user_interaction'
        }
      }
    };

    await this.sendMessage(message);
  }

  private async handleApprovalRequest(message: AllEventMessages): Promise<void> {
    const event = message as ApprovalRequestEvent;
    const { requestId, description, details } = event.payload;

    console.log(chalk.yellow('\n⚠️  Approval Required'));
    console.log(chalk.white(`Description: ${description}`));
    console.log(chalk.white(`Risk Level: ${this.colorizeRiskLevel(details.riskLevel)}`));
    console.log(chalk.gray(`Request ID: ${requestId}`));
    
    if (details.command) {
      console.log(chalk.gray(`Command: ${details.command}`));
    }
    
    if (details.preview) {
      console.log(chalk.gray(`Preview:\n${details.preview}`));
    }

    const response = await this.promptUser('Do you approve this action? (y/n/m for modify): ');
    
    let decision: 'accept' | 'reject' | 'modify' = 'reject';
    let modification: string | undefined;

    switch (response.toLowerCase()) {
      case 'y':
        decision = 'accept';
        break;
      case 'yes':
        decision = 'accept';
        break;
      case 'm':
        decision = 'modify';
        break;
      case 'modify':
        decision = 'modify';
        modification = await this.promptUser('Enter your modification: ');
        break;
      case 'n':
        decision = 'reject';
        break;
      case 'no':
        decision = 'reject';
        break;
      default:
        decision = 'reject';
    }

    const responseMessage: InteractiveMessage = {
      id: '',
      timestamp: 0,
      type: 'approval_response',
      source: 'user',
      sessionId: this.currentSession,
      payload: {
        requestId,
        decision,
        modification,
        rememberChoice: false
      }
    };

    console.log(chalk.green(`\n✅ Sending approval response with requestId: ${requestId}, decision: ${decision}`));
    await this.sendMessage(responseMessage);
  }

  private async handleInputRequest(message: AllEventMessages): Promise<void> {
    const event = message as InputRequestEvent;
    const { prompt, inputType, options, validation } = event.payload;

    console.log(chalk.cyan(`\n📝 Input Required: ${prompt}`));
    
    if (options && options.length > 0) {
      console.log(chalk.gray(`Options: ${options.join(', ')}`));
    }

    let userInput: string;
    let isValid = false;

    do {
      userInput = await this.promptUser('> ');
      
      // 验证输入
      if (validation) {
        if (validation.required && !userInput.trim()) {
          console.log(chalk.red('This field is required.'));
          continue;
        }
        
        if (validation.pattern && !new RegExp(validation.pattern).test(userInput)) {
          console.log(chalk.red('Input format is invalid.'));
          continue;
        }
        
        if (validation.minLength && userInput.length < validation.minLength) {
          console.log(chalk.red(`Input must be at least ${validation.minLength} characters.`));
          continue;
        }
        
        if (validation.maxLength && userInput.length > validation.maxLength) {
          console.log(chalk.red(`Input must be no more than ${validation.maxLength} characters.`));
          continue;
        }
      }

      isValid = true;
    } while (!isValid);

    const responseMessage: InteractiveMessage = {
      id: '',
      timestamp: 0,
      type: 'input_response',
      source: 'user',
      sessionId: this.currentSession,
      payload: {
        requestId: event.id,
        value: userInput,
        cancelled: false
      }
    };

    await this.sendMessage(responseMessage);
  }

  private async handleStatusUpdate(message: AllEventMessages): Promise<void> {
    const event = message as StatusUpdateEvent;
    const { stage, message: statusMessage, progress } = event.payload;

    const stageIcon = this.getStageIcon(stage);
    const progressBar = progress !== undefined ? this.createProgressBar(progress) : '';
    
    console.log(chalk.blue(`${stageIcon} ${statusMessage} ${progressBar}`));
  }

  private async handleError(message: AllEventMessages): Promise<void> {
    const event = message as ErrorEvent;
    const { errorType, message: errorMessage, recoverable, suggestions } = event.payload;

    console.log(chalk.red(`\n❌ Error (${errorType}): ${errorMessage}`));
    
    if (suggestions && suggestions.length > 0) {
      console.log(chalk.yellow('Suggestions:'));
      suggestions.forEach((suggestion, index) => {
        console.log(chalk.yellow(`  ${index + 1}. ${suggestion}`));
      });
    }

    if (!recoverable) {
      console.log(chalk.red('This error is not recoverable. The system may need to be restarted.'));
    }
  }

  private async handleCollaborationRequest(message: AllEventMessages): Promise<void> {
    const event = message as CollaborationRequestEvent;
    const { problemType, context, urgency } = event.payload;

    console.log(chalk.magenta(`\n🤝 Collaboration Request (${urgency} priority)`));
    console.log(chalk.white(`Problem Type: ${problemType}`));
    console.log(chalk.white(`Description: ${context.description}`));
    
    if (context.errorMessage) {
      console.log(chalk.red(`Error: ${context.errorMessage}`));
    }
    
    if (context.codeSnippet) {
      console.log(chalk.gray(`Code:\n${context.codeSnippet}`));
    }
    
    if (context.suggestions && context.suggestions.length > 0) {
      console.log(chalk.yellow('Suggestions:'));
      context.suggestions.forEach((suggestion, index) => {
        console.log(chalk.yellow(`  ${index + 1}. ${suggestion}`));
      });
    }

    const response = await this.promptUser('Your response: ');
    
    const responseMessage: InteractiveMessage = {
      id: '',
      timestamp: 0,
      type: 'collaboration_response',
      source: 'user',
      sessionId: this.currentSession,
      payload: {
        requestId: event.id,
        response,
        actionItems: [],
        followUpQuestions: []
      }
    };

    await this.sendMessage(responseMessage);
  }

  private async handleAgentReply(message: AllEventMessages): Promise<void> {
    const event = message as any; // AgentReplyEvent
    const { content, replyType, metadata } = event.payload;

    // 根据回复类型选择不同的显示样式
    let icon = '🤖';
    let color = chalk.blue;
    
    switch (replyType) {
      case 'text':
        icon = '💬';
        color = chalk.white;
        break;
      case 'markdown':
        icon = '📝';
        color = chalk.cyan;
        break;
      case 'structured':
        icon = '📊';
        color = chalk.green;
        break;
    }

    console.log(color(`\n${icon} Agent Reply (${replyType}):`));
    console.log(chalk.white(content));
    
    // 显示元数据信息
    if (metadata) {
      if (metadata.reasoning) {
        console.log(chalk.gray(`💭 Reasoning: ${metadata.reasoning}`));
      }
      
      if (metadata.confidence !== undefined) {
        const confidencePercent = Math.round(metadata.confidence * 100);
        console.log(chalk.gray(`🎯 Confidence: ${confidencePercent}%`));
      }
      
      if (metadata.suggestions && metadata.suggestions.length > 0) {
        console.log(chalk.yellow('💡 Suggestions:'));
        metadata.suggestions.forEach((suggestion: string, index: number) => {
          console.log(chalk.yellow(`  ${index + 1}. ${suggestion}`));
        });
      }
    }
    
    console.log(''); // 添加空行
  }

  // Plan 事件处理方法
  private async handlePlanCreated(message: AllEventMessages): Promise<void> {
    const event = message as any; // PlanCreatedEvent
    const { planId, title, description, totalSteps, steps } = event.payload;

    console.log(chalk.green(`\n📋 Plan Created: ${title}`));
    console.log(chalk.white(`Description: ${description}`));
    console.log(chalk.gray(`Plan ID: ${planId}`));
    console.log(chalk.blue(`Total Steps: ${totalSteps}`));
    
    console.log(chalk.cyan('\n📝 Plan Steps:'));
    steps.forEach((step: any, index: number) => {
      const stepNumber = (index + 1).toString().padStart(2, '0');
      console.log(chalk.white(`  ${stepNumber}. ${step.title}`));
      console.log(chalk.gray(`      ${step.description}`));
      if (step.toolsToCall && step.toolsToCall.length > 0) {
        console.log(chalk.yellow(`      Tools: ${step.toolsToCall.join(', ')}`));
      }
    });
    console.log('');
  }

  private async handlePlanStepStarted(message: AllEventMessages): Promise<void> {
    const event = message as any; // PlanStepStartedEvent
    const { stepIndex, stepTitle, stepDescription, toolsToCall } = event.payload;

    const stepNumber = (stepIndex + 1).toString().padStart(2, '0');
    console.log(chalk.blue(`\n🚀 Step ${stepNumber} Started: ${stepTitle}`));
    console.log(chalk.gray(`   ${stepDescription}`));
    
    if (toolsToCall && toolsToCall.length > 0) {
      console.log(chalk.yellow(`   Tools to use: ${toolsToCall.join(', ')}`));
    }
    console.log('');
  }

  private async handlePlanStepCompleted(message: AllEventMessages): Promise<void> {
    const event = message as any; // PlanStepCompletedEvent
    const { stepIndex, stepTitle, nextStepTitle } = event.payload;

    const stepNumber = (stepIndex + 1).toString().padStart(2, '0');
    console.log(chalk.green(`\n✅ Step ${stepNumber} Completed: ${stepTitle}`));
    
    if (nextStepTitle) {
      console.log(chalk.cyan(`   Next: ${nextStepTitle}`));
    } else {
      console.log(chalk.magenta(`   🎉 All steps completed!`));
    }
    console.log('');
  }

  private async handlePlanProgressUpdate(message: AllEventMessages): Promise<void> {
    const event = message as any; // PlanProgressUpdateEvent
    const { currentStepIndex, totalSteps, completedSteps, progress, currentStepTitle } = event.payload;

    const progressBar = this.createProgressBar(progress, 30);
    const stepInfo = `Step ${currentStepIndex + 1}/${totalSteps}`;
    
    console.log(chalk.blue(`\n📊 Plan Progress: ${stepInfo} ${progressBar}`));
    console.log(chalk.gray(`   Completed: ${completedSteps}/${totalSteps} steps`));
    
    if (currentStepTitle) {
      console.log(chalk.white(`   Current: ${currentStepTitle}`));
    }
    console.log('');
  }

  private async handlePlanCompleted(message: AllEventMessages): Promise<void> {
    const event = message as any; // PlanCompletedEvent
    const { title, totalSteps, executionTime } = event.payload;

    const executionTimeFormatted = this.formatExecutionTime(executionTime);
    
    console.log(chalk.green(`\n🎉 Plan Completed Successfully!`));
    console.log(chalk.white(`   Plan: ${title}`));
    console.log(chalk.blue(`   Steps Completed: ${totalSteps}`));
    console.log(chalk.gray(`   Execution Time: ${executionTimeFormatted}`));
    console.log(chalk.green(`   ✨ All tasks have been completed successfully!`));
    console.log('');
  }

  private async handlePlanError(message: AllEventMessages): Promise<void> {
    const event = message as any; // PlanErrorEvent
    const { stepId, stepTitle, error, recoverable } = event.payload;

    console.log(chalk.red(`\n❌ Plan Execution Error`));
    
    if (stepTitle) {
      console.log(chalk.white(`   Step: ${stepTitle}`));
    }
    
    console.log(chalk.red(`   Error: ${error}`));
    
    if (recoverable) {
      console.log(chalk.yellow(`   🔄 This error is recoverable. The plan will attempt to continue.`));
    } else {
      console.log(chalk.red(`   ⚠️  This error is not recoverable. The plan execution may be stopped.`));
    }
    console.log('');
  }

  private promptUser(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pendingPrompts.push({ prompt, resolve, reject });
      // 直接显示提示，不使用 rl.question，因为我们用自己的输入处理机制
      process.stdout.write(chalk.cyan(prompt));
    });
  }

  private displayMessage(message: InteractiveMessage): void {
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    const sourceIcon = this.getSourceIcon(message.source);
    
    console.log(chalk.gray(`[${timestamp}] ${sourceIcon} ${message.type}`));
  }

  private displayWelcome(): void {
    console.log(chalk.green('🤖 HHH-AGI Interactive CLI'));
    console.log(chalk.gray('Type /help for available commands'));
    console.log(chalk.gray('Use Ctrl+C to exit'));
    console.log('');
    console.log(chalk.yellow('💡 Quick Start:'));
    console.log(chalk.gray('  • For simple messages: Just type and press Enter'));
    console.log(chalk.gray('  • For multi-line messages: Type ### → Enter → your message → ### → Enter'));
    console.log(chalk.gray('  • For help: Type /help'));
    console.log('');
  }

  private displayHelp(): void {
    console.log(chalk.cyan('\nAvailable Commands:'));
    console.log(chalk.white('/help - Show this help message'));
    console.log(chalk.white('/mode [auto|manual|supervised] - Set or view execution mode'));
    console.log(chalk.white('/multiline - Start multi-line input mode'));
    console.log(chalk.white('/file <path> - Load and send file content'));
    console.log(chalk.white('/history [n] - Show last n commands (default: 10)'));
    console.log(chalk.white('/clear - Clear the screen'));
    console.log(chalk.white('/events - Show active events'));
    console.log(chalk.white('/stats - Show event bus statistics'));
    console.log(chalk.white('/plan - Show plan execution status and info'));
    console.log(chalk.white('/exit, /quit - Exit the application'));
    console.log('');
    
    if (this.config.enableMultilineInput) {
      const delimiter = this.config.multilineDelimiter || '###';
      console.log(chalk.cyan('📝 Multi-line Input Guide:'));
      console.log(chalk.white(`1. Type '${delimiter}' and press Enter to start multi-line mode`));
      console.log(chalk.white(`2. Type your message with line breaks (Enter creates new lines)`));
      console.log(chalk.white(`3. Type '${delimiter}' and press Enter to finish and send`));
      console.log(chalk.gray('   Note: In multi-line mode, Enter will NOT send the message'));
      console.log(chalk.gray('   Only the closing delimiter will send the complete message'));
      console.log('');
    }
    
    if (this.config.enableFileInput) {
      console.log(chalk.cyan('File Input:'));
      console.log(chalk.white('Use /file <path> to load file content'));
      console.log(chalk.white('Supports text files up to 1MB'));
      console.log('');
    }
  }

  private displayHistory(count: number): void {
    const history = this.commandHistory.slice(-count);
    console.log(chalk.cyan('\nCommand History:'));
    history.forEach((cmd, index) => {
      console.log(chalk.gray(`${index + 1}. ${cmd}`));
    });
    console.log('');
  }

  private displayActiveEvents(): void {
    const events = this.getActiveEvents();
    console.log(chalk.cyan('\nActive Events:'));
    
    if (events.length === 0) {
      console.log(chalk.gray('No active events'));
    } else {
      events.forEach((event, index) => {
        const timestamp = new Date(event.timestamp).toLocaleTimeString();
        console.log(chalk.white(`${index + 1}. [${timestamp}] ${event.type} (${event.source})`));
      });
    }
    console.log('');
  }

  private displayStats(): void {
    const stats = this.config.eventBus.getStats();
    console.log(chalk.cyan('\nEvent Bus Statistics:'));
    console.log(chalk.white(`Total Events Published: ${stats.totalEventsPublished}`));
    console.log(chalk.white(`Active Subscriptions: ${stats.activeSubscriptions}`));
    console.log(chalk.white(`Active Sessions: ${stats.activeSessions}`));
    console.log(chalk.white(`Event History Size: ${stats.eventHistorySize}`));
    console.log(chalk.white(`Average Processing Time: ${stats.averageProcessingTime.toFixed(2)}ms`));
    console.log(chalk.white(`Error Rate: ${stats.errorRate.toFixed(2)}%`));
    console.log('');
  }

  private displayPlanStatus(): void {
    console.log(chalk.cyan('\n📋 Plan Status:'));
    console.log(chalk.gray('Use this command to view the current plan execution status.'));
    console.log(chalk.gray('Plan events will be displayed automatically as they occur.'));
    console.log(chalk.yellow('💡 Tip: Plan events include:'));
    console.log(chalk.white('  • Plan Created - When a new execution plan is generated'));
    console.log(chalk.white('  • Step Started - When a plan step begins execution'));
    console.log(chalk.white('  • Step Completed - When a plan step finishes'));
    console.log(chalk.white('  • Progress Updates - Real-time progress tracking'));
    console.log(chalk.white('  • Plan Completed - When all steps are finished'));
    console.log(chalk.white('  • Plan Errors - If any issues occur during execution'));
    console.log('');
  }

  private startInteractiveLoop(): void {
    this.showPrompt();
  }

  private showPrompt(): void {
    if (this.isWaitingForInput) return;
    
    const prefix = this.config.promptPrefix || '🤖';
    const modeIndicator = this.executionMode === 'auto' ? '⚡' : 
                         this.executionMode === 'manual' ? '✋' : '👁️';
    
    // 多行模式提示符
    if (this.isMultilineMode) {
      const lineNumber = this.multilineBuffer.length + 1;
      this.rl.setPrompt(chalk.yellow(`📝 ${lineNumber.toString().padStart(2)} | `));
    } else {
      this.rl.setPrompt(chalk.green(`${prefix} ${modeIndicator} > `));
    }
    
    this.rl.prompt();
  }

  private completer(line: string): [string[], string] {
    const commands = [
      '/help', '/mode', '/history', '/clear', '/events', '/stats', '/plan', '/exit', '/quit'
    ];
    
    const hits = commands.filter(cmd => cmd.startsWith(line));
    return [hits.length ? hits : commands, line];
  }

  private addToHistory(command: string): void {
    this.commandHistory.push(command);
    
    // 保持历史记录大小限制
    const maxSize = this.config.maxHistorySize || 1000;
    if (this.commandHistory.length > maxSize) {
      this.commandHistory = this.commandHistory.slice(-maxSize);
    }
  }

  private loadHistory(): void {
    if (!this.config.historyFile) return;
    
    try {
      if (fs.existsSync(this.config.historyFile)) {
        const historyData = fs.readFileSync(this.config.historyFile, 'utf8');
        this.commandHistory = historyData.split('\n').filter(line => line.trim());
      }
    } catch (error) {
      logger.warn('Failed to load command history:', error);
    }
  }

  private saveHistory(): void {
    if (!this.config.historyFile) return;
    
    try {
      const historyData = this.commandHistory.join('\n');
      fs.writeFileSync(this.config.historyFile, historyData, 'utf8');
    } catch (error) {
      logger.warn('Failed to save command history:', error);
    }
  }

  private async handleExit(): Promise<void> {
    console.log(chalk.yellow('\nExiting...'));
    await this.stop();
    process.exit(0);
  }

  // 工具方法
  private getSourceIcon(source: 'user' | 'agent' | 'system'): string {
    switch (source) {
      case 'user': return '👤';
      case 'agent': return '🤖';
      case 'system': return '⚙️';
      default: return '❓';
    }
  }

  private getStageIcon(stage: string): string {
    switch (stage) {
      case 'planning': return '📋';
      case 'executing': return '⚡';
      case 'testing': return '🧪';
      case 'reviewing': return '👀';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '⏳';
    }
  }

  private colorizeRiskLevel(level: string): string {
    switch (level) {
      case 'low': return chalk.green(level);
      case 'medium': return chalk.yellow(level);
      case 'high': return chalk.red(level);
      case 'critical': return chalk.red(level);
      default: return chalk.gray(level);
    }
  }

  private createProgressBar(progress: number, width: number = 20): string {
    const filled = Math.round((progress / 100) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return chalk.cyan(`[${bar}] ${progress}%`);
  }

  private formatExecutionTime(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = Math.floor((milliseconds % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }
} 