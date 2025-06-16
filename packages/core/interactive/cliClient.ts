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
import { IInteractionHub } from '../interfaces';
import { logger } from '../utils/logger';
import { 
  AgentInternalEvent, 
  AgentStepEvent, 
  AgentThinkingEvent, 
  AgentReplyEvent,
  ToolExecutionResultEvent,
  AgentStateChangeEvent,
  PlanCreatedEvent,
  PlanStepStartedEvent,
  PlanStepCompletedEvent,
  PlanProgressUpdateEvent,
  PlanCompletedEvent,
  PlanErrorEvent,
  FileCreatedEvent,
  FileModifiedEvent,
  FileDeletedEvent,
  DirectoryCreatedEvent,
  DiffReversedEvent
} from '../events/agentEvents';

export interface CLIClientConfig extends InteractiveLayerConfig {
  enableSyntaxHighlighting?: boolean;
  enableAutoComplete?: boolean;
  historyFile?: string;
  promptPrefix?: string;
  maxHistorySize?: number;
  enableMultilineInput?: boolean;
  multilineDelimiter?: string;
  enableFileInput?: boolean;
  enableRichInput?: boolean;
  enableInputPreview?: boolean;
  enableSmartPrompts?: boolean;
  enableKeyboardShortcuts?: boolean;
  maxPreviewLength?: number;
  showInputStats?: boolean;
  enableConversationHistory?: boolean;
  defaultUserId?: string;
  showDiffs?: boolean;
  enableStepTracking?: boolean;
  enablePerformanceMonitoring?: boolean;
}

// 新增：多行编辑器相关接口
interface EditorState {
  lines: string[];
  cursorRow: number;
  cursorCol: number;
  scrollTop: number;
  isActive: boolean;
}

interface EditorConfig {
  maxLines: number;
  maxLineLength: number;
  showLineNumbers: boolean;
  enableSyntaxHighlight: boolean;
  theme: 'light' | 'dark';
}

export class CLIClient extends BaseInteractiveLayer {
  public readonly id: string = 'cli-client';
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
  private interactionHub?: IInteractionHub;
  
  private currentInput: string = '';
  private inputStartTime: number = 0;
  private typingTimer?: NodeJS.Timeout;
  private currentSuggestions: string[] = [];
  private historyIndex: number = -1;
  private isComposing: boolean = false;
  private inputStats = {
    totalInputs: 0,
    totalCharacters: 0,
    averageInputLength: 0,
    multilineInputs: 0
  };

  private agentStats = {
    totalSteps: 0,
    averageStepDuration: 0,
    totalToolCalls: 0,
    toolCallStats: new Map<string, { count: number; totalTime: number; successRate: number }>(),
    currentPlan: null as any,
    planHistory: [] as any[]
  };

  private userId: string;

  // 新增粘贴检测相关属性
  private lastInputTime: number = 0;
  private inputBuffer: string[] = [];
  private pasteDetectionTimer?: NodeJS.Timeout;
  private isPasteMode: boolean = false;
  private pasteThreshold: number = 50; // 50ms内多行输入视为粘贴
  private autoMultilineThreshold: number = 3; // 3行以上自动进入多行模式
  private isRichInputSetup: boolean = false;

  // 新增：多行编辑器状态
  private editorState: EditorState = {
    lines: [''],
    cursorRow: 0,
    cursorCol: 0,
    scrollTop: 0,
    isActive: false
  };

  private editorConfig: EditorConfig = {
    maxLines: 50,
    maxLineLength: 120,
    showLineNumbers: true,
    enableSyntaxHighlight: true,
    theme: 'dark'
  };

  private isInAdvancedEditor: boolean = false;
  private savedRawMode: boolean = false;

  constructor(config: CLIClientConfig) {
    super(config);
    this.config = {
      enableRichInput: true,
      enableInputPreview: true,
      enableSmartPrompts: true,
      enableKeyboardShortcuts: true,
      maxPreviewLength: 100,
      showInputStats: false,
      enableConversationHistory: true,
      defaultUserId: 'cli-user',
      showDiffs: true,
      enableStepTracking: true,
      enablePerformanceMonitoring: true,
      ...config
    };
    this.userId = this.config.defaultUserId || 'cli-user';
    this.setupReadline();
    this.loadHistory();
  }

  protected getUserId(): string {
    return this.userId;
  }

  protected extractAgentId(message: InteractiveMessage): string {
    return (message.payload as any)?.agentId || 'default-agent';
  }

  protected extractContent(message: InteractiveMessage): string {
    return (message.payload as any)?.content || JSON.stringify(message.payload);
  }

  protected displayMessage(message: InteractiveMessage): void {
    const timestamp = new Date(message.timestamp).toLocaleTimeString();
    const sourceIcon = this.getSourceIcon(message.source);
    
    console.log(chalk.gray(`[${timestamp}] ${sourceIcon} ${message.type}`));
  }

  setInteractionHub(hub: IInteractionHub): void {
    this.interactionHub = hub;
    logger.info('CLIClient: InteractionHub reference set');
  }

