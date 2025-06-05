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

  constructor(config: CLIClientConfig) {
    super(config);
    this.config = config;
    this.setupReadline();
    this.loadHistory();
  }

  setInteractionHub(hub: IInteractionHub): void {
    this.interactionHub = hub;
    logger.info('CLIClient: InteractionHub reference set');
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
        'think'
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
    
    this.rl.on('SIGINT', () => {
      this.handleExit();
    });

    this.rl.on('close', () => {
      process.exit(0);
    });
  }

  private async handleUserInput(input: string): Promise<void> {
    const trimmedInput = input.trim();
    
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
        this.isMultilineMode = true;
        this.multilineBuffer = [];
        console.log(chalk.cyan(`📝 Multi-line input mode started!`));
        console.log(chalk.gray(`   • Press Enter to create new lines`));
        console.log(chalk.gray(`   • Type '${delimiter}' on a new line to finish and send`));
        this.showPrompt();
        return;
      }
      
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
      
      if (this.isMultilineMode) {
        this.multilineBuffer.push(input);
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
} 