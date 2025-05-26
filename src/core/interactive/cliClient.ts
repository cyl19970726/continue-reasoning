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
      maxHistorySize: 1000
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
    
    if (!trimmedInput) return;

    // 添加到历史记录
    this.addToHistory(trimmedInput);

    // 检查是否有等待的提示
    if (this.pendingPrompts.length > 0) {
      const prompt = this.pendingPrompts.shift()!;
      prompt.resolve(trimmedInput);
      return;
    }

    // 处理特殊命令
    if (await this.handleSpecialCommands(trimmedInput)) {
      this.showPrompt();
      return;
    }

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

      case '/exit':
      case '/quit':
        await this.handleExit();
        return true;

      default:
        return false;
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
    console.log(chalk.gray('Use Ctrl+C to exit\n'));
  }

  private displayHelp(): void {
    console.log(chalk.cyan('\nAvailable Commands:'));
    console.log(chalk.white('/help - Show this help message'));
    console.log(chalk.white('/mode [auto|manual|supervised] - Set or view execution mode'));
    console.log(chalk.white('/history [n] - Show last n commands (default: 10)'));
    console.log(chalk.white('/clear - Clear the screen'));
    console.log(chalk.white('/events - Show active events'));
    console.log(chalk.white('/stats - Show event bus statistics'));
    console.log(chalk.white('/exit, /quit - Exit the application'));
    console.log('');
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

  private startInteractiveLoop(): void {
    this.showPrompt();
  }

  private showPrompt(): void {
    if (this.isWaitingForInput) return;
    
    const prefix = this.config.promptPrefix || '🤖';
    const modeIndicator = this.executionMode === 'auto' ? '⚡' : 
                         this.executionMode === 'manual' ? '✋' : '👁️';
    
    this.rl.setPrompt(chalk.green(`${prefix} ${modeIndicator} > `));
    this.rl.prompt();
  }

  private completer(line: string): [string[], string] {
    const commands = [
      '/help', '/mode', '/history', '/clear', '/events', '/stats', '/exit', '/quit'
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
} 