  setUserId(userId: string): void {
    this.userId = userId;
    logger.info(`CLIClient: User ID set to ${userId}`);
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
        'task_event',
        'user_message',
        'agent_reply',
        'agent_thinking',
        'think',
        'agent_step',
        'agent_step_start',
        'agent_state_change',
        'tool_execution_result',
        'plan_created',
        'plan_step_started',
        'plan_step_completed',
        'plan_progress_update',
        'plan_completed',
        'plan_error',
        'file_created',
        'file_modified',
        'file_deleted',
        'directory_created',
        'diff_reversed'
      ]
    };

    return new CLIClient({
      name: 'Enhanced CLI Client with Agent Event Support',
      capabilities,
      eventBus,
      enableSyntaxHighlighting: true,
      enableAutoComplete: true,
      historyFile: path.join(process.cwd(), '.cli_history'),
      promptPrefix: '🤖',
      maxHistorySize: 1000,
      enableMultilineInput: true,
      multilineDelimiter: '###',
      enableFileInput: true,
      enableRichInput: true,
      enableInputPreview: true,
      enableSmartPrompts: true,
      enableKeyboardShortcuts: true,
      maxPreviewLength: 150,
      showInputStats: true,
      enableConversationHistory: true,
      defaultUserId: 'cli-user',
      showDiffs: true,
      enableStepTracking: true,
      enablePerformanceMonitoring: true
    });
  }

  async sendMessage(message: InteractiveMessage): Promise<void> {
    const { id, timestamp, ...eventWithoutIdAndTimestamp } = message;
    await this.config.eventBus.publish(eventWithoutIdAndTimestamp);
    this.displayMessage(message);
  }

  protected async onStart(): Promise<void> {
    this.subscribe(['approval_request'], this.handleApprovalRequest.bind(this));
    this.subscribe(['input_request'], this.handleInputRequest.bind(this));
    this.subscribe(['status_update'], this.handleStatusUpdate.bind(this));
    this.subscribe(['error'], this.handleError.bind(this));
    this.subscribe(['collaboration_request'], this.handleCollaborationRequest.bind(this));
    this.subscribe(['agent_reply'], this.handleAgentReply.bind(this));
    this.subscribe(['agent_thinking'], this.handleAgentThinking.bind(this));
    this.subscribe(['think'], this.handleThinkEvent.bind(this));
    this.subscribe(['agent_step'], this.handleAgentStep.bind(this));
    this.subscribe(['agent_step_start'], this.handleAgentStepStart.bind(this));
    this.subscribe(['agent_state_change'], this.handleAgentStateChange.bind(this));
    this.subscribe(['tool_execution_result'], this.handleToolExecutionResult.bind(this));
    this.subscribe(['plan_created'], this.handlePlanCreated.bind(this));
    this.subscribe(['plan_step_started'], this.handlePlanStepStarted.bind(this));
    this.subscribe(['plan_step_completed'], this.handlePlanStepCompleted.bind(this));
    this.subscribe(['plan_progress_update'], this.handlePlanProgressUpdate.bind(this));
    this.subscribe(['plan_completed'], this.handlePlanCompleted.bind(this));
    this.subscribe(['plan_error'], this.handlePlanError.bind(this));
    this.subscribe(['file_created'], this.handleFileCreated.bind(this));
    this.subscribe(['file_modified'], this.handleFileModified.bind(this));
    this.subscribe(['file_deleted'], this.handleFileDeleted.bind(this));
    this.subscribe(['directory_created'], this.handleDirectoryCreated.bind(this));
    this.subscribe(['diff_reversed'], this.handleDiffReversed.bind(this));

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

    this.rl.on('line', this.handleUserInput.bind(this));
    
    if (this.config.enableKeyboardShortcuts) {
      this.setupKeyboardShortcuts();
    }
    
    this.rl.on('SIGINT', () => {
      if (this.isMultilineMode) {
        console.log(chalk.yellow('\n📝 Exiting multi-line mode...'));
        this.isMultilineMode = false;
        this.multilineBuffer = [];
        this.showPrompt();
      } else {
        this.handleExit();
      }
    });

    this.rl.on('close', () => {
      process.exit(0);
    });

    if (this.config.enableRichInput) {
      this.setupRichInput();
    }
  }

  private setupKeyboardShortcuts(): void {
    process.stdin.on('keypress', (chunk, key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'l') {
        console.clear();
        this.displayWelcome();
        this.showPrompt();
        return;
      }

      if (key.ctrl && key.name === 'h') {
        this.displayHelp();
        this.showPrompt();
        return;
      }

      if (key.ctrl && key.name === 'r') {
        this.displayHistory(20);
        this.showPrompt();
        return;
      }

      if (key.ctrl && key.name === 'm') {
        if (!this.isMultilineMode) {
          this.startMultilineMode();
        } else {
          this.exitMultilineMode();
        }
        return;
      }

      if (key.ctrl && key.name === 's') {
        this.displayInputStats();
        this.showPrompt();
        return;
      }

      if (key.name === 'up' || key.name === 'down') {
        this.handleHistoryNavigation(key.name === 'up');
        return;
      }

      if (key.name === 'tab' && this.config.enableAutoComplete) {
        this.handleSmartCompletion();
        return;
      }
    });
  }

  private setupRichInput(): void {
    let inputBuffer = '';
    
    process.stdin.on('data', (chunk) => {
      if (this.isComposing) return;
      
      const input = chunk.toString();
      inputBuffer += input;
      
      if (this.typingTimer) {
        clearTimeout(this.typingTimer);
      }
      
      this.typingTimer = setTimeout(() => {
        this.handleTypingFeedback(inputBuffer);
        inputBuffer = '';
      }, 300);
    });
  }

  private async handleUserInput(input: string): Promise<void> {
    const trimmedInput = input.trim();
    const currentTime = Date.now();
    
    // 粘贴检测逻辑
    const timeSinceLastInput = currentTime - this.lastInputTime;
    this.lastInputTime = currentTime;
    
    // 检测是否为粘贴操作
    if (timeSinceLastInput < this.pasteThreshold && !this.isPasteMode) {
      this.startPasteMode();
    }
    
    // 如果在粘贴模式下，收集输入行
    if (this.isPasteMode) {
      this.inputBuffer.push(input);
      
      // 重置粘贴检测计时器
      if (this.pasteDetectionTimer) {
        clearTimeout(this.pasteDetectionTimer);
      }
      
      this.pasteDetectionTimer = setTimeout(() => {
        this.processPastedContent();
      }, this.pasteThreshold * 2); // 100ms后处理粘贴内容
      
      return;
    }
    
    this.updateInputStats(input);
    
    if (!trimmedInput) {
      if (this.isMultilineMode) {
        this.multilineBuffer.push('');
      }
      this.showPrompt();
      return;
    }

    if (this.pendingPrompts.length > 0) {
      const prompt = this.pendingPrompts.shift()!;
      prompt.resolve(trimmedInput);
      return;
    }

    if (this.config.enableMultilineInput) {
      const delimiter = this.config.multilineDelimiter || '###';
      
      if (trimmedInput === delimiter && !this.isMultilineMode) {
        this.startMultilineMode();
        return;
      }
      
      if (trimmedInput === delimiter && this.isMultilineMode) {
        this.exitMultilineMode();
        return;
      }
      
      if (this.isMultilineMode) {
        this.multilineBuffer.push(input);
        this.showMultilinePreview();
        this.showPrompt();
        return;
      }
    }

    if (this.config.enableFileInput && trimmedInput.startsWith('/file ')) {
      const filePath = trimmedInput.substring(6).trim();
      await this.handleFileInput(filePath);
      this.showPrompt();
      return;
    }

    if (await this.handleSpecialCommands(trimmedInput)) {
      this.showPrompt();
      return;
    }

    this.addToHistory(trimmedInput);

    if (this.config.enableInputPreview && trimmedInput.length > 50) {
      this.showInputPreview(trimmedInput);
    }

    await this.sendUserMessage(trimmedInput);
    this.showPrompt();
  }

  private startMultilineMode(): void {
    this.isMultilineMode = true;
    this.multilineBuffer = [];
    const delimiter = this.config.multilineDelimiter || '###';
    
    console.log(chalk.cyan(`\n📝 Multi-line input mode activated!`));
    console.log(chalk.gray(`┌─ Tips:`));
    console.log(chalk.gray(`├─ • Press Enter to create new lines`));
    console.log(chalk.gray(`├─ • Type '${delimiter}' on a new line to finish and send`));
    console.log(chalk.gray(`├─ • Press Ctrl+M to exit without sending`));
    console.log(chalk.gray(`└─ • Press Ctrl+C to cancel and exit`));
    console.log('');
    this.showPrompt();
  }

  private exitMultilineMode(): void {
    if (!this.isMultilineMode) return;
    
    this.isMultilineMode = false;
    const multilineContent = this.multilineBuffer.join('\n');
    this.multilineBuffer = [];
    
    if (multilineContent.trim()) {
      this.inputStats.multilineInputs++;
      this.addToHistory(multilineContent);
      
      console.log(chalk.cyan('└─ Multi-line input completed!'));
      console.log('');
      
      // Claude风格的内容预览
      const lines = multilineContent.split('\n');
      console.log(chalk.yellow('📋 ') + chalk.bold('Content Preview:'));
      console.log(chalk.gray(`   ${lines.length} lines, ${multilineContent.length} characters`));
      
      if (this.config.enableInputPreview && multilineContent.length <= 200) {
        console.log('');
        console.log(chalk.gray('┌─ Content:'));
        lines.slice(0, 5).forEach((line, index) => {
          const lineNum = (index + 1).toString().padStart(2, '0');
          const displayLine = line.length > 60 ? line.substring(0, 60) + '...' : line;
          console.log(chalk.gray(`│ ${lineNum} │ `) + chalk.white(displayLine));
        });
        
        if (lines.length > 5) {
          console.log(chalk.gray(`│ .. │ ... (${lines.length - 5} more lines)`));
        }
        
        console.log(chalk.gray('└────'));
      }
      
      console.log('');
      console.log(chalk.green('✨ Sending to agent...'));
      console.log('');
      
      this.sendUserMessage(multilineContent);
    } else {
      console.log(chalk.cyan('└─ Multi-line input cancelled (empty content)'));
      console.log('');
    }
  }

  private startPasteMode(): void {
    this.isPasteMode = true;
    this.inputBuffer = [];
    console.log(chalk.cyan('\n📋 Paste mode detected! Collecting input...'));
  }

  private async processPastedContent(): Promise<void> {
    this.isPasteMode = false;
    
    if (this.pasteDetectionTimer) {
      clearTimeout(this.pasteDetectionTimer);
      this.pasteDetectionTimer = undefined;
    }
    
    if (this.inputBuffer.length === 0) {
      this.showPrompt();
      return;
    }
    
    const pastedContent = this.inputBuffer.join('\n');
    const lineCount = this.inputBuffer.length;
    const charCount = pastedContent.length;
    
    console.log(chalk.green(`\n✅ Paste completed!`));
    console.log(chalk.gray(`📊 Content: ${charCount} characters, ${lineCount} lines`));
    
    // 自动判断是否需要特殊处理
    if (lineCount >= this.autoMultilineThreshold) {
      console.log(chalk.cyan(`🤖 Large content detected (${lineCount} lines). Processing as multi-line input...`));
      
      // 显示内容预览
      if (this.config.enableInputPreview) {
        this.showPastePreview(pastedContent);
      }
      
      // 询问用户是否要编辑内容
      const shouldEdit = await this.promptPasteAction(pastedContent);
      if (shouldEdit === 'edit') {
        await this.enterEditMode(pastedContent);
        return;
      } else if (shouldEdit === 'cancel') {
        console.log(chalk.yellow('📝 Paste cancelled'));
        this.inputBuffer = [];
        this.showPrompt();
        return;
      }
    }
    
    // 统计更新
    this.updateInputStats(pastedContent);
    this.inputStats.multilineInputs++;
    this.addToHistory(pastedContent);
    
    // 发送内容
    await this.sendUserMessage(pastedContent);
    this.inputBuffer = [];
    this.showPrompt();
  }

  private showPastePreview(content: string): void {
    const maxPreviewLength = 300;
    const lines = content.split('\n');
    
    console.log('');
    console.log(chalk.yellow('📋 ') + chalk.bold('Pasted Content Preview:'));
    console.log(chalk.gray(`   ${lines.length} lines, ${content.length} characters`));
    console.log('');
    
    console.log(chalk.gray('┌─ Content:'));
    
    if (content.length <= maxPreviewLength) {
      lines.forEach((line, index) => {
        if (index < 8) { // 最多显示8行
          const lineNum = (index + 1).toString().padStart(2, '0');
          const displayLine = line.length > 60 ? line.substring(0, 60) + '...' : line;
          console.log(chalk.gray(`│ ${lineNum} │ `) + chalk.white(displayLine));
        }
      });
      
      if (lines.length > 8) {
        console.log(chalk.gray(`│ .. │ ... (${lines.length - 8} more lines)`));
      }
    } else {
      // 显示前几行和后几行
      const preview = content.substring(0, maxPreviewLength);
      const previewLines = preview.split('\n');
      
      previewLines.forEach((line, index) => {
        if (index < 6) {
          const lineNum = (index + 1).toString().padStart(2, '0');
          const displayLine = line.length > 60 ? line.substring(0, 60) + '...' : line;
          console.log(chalk.gray(`│ ${lineNum} │ `) + chalk.white(displayLine));
        }
      });
      
      if (lines.length > 6) {
        console.log(chalk.gray(`│ .. │ ... (${lines.length - 6} more lines) ...`));
        console.log(chalk.gray(`│    │ ${chalk.yellow(`[Content truncated - showing first ${maxPreviewLength} characters]`)}`));
      }
    }
    
    console.log(chalk.gray('└────'));
    console.log('');
  }

  private async promptPasteAction(content: string): Promise<'send' | 'edit' | 'cancel'> {
    console.log(chalk.cyan('🤔 ') + chalk.bold('How would you like to proceed?'));
    console.log('');
    console.log(chalk.white('  ') + chalk.green('s') + chalk.gray(' - ') + chalk.white('Send as-is'));
    console.log(chalk.white('  ') + chalk.yellow('e') + chalk.gray(' - ') + chalk.white('Edit before sending'));
    console.log(chalk.white('  ') + chalk.red('c') + chalk.gray(' - ') + chalk.white('Cancel'));
    console.log('');
    
    const response = await this.promptUser(chalk.bold('Choose action: '));
    
    switch (response.toLowerCase()) {
      case 's':
      case 'send':
        return 'send';
      case 'e':
      case 'edit':
        return 'edit';
      case 'c':
      case 'cancel':
        return 'cancel';
      default:
        console.log(chalk.yellow('⚠️  Invalid choice, sending as-is...'));
        return 'send';
    }
  }

  private async enterEditMode(content: string): Promise<void> {
    console.log(chalk.cyan('✏️  ') + chalk.bold('Edit Mode - Enhanced Multi-line Input'));
    console.log('');
    console.log(chalk.gray('Your pasted content has been loaded into edit mode.'));
    console.log(chalk.gray('You can now modify it before sending.'));
    console.log('');
    console.log(chalk.yellow('💡 Instructions:'));
    console.log(chalk.gray('  • Continue typing to add more content'));
    console.log(chalk.gray('  • Type ### on a new line to finish editing and send'));
    console.log(chalk.gray('  • Press Ctrl+C to cancel without sending'));
    console.log('');
    
    // 进入多行模式并预填充内容
    this.isMultilineMode = true;
    this.multilineBuffer = content.split('\n');
    
    // 显示当前内容状态
    const lines = this.multilineBuffer.length;
    const chars = content.length;
    console.log(chalk.blue('📝 ') + chalk.bold('Current content:'));
    console.log(chalk.gray(`   ${lines} lines, ${chars} characters loaded`));
    console.log('');
    
    console.log(chalk.cyan('┌─ Edit Mode Active'));
    console.log(chalk.cyan('│  ') + chalk.gray('Continue typing below to modify your content...'));
    console.log(chalk.cyan('│'));
    
    this.showPrompt();
  }

  private showMultilinePreview(): void {
    if (!this.config.enableInputPreview || this.multilineBuffer.length === 0) return;
    
    const content = this.multilineBuffer.join('\n');
    const lines = this.multilineBuffer.length;
    const chars = content.length;
    
    console.log(chalk.gray(`📝 Multi-line preview: ${lines} lines, ${chars} characters`));
    
    if (content.length > 0 && content.length <= (this.config.maxPreviewLength || 100)) {
      const preview = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      console.log(chalk.gray(`   Preview: "${preview}"`));
    }
  }

  private showInputPreview(input: string): void {
    if (!this.config.enableInputPreview) return;
    
    const maxLength = this.config.maxPreviewLength || 100;
    const preview = input.length > maxLength ? 
      input.substring(0, maxLength) + '...' : input;
    
    console.log(chalk.gray(`📋 Input preview (${input.length} chars): "${preview}"`));
    
    if (input.startsWith('/')) {
      console.log(chalk.blue(`🔧 Detected: Command input`));
    } else if (input.includes('\n')) {
      console.log(chalk.blue(`📄 Detected: Multi-line content`));
    } else if (input.length > 200) {
      console.log(chalk.blue(`📝 Detected: Long text input`));
    } else if (input.includes('?')) {
      console.log(chalk.blue(`❓ Detected: Question input`));
    }
  }

  private displayInputStats(): void {
    console.log(chalk.cyan('\n📊 Input Statistics:'));
    console.log(chalk.white(`Total inputs: ${this.inputStats.totalInputs}`));
    console.log(chalk.white(`Total characters: ${this.inputStats.totalCharacters}`));
    console.log(chalk.white(`Average input length: ${this.inputStats.averageInputLength.toFixed(1)} chars`));
    console.log(chalk.white(`Multi-line inputs: ${this.inputStats.multilineInputs}`));
    console.log(chalk.white(`Command history size: ${this.commandHistory.length}`));
    
    if (this.inputStats.totalInputs > 0) {
      const multilinePercent = (this.inputStats.multilineInputs / this.inputStats.totalInputs * 100).toFixed(1);
      console.log(chalk.gray(`Multi-line usage: ${multilinePercent}%`));
    }
    console.log('');
  }

  private updateInputStats(input: string): void {
    this.inputStats.totalInputs++;
    this.inputStats.totalCharacters += input.length;
    this.inputStats.averageInputLength = this.inputStats.totalCharacters / this.inputStats.totalInputs;
  }

  private handleHistoryNavigation(up: boolean): void {
    if (this.commandHistory.length === 0) return;
    
    if (up) {
      if (this.historyIndex < this.commandHistory.length - 1) {
        this.historyIndex++;
      }
    } else {
      if (this.historyIndex > -1) {
        this.historyIndex--;
      }
    }
    
    if (this.historyIndex >= 0 && this.historyIndex < this.commandHistory.length) {
      const historyItem = this.commandHistory[this.commandHistory.length - 1 - this.historyIndex];
      this.rl.write(null, { ctrl: true, name: 'u' });
      this.rl.write(historyItem);
      
      if (this.config.enableInputPreview) {
        console.log(chalk.gray(`📚 History: ${this.historyIndex + 1}/${this.commandHistory.length}`));
      }
    }
  }

  private handleSmartCompletion(): void {
    const line = (this.rl as any).line || '';
    const suggestions = this.generateSmartSuggestions(line);
    
    if (suggestions.length === 0) return;
    
    console.log(chalk.cyan('\n💡 Smart suggestions:'));
    suggestions.forEach((suggestion, index) => {
      console.log(chalk.white(`  ${index + 1}. ${suggestion}`));
    });
    
    this.showPrompt();
  }

  private generateSmartSuggestions(input: string): string[] {
    const suggestions: string[] = [];
    
    if (input.startsWith('/')) {
      const commands = ['/help', '/mode', '/history', '/clear', '/events', '/stats', '/plan', '/exit'];
      suggestions.push(...commands.filter(cmd => cmd.startsWith(input)));
    }
    
    const recentCommands = this.commandHistory
      .slice(-10)
      .filter(cmd => cmd.toLowerCase().includes(input.toLowerCase()))
      .slice(0, 3);
    
    suggestions.push(...recentCommands);
    
    if (input.includes('file') || input.includes('路径')) {
      suggestions.push('/file <path>', 'Please specify the file path');
    }
    
    if (input.includes('help') || input.includes('帮助')) {
      suggestions.push('/help', 'Type /help for available commands');
    }
    
    return [...new Set(suggestions)].slice(0, 5);
  }

  private handleTypingFeedback(input: string): void {
    if (!this.config.enableRichInput || input.length === 0) return;
    
    if (input.includes('###') && !this.isMultilineMode) {
      console.log(chalk.yellow('💡 Tip: Type ### to start multi-line input mode'));
    }
    
    if (input.startsWith('/') && input.length > 1) {
      const possibleCommands = ['/help', '/mode', '/history', '/clear'];
      const matches = possibleCommands.filter(cmd => cmd.startsWith(input));
      
      if (matches.length > 0 && matches.length <= 3) {
        console.log(chalk.gray(`💡 Suggestions: ${matches.join(', ')}`));
      }
    }
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

      case '/features':
        this.displayFeatures();
        return true;

      case '/toggle':
        if (args[0]) {
          await this.toggleFeature(args[0]);
        } else {
          console.log(chalk.yellow('Available features to toggle: preview, shortcuts, smart, stats, history, diffs, tracking, monitoring'));
          console.log(chalk.gray('Usage: /toggle <feature>'));
        }
        return true;

      case '/conversation':
      case '/conv':
        await this.displayConversationHistory(parseInt(args[0]) || 10);
        return true;

      case '/session':
        this.displaySessionInfo();
        return true;

      case '/user':
        if (args[0]) {
          this.setUserId(args[0]);
          console.log(chalk.green(`✓ User ID changed to: ${args[0]}`));
        } else {
          console.log(chalk.yellow(`Current user ID: ${this.userId}`));
        }
        return true;

      case '/memory':
        await this.displayMemoryStats();
        return true;

      case '/search':
        if (args.length > 0) {
          const query = args.join(' ');
          await this.searchConversationHistory(query);
        } else {
          console.log(chalk.yellow('Usage: /search <query>'));
          console.log(chalk.gray('Example: /search React component'));
        }
        return true;

      case '/performance':
      case '/perf':
        this.displayPerformanceStats();
        return true;

      case '/tools':
        this.displayToolStats();
        return true;

      case '/agent':
        this.displayAgentInfo();
        return true;

      case '/reset':
        this.resetStats();
        console.log(chalk.green('✅ Statistics reset successfully'));
        return true;

      case '/paste':
        console.log(chalk.cyan('\n📋 Enhanced Paste Mode'));
        console.log(chalk.gray('This mode provides intelligent handling of large pasted content.'));
        console.log(chalk.white('Features:'));
        console.log(chalk.gray('  • Automatic detection of multi-line paste operations'));
        console.log(chalk.gray('  • Content preview with syntax highlighting'));
        console.log(chalk.gray('  • Edit-before-send option for large content'));
        console.log(chalk.gray('  • Smart formatting and structure detection'));
        console.log('');
        console.log(chalk.yellow('💡 Tips:'));
        console.log(chalk.gray('  • Just paste your content directly - no special commands needed'));
        console.log(chalk.gray('  • Large content (3+ lines) will trigger enhanced handling'));
        console.log(chalk.gray('  • You can choose to edit, send, or cancel after pasting'));
        console.log(chalk.gray('  • Use /paste-settings to configure paste behavior'));
        return true;

      case '/paste-settings':
        await this.showPasteSettings();
        return true;

      case '/smart-input':
        if (args[0]) {
          await this.toggleSmartInput(args[0]);
        } else {
          this.showSmartInputStatus();
        }
        return true;

      case '/claude-mode':
        await this.toggleClaudeMode();
        return true;

      case '/shortcuts':
      case '?':
        this.displayShortcuts();
        return true;

      case '/status':
        this.displayStatus();
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
      const resolvedPath = path.resolve(filePath);
      
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.red(`❌ File not found: ${filePath}`));
        return;
      }

      const stats = fs.statSync(resolvedPath);
      if (!stats.isFile()) {
        console.log(chalk.red(`❌ Path is not a file: ${filePath}`));
        return;
      }

      const maxSize = 1024 * 1024;
      if (stats.size > maxSize) {
        console.log(chalk.red(`❌ File too large (${Math.round(stats.size / 1024)}KB). Maximum size: ${Math.round(maxSize / 1024)}KB`));
        return;
      }

      const content = fs.readFileSync(resolvedPath, 'utf8');
      
      console.log(chalk.green(`📁 Loading file: ${filePath} (${stats.size} bytes)`));
      console.log(chalk.gray('File content:'));
      console.log(chalk.gray('-'.repeat(50)));
      console.log(content.substring(0, 500) + (content.length > 500 ? '...' : ''));
      console.log(chalk.gray('-'.repeat(50)));

      this.addToHistory(`[FILE: ${filePath}]\n${content}`);

      await this.sendUserMessage(`[FILE: ${filePath}]\n${content}`);
      
      console.log(chalk.green('✅ File content sent to agent.'));
      
    } catch (error) {
      console.log(chalk.red(`❌ Error reading file: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async sendUserMessage(content: string): Promise<void> {
    if (this.config.enableConversationHistory) {
      try {
        await this.sendUserMessageWithHistory(content, 'question');
        
        logger.debug(`CLIClient: User message sent with conversation history`, {
          contentLength: content.length,
          userId: this.userId,
          sessionId: this.currentSession
        });
      } catch (error) {
        logger.error('CLIClient: Failed to send user message with history', error);
        await this.sendUserMessageFallback(content);
      }
    } else {
      await this.sendUserMessageFallback(content);
    }
  }

  private async sendUserMessageFallback(content: string): Promise<void> {
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
          currentTask: 'user_interaction',
          inputMethod: 'cli',
          fallback: true
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
    const { requestId, prompt, inputType, options, validation, sensitive } = event.payload;

    console.log(chalk.cyan(`\n📝 Input Required: ${prompt}`));
    
    if (inputType) {
      const typeIcon = this.getInputTypeIcon(inputType);
      console.log(chalk.gray(`${typeIcon} Input Type: ${inputType}`));
    }
    
    if (options && options.length > 0) {
      console.log(chalk.gray(`Options: ${options.join(', ')}`));
    }

    if (sensitive) {
      console.log(chalk.yellow('⚠️ This is sensitive information - input will be masked'));
    }

    let userInput: string;
    let isValid = false;

    do {
      const inputPrompt = sensitive ? '🔒 > ' : '> ';
      userInput = await this.promptUser(inputPrompt);
      
      if (validation) {
        if (validation.required && !userInput.trim()) {
          console.log(chalk.red('❌ This field is required.'));
          continue;
        }
        
        if (validation.pattern && !new RegExp(validation.pattern).test(userInput)) {
          console.log(chalk.red('❌ Input format is invalid.'));
          continue;
        }
        
        if (validation.minLength && userInput.length < validation.minLength) {
          console.log(chalk.red(`❌ Input must be at least ${validation.minLength} characters.`));
          continue;
        }
        
        if (validation.maxLength && userInput.length > validation.maxLength) {
          console.log(chalk.red(`❌ Input must be no more than ${validation.maxLength} characters.`));
          continue;
        }
      }

      if (inputType === 'choice' && options && options.length > 0) {
        if (!options.includes(userInput)) {
          console.log(chalk.red(`❌ Please choose from: ${options.join(', ')}`));
          continue;
        }
      }

      if (inputType === 'confirmation') {
        const normalized = userInput.toLowerCase();
        if (!['y', 'yes', 'n', 'no', 'true', 'false'].includes(normalized)) {
          console.log(chalk.red('❌ Please enter: y/yes/n/no/true/false'));
          continue;
        }
        userInput = ['y', 'yes', 'true'].includes(normalized) ? 'true' : 'false';
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
        requestId: requestId,
        value: userInput,
        cancelled: false,
        inputType: inputType
      }
    };

    console.log(chalk.green(`✅ Input submitted: ${sensitive ? '[REDACTED]' : userInput}`));
    await this.sendMessage(responseMessage);
  }

  private getInputTypeIcon(inputType: string): string {
    switch (inputType) {
      case 'text': return '📝';
      case 'password': return '🔒';
      case 'choice': return '🔘';
      case 'confirmation': return '❓';
      case 'file_path': return '📁';
      case 'config': return '⚙️';
      default: return '📝';
    }
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
    const event = message as any;
    const { content, replyType, metadata } = event.payload;

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
    
    console.log('');
  }

  private async handleAgentThinking(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { stepNumber, thinking, toolCalls, rawThinking } = event.payload;

    console.log(chalk.magenta(`\n🧠 Agent Thinking (Step ${stepNumber}):`));
    
    if (thinking) {
      if (thinking.analysis) {
        console.log(chalk.cyan(`📊 Analysis: ${thinking.analysis}`));
      }
      
      if (thinking.plan) {
        console.log(chalk.blue(`📋 Plan: ${thinking.plan}`));
      }
      
      if (thinking.reasoning) {
        console.log(chalk.yellow(`💭 Reasoning: ${thinking.reasoning}`));
      }
      
      if (thinking.nextAction) {
        console.log(chalk.green(`➡️ Next Action: ${thinking.nextAction}`));
      }
    }

    if (toolCalls && toolCalls.length > 0) {
      console.log(chalk.gray(`🔧 Tool Calls: ${toolCalls.map((tc: any) => tc.name || tc.function?.name).join(', ')}`));
    }

    if (process.env.DEBUG_THINKING && rawThinking) {
      console.log(chalk.gray(`\n🔍 Raw Thinking:\n${rawThinking.substring(0, 200)}${rawThinking.length > 200 ? '...' : ''}`));
    }

    console.log('');
  }

  private async handleThinkEvent(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { content, type, metadata } = event.payload;

    switch (type) {
      case 'reasoning':
        console.log(chalk.magenta(`\n💭 Agent Reasoning:`));
        console.log(chalk.white(content));
        break;
        
      case 'analysis':
        console.log(chalk.cyan(`\n📊 Agent Analysis:`));
        console.log(chalk.white(content));
        break;
        
      case 'planning':
        console.log(chalk.blue(`\n📋 Agent Planning:`));
        console.log(chalk.white(content));
        break;
        
      case 'reflection':
        console.log(chalk.yellow(`\n🤔 Agent Reflection:`));
        console.log(chalk.white(content));
        break;
        
      default:
        console.log(chalk.magenta(`\n🧠 Agent Think (${type || 'general'}):`));
        console.log(chalk.white(content));
        break;
    }

    if (metadata) {
      if (metadata.confidence !== undefined) {
        const confidencePercent = Math.round(metadata.confidence * 100);
        console.log(chalk.gray(`🎯 Confidence: ${confidencePercent}%`));
      }
      
      if (metadata.duration !== undefined) {
        console.log(chalk.gray(`⏱️ Duration: ${metadata.duration}ms`));
      }
      
      if (metadata.context) {
        console.log(chalk.gray(`📝 Context: ${metadata.context}`));
      }
    }

    console.log('');
  }

  private async handlePlanCreated(message: AllEventMessages): Promise<void> {
    const event = message as any;
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
    const event = message as any;
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
    const event = message as any;
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
    const event = message as any;
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
    const event = message as any;
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
    const event = message as any;
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

  private async handleFileCreated(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { path, size, diff } = event.payload;

    console.log(chalk.green(`\n📄 File created: ${path}`));
    console.log(chalk.gray(`   Size: ${size} bytes`));
    
    if ((this.config as any).showDiffs && diff) {
      console.log(chalk.gray('Diff:'));
      console.log(this.formatDiff(diff));
    }
    console.log('');
  }

  private async handleFileModified(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { path, tool, changesApplied, diff } = event.payload;

    const toolIcon = this.getFileOperationToolIcon(tool);
    console.log(chalk.blue(`\n${toolIcon} File modified: ${path}`));
    console.log(chalk.gray(`   Tool: ${tool}`));
    console.log(chalk.gray(`   Changes applied: ${changesApplied}`));
    
    if ((this.config as any).showDiffs && diff && diff.length < 1000) {
      console.log(chalk.gray('Diff:'));
      console.log(this.formatDiff(diff));
    }
    console.log('');
  }

  private async handleFileDeleted(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { path, isDirectory, filesDeleted, diff } = event.payload;

    if (isDirectory) {
      console.log(chalk.red(`\n📁 Directory deleted: ${path}`));
      if (filesDeleted.length > 0) {
        console.log(chalk.gray(`   Files deleted: ${filesDeleted.length}`));
        if (filesDeleted.length <= 5) {
          filesDeleted.forEach((file: string) => {
            console.log(chalk.gray(`     - ${file}`));
          });
        } else {
          filesDeleted.slice(0, 3).forEach((file: string) => {
            console.log(chalk.gray(`     - ${file}`));
          });
          console.log(chalk.gray(`     ... and ${filesDeleted.length - 3} more`));
        }
      }
    } else {
      console.log(chalk.red(`\n🗑️  File deleted: ${path}`));
    }
    
    if ((this.config as any).showDiffs && diff && diff.length < 1000) {
      console.log(chalk.gray('Diff:'));
      console.log(this.formatDiff(diff));
    }
    console.log('');
  }

  private async handleDirectoryCreated(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { path, recursive } = event.payload;

    console.log(chalk.green(`\n📁 Directory created: ${path}`));
    if (recursive) {
      console.log(chalk.gray(`   Mode: recursive (created parent directories)`));
    }
    console.log('');
  }

  private async handleDiffReversed(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { affectedFiles, changesReverted, reason } = event.payload;

    console.log(chalk.yellow(`\n🔄 Changes reversed:`));
    if (reason) {
      console.log(chalk.gray(`   Reason: ${reason}`));
    }
    console.log(chalk.gray(`   Changes reverted: ${changesReverted}`));
    console.log(chalk.gray(`   Affected files: ${affectedFiles.length}`));
    
    if (affectedFiles.length <= 10) {
      affectedFiles.forEach((file: string) => {
        console.log(chalk.yellow(`     - ${file}`));
      });
    } else {
      affectedFiles.slice(0, 5).forEach((file: string) => {
        console.log(chalk.yellow(`     - ${file}`));
      });
      console.log(chalk.yellow(`     ... and ${affectedFiles.length - 5} more`));
    }
    console.log('');
  }

  private promptUser(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.pendingPrompts.push({ prompt, resolve, reject });
      process.stdout.write(chalk.cyan(prompt));
    });
  }

  private displayWelcome(): void {
    console.clear(); // 清屏获得更好的体验
    
    // Claude风格的欢迎框 - 修复格式问题
    console.log('');
    console.log(chalk.yellow('┌────────────────────────────────────────────────────────────────────┐'));
    console.log(chalk.yellow('│ ') + chalk.bold(chalk.cyan('✨ Welcome to Continue Reasoning!')) + chalk.yellow('                              │'));
    console.log(chalk.yellow('│                                                                    │'));
    console.log(chalk.yellow('│ ') + chalk.gray('/help for help, /status for your current setup') + chalk.yellow('               │'));
    console.log(chalk.yellow('│                                                                    │'));
    
    // 工作目录信息
    const cwd = process.cwd();
    const cwdLine = `cwd: ${cwd}`;
    const padding = 68 - cwdLine.length;
    console.log(chalk.yellow('│ ') + chalk.gray(cwdLine) + ' '.repeat(Math.max(0, padding)) + chalk.yellow('│'));
    console.log(chalk.yellow('│ ') + chalk.gray('─'.repeat(66)) + chalk.yellow(' │'));
    console.log(chalk.yellow('│                                                                    │'));
    
    // 检查是否启用了Claude模式
    const isClaudeMode = this.config.enableRichInput && 
                        this.config.enableInputPreview && 
                        this.config.enableSmartPrompts && 
                        this.pasteThreshold <= 50 && 
                        this.autoMultilineThreshold <= 3;
    
    // API Key信息
    const apiKeyInfo = process.env.OPENAI_API_KEY ? 
      `sk-${process.env.OPENAI_API_KEY.substring(3, 7)}...${process.env.OPENAI_API_KEY.slice(-6)}` : 
      'Not configured';
    
    console.log(chalk.yellow('│ ') + chalk.gray('Overrides (via env):') + chalk.yellow('                                        │'));
    console.log(chalk.yellow('│                                                                    │'));
    
    const apiLine = `• API Key: ${apiKeyInfo}`;
    const apiPadding = 68 - apiLine.length;
    console.log(chalk.yellow('│ ') + chalk.gray(apiLine) + ' '.repeat(Math.max(0, apiPadding)) + chalk.yellow('│'));
    
    if (isClaudeMode) {
      const claudeLine = '• Claude Mode: ENABLED (Enhanced paste handling)';
      const claudePadding = 68 - claudeLine.length;
      console.log(chalk.yellow('│ ') + chalk.green(claudeLine) + ' '.repeat(Math.max(0, claudePadding)) + chalk.yellow('│'));
    } else {
      const claudeLine = '• Claude Mode: DISABLED';
      const claudePadding = 68 - claudeLine.length;
      console.log(chalk.yellow('│ ') + chalk.gray(claudeLine) + ' '.repeat(Math.max(0, claudePadding)) + chalk.yellow('│'));
    }
    
    if (this.config.enableConversationHistory) {
      const historyLine = '• Conversation History: ENABLED';
      const historyPadding = 68 - historyLine.length;
      console.log(chalk.yellow('│ ') + chalk.green(historyLine) + ' '.repeat(Math.max(0, historyPadding)) + chalk.yellow('│'));
    }
    
    console.log(chalk.yellow('└────────────────────────────────────────────────────────────────────┘'));
    console.log('');
    
    // 使用提示（简化版本）
    console.log(chalk.bold(chalk.white('Tips for getting started:')));
    console.log('');
    console.log(chalk.white('1. ') + chalk.gray('Type your message and press Enter for single-line input'));
    console.log(chalk.white('2. ') + chalk.gray('Use ### to start multi-line input mode'));  
    console.log(chalk.white('3. ') + chalk.gray('Paste large content directly - smart detection enabled'));
    console.log(chalk.white('4. ') + chalk.gray('Use /editor or /edit for advanced multi-line editor'));
    console.log(chalk.white('5. ') + chalk.gray('Use /enhanced-edit for Claude Code-like line navigation'));
    console.log(chalk.white('6. ') + chalk.gray('Use /claude-mode to enable enhanced input experience'));
    console.log(chalk.white('7. ') + chalk.gray('Use /help to see all available commands'));
    
    if (isClaudeMode) {
      console.log('');
      console.log(chalk.cyan('🎯 ') + chalk.bold(chalk.cyan('Claude Mode Active:')));
      console.log(chalk.gray('  • Large pastes will show preview & edit options'));
      console.log(chalk.gray('  • Smart content detection and formatting'));
      console.log(chalk.gray('  • Enhanced multi-line editing experience'));
    }
    
    console.log('');
    console.log(chalk.gray('💡 Tip: Use /shortcuts to view keyboard shortcuts'));
    console.log('');
  }

  private displayHelp(): void {
    console.log(chalk.cyan('\n📖 Enhanced CLI Help Guide'));
    console.log(chalk.cyan('=' .repeat(50)));
    
    console.log(chalk.yellow('\n🔧 Available Commands:'));
    console.log(chalk.white('  /help                    - Show this help message'));
    console.log(chalk.white('  /mode [auto|manual|supervised] - Set or view execution mode'));
    console.log(chalk.white('  /multiline              - Start multi-line input mode'));
    console.log(chalk.white('  /file <path>            - Load and send file content'));
    console.log(chalk.white('  /history [n]            - Show last n commands (default: 10)'));
    console.log(chalk.white('  /clear                  - Clear the screen'));
    console.log(chalk.white('  /events                 - Show active events'));
    console.log(chalk.white('  /stats                  - Show event bus statistics'));
    console.log(chalk.white('  /plan                   - Show plan execution status and info'));
    console.log(chalk.white('  /features               - Show enhanced CLI features status'));
    console.log(chalk.white('  /toggle <feature>       - Toggle enhanced features on/off'));
    console.log(chalk.white('  /exit, /quit            - Exit the application'));
    
    console.log(chalk.yellow('\n📊 Performance & Monitoring:'));
    console.log(chalk.white('  /performance, /perf     - Show agent performance statistics'));
    console.log(chalk.white('  /tools                  - Show detailed tool usage statistics'));
    console.log(chalk.white('  /agent                  - Show current agent information'));
    console.log(chalk.white('  /reset                  - Reset all statistics and counters'));
    
    console.log(chalk.yellow('\n📋 Enhanced Paste & Input:'));
    console.log(chalk.white('  /paste                  - Show enhanced paste mode information'));
    console.log(chalk.white('  /paste-settings         - Configure paste detection settings'));
    console.log(chalk.white('  /smart-input <feature>  - Configure smart input features'));
    console.log(chalk.white('  /claude-mode            - Toggle Claude-style enhanced input mode'));
    
    console.log(chalk.yellow('\n🖋️  Advanced Editor:'));
    console.log(chalk.white('  /editor, /edit          - Open advanced multi-line editor'));
    console.log(chalk.white('  /editor-paste           - Open advanced editor with paste content'));
    console.log(chalk.gray('    • Full multi-line editing with line numbers'));
    console.log(chalk.gray('    • Arrow key navigation between lines'));
    console.log(chalk.gray('    • Ctrl+S to send, Ctrl+C to cancel'));
    console.log(chalk.gray('    • Perfect for code, documentation, or long text'));
    
    console.log(chalk.yellow('\n🖋️  System Editor (Recommended):'));
    console.log(chalk.white('  /sys-editor             - Open your default system editor'));
    console.log(chalk.white('  /sys-code <lang>        - Open system editor with language syntax'));
    console.log(chalk.white('  /sys-interactive        - Interactive editor mode with choices'));
    console.log(chalk.white('  /sys-help               - Show system editor help and setup'));
    console.log(chalk.gray('    • Uses your preferred editor (VS Code, Vim, Nano, etc.)'));
    console.log(chalk.gray('    • Full editor features and extensions'));
    console.log(chalk.gray('    • No terminal compatibility issues'));
    console.log(chalk.gray('    • Perfect for all content types'));
    console.log(chalk.gray('    • Set EDITOR env var: export EDITOR="code --wait"'));
    
    console.log(chalk.yellow('\n🖋️  Enhanced Multiline Editor (NEW):'));
    console.log(chalk.white('  /enhanced-edit          - Open enhanced multiline editor'));
    console.log(chalk.white('  /enhanced-multiline     - Same as enhanced-edit'));
    console.log(chalk.white('  /enhanced-paste         - Open enhanced editor with paste content'));
    console.log(chalk.gray('    • True arrow key navigation (↑↓ between lines, ←→ within line)'));
    console.log(chalk.gray('    • Real-time cursor positioning with visual indicator'));
    console.log(chalk.gray('    • Line numbers and professional editor layout'));
    console.log(chalk.gray('    • Ctrl+M/Ctrl+S to submit, Ctrl+C to cancel'));
    console.log(chalk.gray('    • Claude Code-like editing experience'));
    console.log(chalk.gray('    • No external dependencies or compatibility issues'));
    
    if (this.config.enableConversationHistory) {
      console.log(chalk.yellow('\n🧠 Conversation History Commands:'));
      console.log(chalk.white('  /conversation [n]       - Show last n conversation messages'));
      console.log(chalk.white('  /conv [n]               - Alias for /conversation'));
      console.log(chalk.white('  /session                - Show current session information'));
      console.log(chalk.white('  /user [id]              - Set or view current user ID'));
      console.log(chalk.white('  /memory                 - Show memory usage statistics'));
      console.log(chalk.white('  /search <query>         - Search conversation history'));
    }
    
    if (this.config.enableKeyboardShortcuts) {
      console.log(chalk.yellow('\n⌨️  Keyboard Shortcuts:'));
      console.log(chalk.white('  Ctrl+H                  - Show help'));
      console.log(chalk.white('  Ctrl+L                  - Clear screen'));
      console.log(chalk.white('  Ctrl+R                  - Show command history'));
      console.log(chalk.white('  Ctrl+M                  - Toggle multi-line mode'));
      console.log(chalk.white('  Ctrl+S                  - Show input statistics'));
      console.log(chalk.white('  Ctrl+C                  - Cancel/Exit'));
      console.log(chalk.white('  ↑/↓ Arrow Keys          - Navigate command history'));
      console.log(chalk.white('  Tab                     - Smart completion'));
    }
    
    console.log(chalk.yellow('\n💡 Enhanced Pro Tips:'));
    console.log(chalk.gray('  • Monitor agent performance with /performance'));
    console.log(chalk.gray('  • Track tool usage patterns with /tools'));
    console.log(chalk.gray('  • Reset statistics with /reset for fresh start'));
    console.log(chalk.gray('  • Toggle monitoring features with /toggle'));
    if (this.config.enableConversationHistory) {
      console.log(chalk.gray('  • All your messages automatically include conversation context'));
      console.log(chalk.gray('  • Agent remembers the full conversation flow'));
    }
    
    console.log(chalk.cyan('\n' + '=' .repeat(50)));
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

  private displayFeatures(): void {
    console.log(chalk.cyan('\n🚀 Enhanced CLI Features Status'));
    console.log(chalk.cyan('=' .repeat(45)));
    
    const features = [
      {
        name: 'Rich Input Experience',
        key: 'enableRichInput',
        icon: '✨',
        description: 'Enhanced input processing and feedback'
      },
      {
        name: 'Input Preview',
        key: 'enableInputPreview',
        icon: '👁️',
        description: 'Shows preview and analysis of input content'
      },
      {
        name: 'Smart Prompts',
        key: 'enableSmartPrompts',
        icon: '🧠',
        description: 'Intelligent prompts with context information'
      },
      {
        name: 'Keyboard Shortcuts',
        key: 'enableKeyboardShortcuts',
        icon: '⌨️',
        description: 'Hotkeys for quick actions and navigation'
      },
      {
        name: 'Multi-line Input',
        key: 'enableMultilineInput',
        icon: '📝',
        description: 'Enhanced multi-line text input with preview'
      },
      {
        name: 'File Input',
        key: 'enableFileInput',
        icon: '📁',
        description: 'Load and send file content directly'
      },
      {
        name: 'Auto Completion',
        key: 'enableAutoComplete',
        icon: '🔮',
        description: 'Smart command and path completion'
      },
      {
        name: 'Input Statistics',
        key: 'showInputStats',
        icon: '📊',
        description: 'Track and display input usage statistics'
      }
    ];

    features.forEach(feature => {
      const enabled = (this.config as any)[feature.key];
      const status = enabled ? chalk.green('✓ ENABLED') : chalk.red('✗ DISABLED');
      const toggleCommand = feature.key.replace('enable', '').replace('show', '').toLowerCase();
      
      console.log(`${feature.icon} ${chalk.white(feature.name.padEnd(20))} ${status}`);
      console.log(chalk.gray(`   ${feature.description}`));
      console.log(chalk.gray(`   Toggle with: /toggle ${toggleCommand}`));
      console.log('');
    });

    console.log(chalk.yellow('💡 Tips:'));
    console.log(chalk.gray('  • Use /toggle <feature> to enable/disable features'));
    console.log(chalk.gray('  • Some features require restart to take full effect'));
    console.log(chalk.gray('  • Type /help to see all available commands'));
    console.log('');
  }

  private async toggleFeature(featureName: string): Promise<void> {
    const featureMap: { [key: string]: string } = {
      'richinput': 'enableRichInput',
      'rich': 'enableRichInput',
      'preview': 'enableInputPreview',
      'smart': 'enableSmartPrompts',
      'shortcuts': 'enableKeyboardShortcuts',
      'keyboard': 'enableKeyboardShortcuts',
      'multiline': 'enableMultilineInput',
      'multi': 'enableMultilineInput',
      'file': 'enableFileInput',
      'completion': 'enableAutoComplete',
      'autocomplete': 'enableAutoComplete',
      'stats': 'showInputStats',
      'statistics': 'showInputStats',
      'history': 'enableConversationHistory',
      'conversation': 'enableConversationHistory',
      'memory': 'enableConversationHistory',
      'diffs': 'showDiffs',
      'diff': 'showDiffs',
      'tracking': 'enableStepTracking',
      'steps': 'enableStepTracking',
      'monitoring': 'enablePerformanceMonitoring',
      'performance': 'enablePerformanceMonitoring',
      'perf': 'enablePerformanceMonitoring'
    };

    const configKey = featureMap[featureName.toLowerCase()];
    
    if (!configKey) {
      console.log(chalk.red(`❌ Unknown feature: ${featureName}`));
      console.log(chalk.yellow('Available features:'));
      Object.keys(featureMap).forEach(key => {
        console.log(chalk.gray(`  • ${key}`));
      });
      return;
    }

    const currentValue = (this.config as any)[configKey];
    const newValue = !currentValue;
    (this.config as any)[configKey] = newValue;

    const status = newValue ? chalk.green('ENABLED') : chalk.red('DISABLED');
    const featureDisplayName = configKey.replace(/^enable|^show/, '').replace(/([A-Z])/g, ' $1').trim();
    
    console.log(chalk.green(`✅ Feature toggled: ${featureDisplayName} is now ${status}`));
    
    if (configKey === 'enableKeyboardShortcuts') {
      if (newValue) {
        this.setupKeyboardShortcuts();
        console.log(chalk.cyan('🔥 Keyboard shortcuts activated!'));
      } else {
        console.log(chalk.yellow('⚠️  Keyboard shortcuts disabled (restart recommended)'));
      }
    }
    
    if (configKey === 'enableRichInput') {
      if (newValue) {
        this.setupRichInput();
        console.log(chalk.cyan('✨ Rich input experience activated!'));
      } else {
        console.log(chalk.yellow('⚠️  Rich input disabled'));
      }
    }

    if (configKey === 'enableConversationHistory') {
      if (newValue) {
        console.log(chalk.cyan('🧠 Conversation history activated!'));
        console.log(chalk.gray('   • All future messages will include conversation context'));
        console.log(chalk.gray('   • Use /conversation to view history'));
        console.log(chalk.gray('   • Use /search to find past conversations'));
      } else {
        console.log(chalk.yellow('⚠️  Conversation history disabled'));
        console.log(chalk.gray('   • Messages will be sent without conversation context'));
        console.log(chalk.gray('   • History commands will not be available'));
      }
    }

    if (configKey === 'enableStepTracking') {
      if (newValue) {
        console.log(chalk.cyan('📊 Step tracking activated!'));
        console.log(chalk.gray('   • Agent steps will be displayed in real-time'));
        console.log(chalk.gray('   • Use /performance to view detailed statistics'));
      } else {
        console.log(chalk.yellow('⚠️  Step tracking disabled'));
      }
    }

    if (configKey === 'enablePerformanceMonitoring') {
      if (newValue) {
        console.log(chalk.cyan('📈 Performance monitoring activated!'));
        console.log(chalk.gray('   • Track tool execution times and success rates'));
        console.log(chalk.gray('   • Monitor agent step durations and efficiency'));
        console.log(chalk.gray('   • View detailed performance analytics'));
        console.log(chalk.gray('   • Use /performance or /tools for detailed stats'));
      } else {
        console.log(chalk.yellow('⚠️  Performance monitoring disabled'));
      }
    }

    console.log(chalk.gray('💡 Some changes may require restart for full effect'));
  }

  private startInteractiveLoop(): void {
    this.showPrompt();
  }

  private showPrompt(): void {
    if (this.isWaitingForInput) return;
    
    // Claude风格的输入提示
    if (this.isMultilineMode) {
      const lineNumber = this.multilineBuffer.length + 1;
      const delimiter = this.config.multilineDelimiter || '###';
      
      if (lineNumber === 1) {
        console.log(chalk.cyan('┌─ Multi-line Input Mode'));
        console.log(chalk.cyan('│  ') + chalk.gray(`Type '${delimiter}' on a new line to finish and send`));
        console.log(chalk.cyan('│  ') + chalk.gray('Press Ctrl+C to cancel and exit multi-line mode'));
        console.log(chalk.cyan('│'));
      }
      
      const linePrefix = chalk.cyan(`│ ${lineNumber.toString().padStart(2, '0')} │ `);
      this.rl.setPrompt(linePrefix);
    } else {
      // 检查是否是Claude模式
      const isClaudeMode = this.config.enableRichInput && 
                          this.config.enableInputPreview && 
                          this.config.enableSmartPrompts;
      
      if (isClaudeMode) {
        // Claude风格的输入提示
        const sessionInfo = this.currentSession ? chalk.gray(`[${this.currentSession.substring(0, 8)}]`) : '';
        const modeIndicator = this.executionMode === 'auto' ? chalk.green('●') : 
                             this.executionMode === 'manual' ? chalk.yellow('●') : chalk.blue('●');
        
        console.log(chalk.gray('────────────────────────────────────────────────────────────────────'));
        this.rl.setPrompt(chalk.bold(chalk.white('> ')) + chalk.dim('Type your message... '));
        
        // 在第一次输入时显示快捷键提示
        if (this.inputStats.totalInputs === 0) {
          setTimeout(() => {
            console.log(chalk.gray('\n💡 Pro tips:'));
            console.log(chalk.gray('  • ### for multi-line input'));
            console.log(chalk.gray('  • /help for commands'));
            console.log(chalk.gray('  • /claude-mode to toggle enhanced features'));
            console.log(chalk.gray('  • ? for shortcuts\n'));
            this.rl.prompt();
          }, 500);
        }
      } else {
        // 标准模式的简单提示
        const prefix = this.config.promptPrefix || '🤖';
        const modeIndicator = this.executionMode === 'auto' ? '⚡' : 
                             this.executionMode === 'manual' ? '✋' : '👁️';
        this.rl.setPrompt(chalk.green(`${prefix} ${modeIndicator} > `));
      }
    }
    
    this.rl.prompt();
  }

  private completer(line: string): [string[], string] {
    const commands = [
      '/help', '/mode', '/history', '/clear', '/events', '/stats', '/plan', '/exit', '/quit', '/multiline', '/file'
    ];
    
    const modeCommands = ['auto', 'manual', 'supervised'];
    
    if (line.startsWith('/mode ')) {
      const modeInput = line.substring(6);
      const modeHits = modeCommands.filter(mode => mode.startsWith(modeInput));
      return [modeHits.map(mode => `/mode ${mode}`), line];
    }
    
    if (line.startsWith('/file ')) {
      const filePath = line.substring(6);
      try {
        const basePath = path.dirname(filePath) || '.';
        const fileName = path.basename(filePath);
        
        if (fs.existsSync(basePath)) {
          const files = fs.readdirSync(basePath)
            .filter(file => file.startsWith(fileName))
            .slice(0, 10)
            .map(file => `/file ${path.join(basePath, file)}`);
          
          return [files, line];
        }
      } catch (error) {
        // 忽略文件系统错误
      }
    }
    
    if (line.startsWith('/')) {
      const hits = commands.filter(cmd => cmd.startsWith(line));
      return [hits.length ? hits : commands, line];
    }
    
    if (this.commandHistory.length > 0) {
      const recentHits = this.commandHistory
        .filter(cmd => cmd.toLowerCase().includes(line.toLowerCase()))
        .slice(-5)
        .reverse();
      
      if (recentHits.length > 0) {
        return [recentHits, line];
      }
    }
    
    return [[], line];
  }

  private addToHistory(command: string): void {
    this.commandHistory.push(command);
    
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

  private getSourceIcon(source: 'user' | 'agent' | 'system' | 'interaction_hub' | 'error_handler' | 'cli_client'): string {
    switch (source) {
      case 'user': return '👤';
      case 'agent': return '🤖';
      case 'system': return '⚙️';
      case 'interaction_hub': return '🔄';
      case 'error_handler': return '⚠️';
      case 'cli_client': return '💻';
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

  private getFileOperationToolIcon(tool: string): string {
    switch (tool) {
      case 'whole_file': return '📝';
      case 'edit_block': return '🎯';
      case 'ranged_edit': return '📍';
      case 'unified_diff': return '⚙️';
      default: return '🔧';
    }
  }

  private formatDiff(diff: string): string {
    const lines = diff.split('\n');
    return lines.map(line => {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        return chalk.green(line);
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        return chalk.red(line);
      } else if (line.startsWith('@@')) {
        return chalk.cyan(line);
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        return chalk.yellow(line);
      }
      return chalk.gray(line);
    }).join('\n');
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

  private async displayConversationHistory(limit: number): Promise<void> {
    if (!this.config.enableConversationHistory) {
      console.log(chalk.red('❌ Conversation history is not enabled.'));
      return;
    }

    try {
      const memory = this.getInteractiveMemory();
      const history = await memory.getConversationHistory(this.currentSession, limit);

      console.log(chalk.cyan(`\n💬 Conversation History (Last ${limit} messages):`));
      console.log(chalk.cyan('=' .repeat(60)));

      if (history.length === 0) {
        console.log(chalk.gray('No conversation history found.'));
        return;
      }

      history.forEach((record, index) => {
        const timestamp = new Date(record.timestamp).toLocaleTimeString();
        const roleIcon = record.role === 'user' ? '👤' : record.role === 'agent' ? '🤖' : '⚙️';
        const content = record.content.length > 100 ? 
          record.content.substring(0, 100) + '...' : record.content;

        console.log(chalk.white(`${index + 1}. [${timestamp}] ${roleIcon} ${record.role}:`));
        console.log(chalk.gray(`   ${content}`));
        
        if (record.metadata) {
          console.log(chalk.gray(`   Metadata: ${JSON.stringify(record.metadata, null, 2)}`));
        }
        console.log('');
      });

      console.log(chalk.cyan('=' .repeat(60)));
    } catch (error) {
      console.log(chalk.red(`❌ Failed to retrieve conversation history: ${error}`));
    }
  }

  private displaySessionInfo(): void {
    console.log(chalk.cyan('\n📊 Session Information:'));
    console.log(chalk.white(`Session ID: ${this.currentSession}`));
    console.log(chalk.white(`User ID: ${this.userId}`));
    console.log(chalk.white(`Execution Mode: ${this.executionMode}`));
    console.log(chalk.white(`Conversation History: ${this.config.enableConversationHistory ? 'ENABLED' : 'DISABLED'}`));
    
    if (this.config.enableConversationHistory) {
      console.log(chalk.gray(`Memory Instance: ${this.getInteractiveMemory().id}`));
      console.log(chalk.gray(`Memory Name: ${this.getInteractiveMemory().name}`));
    }
    
    console.log('');
  }

  private async displayMemoryStats(): Promise<void> {
    if (!this.config.enableConversationHistory) {
      console.log(chalk.red('❌ Conversation history is not enabled.'));
      return;
    }

    try {
      const memory = this.getInteractiveMemory();
      
      if ('getMemoryStats' in memory) {
        const stats = (memory as any).getMemoryStats();
        
        console.log(chalk.cyan('\n📈 Memory Statistics:'));
        console.log(chalk.white(`Total Conversations: ${stats.totalConversations || 0}`));
        console.log(chalk.white(`Total Sessions: ${stats.totalSessions || 0}`));
        console.log(chalk.white(`Average Messages/Session: ${stats.averageConversationsPerSession?.toFixed(1) || 0}`));
        console.log(chalk.white(`Memory Usage: ${stats.memoryUsage || 'Unknown'}`));
      } else {
        console.log(chalk.yellow('Memory statistics not available in current implementation.'));
      }
      
      console.log('');
    } catch (error) {
      console.log(chalk.red(`❌ Failed to retrieve memory statistics: ${error}`));
    }
  }

  private async searchConversationHistory(query: string): Promise<void> {
    if (!this.config.enableConversationHistory) {
      console.log(chalk.red('❌ Conversation history is not enabled.'));
      return;
    }

    try {
      const memory = this.getInteractiveMemory();
      const results = await memory.searchConversations(query, {
        sessionId: this.currentSession,
        limit: 10
      });

      console.log(chalk.cyan(`\n🔍 Search Results for "${query}":`));
      console.log(chalk.cyan('=' .repeat(50)));

      if (results.length === 0) {
        console.log(chalk.gray('No matching conversations found.'));
        return;
      }

      results.forEach((record, index) => {
        const timestamp = new Date(record.timestamp).toLocaleTimeString();
        const roleIcon = record.role === 'user' ? '👤' : record.role === 'agent' ? '🤖' : '⚙️';
        
        console.log(chalk.white(`${index + 1}. [${timestamp}] ${roleIcon} ${record.role}:`));
        console.log(chalk.gray(`   ${record.content}`));
        console.log('');
      });

      console.log(chalk.cyan('=' .repeat(50)));
    } catch (error) {
      console.log(chalk.red(`❌ Search failed: ${error}`));
    }
  }

  private async handleAgentStep(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const step = event.payload;

    if (!this.config.enableStepTracking) return;

    const stepIcon = this.getStepStatusIcon(step.status);
    const durationText = step.duration ? ` (${step.duration}ms)` : '';
    
    console.log(chalk.blue(`\n${stepIcon} Step ${step.stepIndex}: ${step.status}${durationText}`));
    
    if (step.extractorResult) {
      if (step.extractorResult.thinking) {
        console.log(chalk.magenta(`💭 Thinking: ${step.extractorResult.thinking.substring(0, 200)}${step.extractorResult.thinking.length > 200 ? '...' : ''}`));
      }
      
      if (step.extractorResult.finalAnswer) {
        console.log(chalk.green(`✅ Final Answer: ${step.extractorResult.finalAnswer}`));
      }
    }
    
    if (step.toolCalls && step.toolCalls.length > 0) {
      console.log(chalk.yellow(`🔧 Tools Called: ${step.toolCalls.map((tc: any) => tc.name).join(', ')}`));
    }
    
    if (step.toolCallResults && step.toolCallResults.length > 0) {
      const successCount = step.toolCallResults.filter((r: any) => r.status === 'succeed').length;
      const totalCount = step.toolCallResults.length;
      console.log(chalk.cyan(`📊 Tool Results: ${successCount}/${totalCount} successful`));
      
      if (this.config.enablePerformanceMonitoring) {
        step.toolCallResults.forEach((result: any) => {
          const timeText = result.executionTime ? ` (${result.executionTime}ms)` : '';
          const statusIcon = result.status === 'succeed' ? '✅' : result.status === 'failed' ? '❌' : '⏳';
          console.log(chalk.gray(`  ${statusIcon} ${result.name}${timeText}`));
        });
      }
    }
    
    this.updateAgentStats(step);
    
    console.log('');
  }

  private async handleAgentStepStart(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { stepIndex, agentId } = event.payload;

    if (!this.config.enableStepTracking) return;

    console.log(chalk.blue(`\n🚀 Starting Step ${stepIndex}...`));
    console.log('');
  }

  private async handleAgentStateChange(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { fromState, toState, reason, currentStep } = event.payload;

    const stateIcon = this.getStateIcon(toState);
    console.log(chalk.yellow(`\n${stateIcon} Agent State: ${fromState} → ${toState}`));
    
    if (reason) {
      console.log(chalk.gray(`   Reason: ${reason}`));
    }
    
    if (currentStep !== undefined) {
      console.log(chalk.gray(`   Current Step: ${currentStep}`));
    }
    
    console.log('');
  }

  private async handleToolExecutionResult(message: AllEventMessages): Promise<void> {
    const event = message as any;
    const { toolName, callId, success, result, error, executionTime, stepNumber } = event.payload;

    if (!this.config.enablePerformanceMonitoring) return;

    const statusIcon = success ? '✅' : '❌';
    const timeText = executionTime ? ` (${executionTime}ms)` : '';
    const stepText = stepNumber !== undefined ? ` [Step ${stepNumber}]` : '';
    
    console.log(chalk.cyan(`🔧 ${statusIcon} Tool: ${toolName}${timeText}${stepText}`));
    
    if (!success && error) {
      console.log(chalk.red(`   Error: ${error}`));
    }
    
    this.updateToolStats(toolName, success, executionTime);
  }

  private getStepStatusIcon(status: string): string {
    switch (status) {
      case 'running': return '⏳';
      case 'completed': return '✅';
      case 'failed': return '❌';
      case 'pending': return '🔄';
      default: return '📝';
    }
  }

  private getStateIcon(state: string): string {
    switch (state) {
      case 'idle': return '💤';
      case 'running': return '🚀';
      case 'stopping': return '🛑';
      case 'error': return '💥';
      default: return '❓';
    }
  }

  private updateAgentStats(step: any): void {
    this.agentStats.totalSteps++;
    
    if (step.duration) {
      const totalDuration = this.agentStats.averageStepDuration * (this.agentStats.totalSteps - 1) + step.duration;
      this.agentStats.averageStepDuration = totalDuration / this.agentStats.totalSteps;
    }
    
    if (step.toolCallResults) {
      this.agentStats.totalToolCalls += step.toolCallResults.length;
    }
  }

  private updateToolStats(toolName: string, success: boolean, executionTime?: number): void {
    if (!this.agentStats.toolCallStats.has(toolName)) {
      this.agentStats.toolCallStats.set(toolName, {
        count: 0,
        totalTime: 0,
        successRate: 0
      });
    }
    
    const stats = this.agentStats.toolCallStats.get(toolName)!;
    stats.count++;
    
    if (executionTime) {
      stats.totalTime += executionTime;
    }
    
    const allCalls = Array.from(this.agentStats.toolCallStats.values());
    const successfulCalls = allCalls.filter(s => s.successRate > 0).length;
    stats.successRate = success ? 1 : 0;
  }

  private displayPerformanceStats(): void {
    console.log(chalk.cyan('\n📊 Agent Performance Statistics:'));
    console.log(chalk.white(`Total Steps Executed: ${this.agentStats.totalSteps}`));
    
    if (this.agentStats.totalSteps > 0) {
      console.log(chalk.white(`Average Step Duration: ${this.agentStats.averageStepDuration.toFixed(1)}ms`));
    }
    
    console.log(chalk.white(`Total Tool Calls: ${this.agentStats.totalToolCalls}`));
    
    if (this.agentStats.toolCallStats.size > 0) {
      console.log(chalk.cyan('\n🔧 Tool Usage Statistics:'));
      for (const [toolName, stats] of this.agentStats.toolCallStats) {
        const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(1) : '0';
        console.log(chalk.white(`  ${toolName}: ${stats.count} calls, avg ${avgTime}ms`));
      }
    }
    
    console.log('');
  }

  private displayToolStats(): void {
    if (this.agentStats.toolCallStats.size === 0) {
      console.log(chalk.yellow('\n📊 No tool usage statistics available yet.'));
      return;
    }

    console.log(chalk.cyan('\n🛠️  Detailed Tool Statistics:'));
    console.log(chalk.cyan('=' .repeat(50)));
    
    for (const [toolName, stats] of this.agentStats.toolCallStats) {
      const avgTime = stats.count > 0 ? (stats.totalTime / stats.count).toFixed(1) : '0';
      const totalTime = stats.totalTime.toFixed(1);
      
      console.log(chalk.white(`📋 ${toolName}:`));
      console.log(chalk.gray(`   Calls: ${stats.count}`));
      console.log(chalk.gray(`   Total Time: ${totalTime}ms`));
      console.log(chalk.gray(`   Average Time: ${avgTime}ms`));
      console.log('');
    }
  }

  private displayAgentInfo(): void {
    console.log(chalk.cyan('\n🤖 Agent Information:'));
    console.log(chalk.white(`User ID: ${this.userId}`));
    console.log(chalk.white(`Session ID: ${this.currentSession.substring(0, 8)}...`));
    console.log(chalk.white(`Execution Mode: ${this.executionMode}`));
    
    console.log(chalk.cyan('\n📈 Session Statistics:'));
    console.log(chalk.white(`Steps Executed: ${this.agentStats.totalSteps}`));
    console.log(chalk.white(`Tool Calls Made: ${this.agentStats.totalToolCalls}`));
    console.log(chalk.white(`Tools Used: ${this.agentStats.toolCallStats.size}`));
    
    if (this.agentStats.currentPlan) {
      console.log(chalk.cyan('\n📋 Current Plan:'));
      console.log(chalk.white(`Title: ${this.agentStats.currentPlan.title}`));
      console.log(chalk.white(`Progress: ${this.agentStats.currentPlan.progress || 0}%`));
    }
    
    console.log('');
  }

  private resetStats(): void {
    this.agentStats = {
      totalSteps: 0,
      averageStepDuration: 0,
      totalToolCalls: 0,
      toolCallStats: new Map(),
      currentPlan: null,
      planHistory: []
    };
    
    this.inputStats = {
      totalInputs: 0,
      totalCharacters: 0,
      averageInputLength: 0,
      multilineInputs: 0
    };
  }

  private async showPasteSettings(): Promise<void> {
    console.log(chalk.cyan('\n⚙️  Paste Settings Configuration'));
    console.log(chalk.cyan('=' .repeat(45)));
    
    console.log(chalk.yellow('\n📋 Current Settings:'));
    console.log(chalk.white(`Paste Detection Threshold: ${this.pasteThreshold}ms`));
    console.log(chalk.white(`Auto Multi-line Threshold: ${this.autoMultilineThreshold} lines`));
    console.log(chalk.white(`Input Preview: ${this.config.enableInputPreview ? 'ENABLED' : 'DISABLED'}`));
    console.log(chalk.white(`Smart Prompts: ${this.config.enableSmartPrompts ? 'ENABLED' : 'DISABLED'}`));
    
    console.log(chalk.yellow('\n🔧 Available Commands:'));
    console.log(chalk.gray('  /paste-threshold <ms>  - Set paste detection threshold (default: 50ms)'));
    console.log(chalk.gray('  /multiline-threshold <lines> - Set auto multi-line threshold (default: 3)'));
    console.log(chalk.gray('  /toggle preview        - Toggle input preview'));
    console.log(chalk.gray('  /toggle smart          - Toggle smart prompts'));
    
    console.log(chalk.yellow('\n💡 Tips:'));
    console.log(chalk.gray('  • Lower paste threshold = more sensitive paste detection'));
    console.log(chalk.gray('  • Higher multi-line threshold = less automatic handling'));
    console.log(chalk.gray('  • Enable preview for better paste experience'));
    console.log('');
  }

  private async toggleSmartInput(feature: string): Promise<void> {
    switch (feature.toLowerCase()) {
      case 'threshold':
      case 'paste-threshold':
        const thresholdInput = await this.promptUser('Enter paste threshold in milliseconds (10-200): ');
        const threshold = parseInt(thresholdInput);
        if (threshold >= 10 && threshold <= 200) {
          this.pasteThreshold = threshold;
          console.log(chalk.green(`✅ Paste threshold set to ${threshold}ms`));
        } else {
          console.log(chalk.red('❌ Invalid threshold. Must be between 10-200ms'));
        }
        break;

      case 'multiline':
      case 'multiline-threshold':
        const multilineInput = await this.promptUser('Enter auto multi-line threshold (1-10 lines): ');
        const multilineThreshold = parseInt(multilineInput);
        if (multilineThreshold >= 1 && multilineThreshold <= 10) {
          this.autoMultilineThreshold = multilineThreshold;
          console.log(chalk.green(`✅ Auto multi-line threshold set to ${multilineThreshold} lines`));
        } else {
          console.log(chalk.red('❌ Invalid threshold. Must be between 1-10 lines'));
        }
        break;

      default:
        console.log(chalk.red(`❌ Unknown smart input feature: ${feature}`));
        console.log(chalk.yellow('Available features: threshold, multiline'));
    }
  }

  private showSmartInputStatus(): void {
    console.log(chalk.cyan('\n🧠 Smart Input Status'));
    console.log(chalk.cyan('=' .repeat(35)));
    
    console.log(chalk.yellow('\n📊 Configuration:'));
    console.log(chalk.white(`Paste Detection: ${this.pasteThreshold}ms threshold`));
    console.log(chalk.white(`Auto Multi-line: ${this.autoMultilineThreshold}+ lines`));
    console.log(chalk.white(`Rich Input: ${this.config.enableRichInput ? '✓' : '✗'}`));
    console.log(chalk.white(`Input Preview: ${this.config.enableInputPreview ? '✓' : '✗'}`));
    console.log(chalk.white(`Smart Prompts: ${this.config.enableSmartPrompts ? '✓' : '✗'}`));
    
    console.log(chalk.yellow('\n📈 Usage Statistics:'));
    console.log(chalk.white(`Total Inputs: ${this.inputStats.totalInputs}`));
    console.log(chalk.white(`Multi-line Inputs: ${this.inputStats.multilineInputs}`));
    console.log(chalk.white(`Average Length: ${this.inputStats.averageInputLength.toFixed(1)} chars`));
    
    if (this.inputStats.totalInputs > 0) {
      const multilinePercent = (this.inputStats.multilineInputs / this.inputStats.totalInputs * 100).toFixed(1);
      console.log(chalk.gray(`Multi-line Usage: ${multilinePercent}%`));
    }
    
    console.log(chalk.yellow('\n🔧 Commands:'));
    console.log(chalk.gray('  /smart-input threshold  - Configure paste detection'));
    console.log(chalk.gray('  /smart-input multiline  - Configure auto multi-line'));
    console.log(chalk.gray('  /toggle <feature>       - Toggle specific features'));
    console.log('');
  }

  private async toggleClaudeMode(): Promise<void> {
    // Claude模式：优化配置以获得最佳体验
    const isClaudeMode = this.config.enableRichInput && 
                        this.config.enableInputPreview && 
                        this.config.enableSmartPrompts && 
                        this.pasteThreshold <= 50 && 
                        this.autoMultilineThreshold <= 3;

    if (isClaudeMode) {
      // 切换到标准模式
      this.config.enableRichInput = false;
      this.config.enableInputPreview = false;
      this.config.enableSmartPrompts = false;
      this.pasteThreshold = 100;
      this.autoMultilineThreshold = 5;
      
      console.log(chalk.yellow('\n📝 Standard Mode Activated'));
      console.log(chalk.gray('Switched to basic input handling for performance.'));
    } else {
      // 切换到Claude模式
      this.config.enableRichInput = true;
      this.config.enableInputPreview = true;
      this.config.enableSmartPrompts = true;
      this.config.enableMultilineInput = true;
      this.config.showDiffs = true;
      this.pasteThreshold = 50;
      this.autoMultilineThreshold = 3;
      
      console.log(chalk.cyan('\n🚀 Claude Mode Activated!'));
      console.log(chalk.white('Enhanced features enabled:'));
      console.log(chalk.gray('  ✓ Intelligent paste detection (50ms threshold)'));
      console.log(chalk.gray('  ✓ Smart multi-line handling (3+ lines)'));
      console.log(chalk.gray('  ✓ Rich input preview and analysis'));
      console.log(chalk.gray('  ✓ Smart prompts and suggestions'));
      console.log(chalk.gray('  ✓ Diff display for file operations'));
      console.log(chalk.gray('  ✓ Enhanced edit-before-send workflow'));
      
      console.log(chalk.yellow('\n💡 Claude Mode Features:'));
      console.log(chalk.gray('  • Paste large content directly - it will be auto-detected'));
      console.log(chalk.gray('  • Choose to edit, send, or cancel after pasting'));
      console.log(chalk.gray('  • Rich preview with line numbers and formatting'));
      console.log(chalk.gray('  • Smart content type detection and handling'));
      
      // 设置富输入体验
      if (!this.isRichInputSetup) {
        this.setupRichInput();
        this.isRichInputSetup = true;
      }
    }
    
    console.log(chalk.green(`\n✅ Mode switched successfully! ${isClaudeMode ? 'Standard' : 'Claude'} mode is now active.`));
    console.log('');
  }

  private displayShortcuts(): void {
    console.log(chalk.cyan('\n🔧 Keyboard Shortcuts:'));
    console.log(chalk.white('  Ctrl+H                  - Show help'));
    console.log(chalk.white('  Ctrl+L                  - Clear screen'));
    console.log(chalk.white('  Ctrl+R                  - Show command history'));
    console.log(chalk.white('  Ctrl+M                  - Toggle multi-line mode'));
    console.log(chalk.white('  Ctrl+S                  - Show input statistics'));
    console.log(chalk.white('  Ctrl+C                  - Cancel/Exit'));
    console.log(chalk.white('  ↑/↓ Arrow Keys          - Navigate command history'));
    console.log(chalk.white('  Tab                     - Smart completion'));
    console.log(chalk.white('  ?                       - Show shortcuts'));
    console.log(chalk.white('  /status                 - Show status'));
    console.log(chalk.white('  /exit, /quit            - Exit the application'));
    console.log('');
  }

  private displayStatus(): void {
    console.log(chalk.cyan('\n📊 Session Information:'));
    console.log(chalk.white(`Session ID: ${this.currentSession}`));
    console.log(chalk.white(`User ID: ${this.userId}`));
    console.log(chalk.white(`Execution Mode: ${this.executionMode}`));
    console.log(chalk.white(`Conversation History: ${this.config.enableConversationHistory ? 'ENABLED' : 'DISABLED'}`));
    
    if (this.config.enableConversationHistory) {
      console.log(chalk.gray(`Memory Instance: ${this.getInteractiveMemory().id}`));
      console.log(chalk.gray(`Memory Name: ${this.getInteractiveMemory().name}`));
    }
    
    console.log('');
  }
} 