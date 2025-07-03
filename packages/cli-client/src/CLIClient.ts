import * as readline from 'readline';
import * as path from 'path';
import {
  CLIClientConfig,
  InputState,
  MultilineState,
  HistoryItem,
  CLIStats,
  CommandHandler,
  ToolCallDisplayState
} from './types';
import {
  getAllCommands,
  isCommand,
  parseCommand
} from './commands';
import {
  createReadlineInterface,
  generateId,
  loadHistory,
  saveHistory,
  showWelcome,
  getPrompt,
  validateInput,
  promptUser,
  safeExit,
  getWorkspaceDirectory
} from './utils';
import {
  formatThinking,
  formatFinalAnswer,
  formatAnalysis,
  formatPlan,
  formatReasoning,
  formatResponse,
  formatToolCallStart,
  formatToolCallResult,
  formatCompleteToolCall,
  formatError,
  formatSystemInfo
} from './utils/display-formatter';
import {
  FileImporter,
  FileImporterConfig,
  createFileImporter
} from './utils/file-importer';
import {
  ToolFormatterRegistry,
  defaultFormatterRegistry
} from './utils/tool-result-formatters';

// Import interface types from local type definitions
import {
  IClient,
  ISessionManager,
  ISessionManagerCallbacks,
  AgentStep,
  StandardExtractorResult,
  EnhancedThinkingExtractorResult,
  ToolCallParams,
  ToolExecutionResult
} from './core-types';

/**
 * Modular CLI client that implements IClient interface
 */
export class CLIClient implements IClient {
  // IClient interface properties
  public name: string;
  public currentSessionId?: string;
  public sessionManager?: ISessionManager;

  private config: CLIClientConfig;
  private rl: readline.Interface;
  private commands: Record<string, CommandHandler>;
  
  // State management
  private currentState: InputState = 'single';
  private multilineState: MultilineState;
  private history: HistoryItem[] = [];
  private stats: CLIStats;
  
  // Tool call state management
  private activeToolCalls: Map<string, ToolCallDisplayState> = new Map();
  
  // Waiting queue (for handling user input requests)
  private pendingPrompts: Array<{
    resolve: (input: string) => void;
    reject: (error: Error) => void;
  }> = [];

  // Add agent completion tracking
  private agentProcessing: boolean = false;
  private agentCompletionPromise?: Promise<void>;
  private agentCompletionResolve?: () => void;

  // File importer
  private fileImporter: FileImporter;

  // Add a counter to control prompt display frequency
  private promptCounter: number = 0;

  // Tool result formatter registry
  private formatterRegistry: ToolFormatterRegistry;

  constructor(config: CLIClientConfig) {
    this.config = {
      enableMultilineInput: true,
      multilineDelimiter: '###',
      enableHistory: true,
      maxHistorySize: 1000,
      enableColors: true,
      enableTimestamps: true,
      promptPrefix: '>',
      ...config
    };

    // Set IClient properties
    this.name = this.config.name || 'cli-client';
    this.currentSessionId = this.config.sessionId;

    // Get workspace directory
    const workspaceDir = getWorkspaceDirectory();

    // Initialize components
    this.rl = createReadlineInterface({
      workingDirectory: workspaceDir,
      maxResults: 10,
      showHidden: false,
      allowedExtensions: this.config.fileImporter?.allowedExtensions || [],
      ...this.config.fileCompleter
    });
    this.commands = getAllCommands(this.config.customCommands);

    // Initialize file importer
    this.fileImporter = createFileImporter({
      workingDirectory: workspaceDir,
      maxFileSize: 1024 * 1024, // 1MB
      maxDepth: 3,
      showFilePath: true,
      // Can get file import configuration from config
      ...this.config.fileImporter
    });

    // Initialize formatter registry with configurable max lines
    this.formatterRegistry = new ToolFormatterRegistry(config.maxOutputLines || 100);

    // Initialize state
    this.multilineState = {
      isActive: false,
      buffer: [],
      delimiter: this.config.multilineDelimiter || '###'
    };

    this.stats = {
      totalInputs: 0,
      multilineInputs: 0,
      commandsExecuted: 0,
      sessionStartTime: Date.now(),
      lastInputTime: 0
    };

    // Load history
    if (this.config.enableHistory && this.config.historyFile) {
      this.history = loadHistory(this.config.historyFile);
    }

    this.setupEventListeners();
  }

  // ===========================================
  // IClient interface implementation
  // ===========================================

  /**
   * Set session manager
   */
  setSessionManager(sessionManager: ISessionManager): void {
    this.sessionManager = sessionManager;
    
    // Set callbacks
    sessionManager.setCallbacks({
      onAgentStep: (step) => this.handleAgentStep(step),
      onToolCall: (toolCall) => this.handleToolCall(toolCall),
      onToolCallResult: (result) => this.handleToolCallResult(result),
      onSessionStart: (sessionId) => {
        console.log(formatSystemInfo(`Session started: ${sessionId}`));
      },
      onSessionEnd: (sessionId) => {
        console.log(formatSystemInfo(`Session ended: ${sessionId}`));
      }
    });
  }

  /**
   * Handle Agent step events - supports both Standard and Enhanced modes
   */
  handleAgentStep(step: AgentStep<any>): void {
    try {
      // Handle different types of Agent steps
      if (step.extractorResult) {
        // Check if this is an Enhanced mode result
        if (this.isEnhancedResult(step.extractorResult)) {
          this.handleEnhancedResult(step.extractorResult as EnhancedThinkingExtractorResult);
        } else {
          // Handle as Standard mode result
          this.handleStandardResult(step.extractorResult as StandardExtractorResult);
        }

        // Check for stop signal to mark agent as completed
        if (step.extractorResult.stopSignal === true) {
          console.log(formatSystemInfo('Agent task completed'));
          this.agentProcessing = false;
          if (this.agentCompletionResolve) {
            this.agentCompletionResolve();
            this.agentCompletionResolve = undefined;
            this.agentCompletionPromise = undefined;
          }
          // Show prompt again after agent completes
          setTimeout(() => this.showPrompt(), 100);
        }
      }

      // Handle errors
      if (step.error) {
        console.log(formatError(step.error));
        // Mark agent as completed on error as well
        this.agentProcessing = false;
        if (this.agentCompletionResolve) {
          this.agentCompletionResolve();
          this.agentCompletionResolve = undefined;
          this.agentCompletionPromise = undefined;
        }
        // Show prompt again after error
        setTimeout(() => this.showPrompt(), 100);
      }

      // Display step information
      if (this.config.enableTimestamps) {
        console.log(formatSystemInfo(`Step ${step.stepIndex} completed`));
      }
    } catch (error) {
      console.error('Error handling agent step:', error);
      // Mark agent as completed on error
      this.agentProcessing = false;
      if (this.agentCompletionResolve) {
        this.agentCompletionResolve();
        this.agentCompletionResolve = undefined;
        this.agentCompletionPromise = undefined;
      }
      // Show prompt again after error
      setTimeout(() => this.showPrompt(), 100);
    }
  }

  /**
   * Check if the result is an Enhanced mode result
   */
  private isEnhancedResult(result: any): result is EnhancedThinkingExtractorResult {
    return result && (
      result.analysis !== undefined ||
      result.plan !== undefined ||
      result.reasoning !== undefined
    );
  }

  /**
   * Handle Enhanced mode result
   */
  private handleEnhancedResult(result: EnhancedThinkingExtractorResult): void {
    // Handle structured thinking content
    if (result.analysis) {
      console.log(formatAnalysis(result.analysis));
    }
    
    if (result.plan) {
      console.log(formatPlan(result.plan));
    }
    
    if (result.reasoning) {
      console.log(formatReasoning(result.reasoning));
    }
    
    // Handle interactive response
    if (result.response) {
      console.log(formatResponse(result.response));
    }
  }

  /**
   * Handle Standard mode result
   */
  private handleStandardResult(result: StandardExtractorResult): void {
    // Handle thinking content
    if (result.thinking) {
      console.log(formatThinking(result.thinking));
    }

    // Handle final answer (legacy field)
    if (result.finalAnswer) {
      console.log(formatFinalAnswer(result.finalAnswer));
    }
    
    // Handle response content
    if (result.response) {
      console.log(formatFinalAnswer(result.response));
    }
  }

  /**
   * Handle tool call start events
   */
  handleToolCall(toolCall: ToolCallParams): void {
    try {
      const { name, call_id, parameters } = toolCall;
      
      // Record tool call status
      this.activeToolCalls.set(call_id, {
        callId: call_id,
        name: name,
        params: parameters,
        startTime: Date.now(),
        isActive: true
      });

      // Display tool call using formatter registry
      console.log(this.formatterRegistry.formatToolCall(toolCall));
    } catch (error) {
      console.error('Error handling tool call:', error);
    }
  }

  /**
   * Handle tool call result events
   */
  handleToolCallResult(result: ToolExecutionResult): void {
    try {
      const { name, call_id, status, result: toolResult, message } = result;
      
      // Get corresponding tool call status
      const toolCallState = this.activeToolCalls.get(call_id);
      if (toolCallState) {
        // Add execution time to result for formatter
        if (result.executionTime === undefined) {
          result.executionTime = Date.now() - toolCallState.startTime;
        }
        
        // Clean up status
        this.activeToolCalls.delete(call_id);
      }
      
      // Display tool result using formatter registry
      console.log(this.formatterRegistry.formatToolResult(result));
      
      // Display execution time if enabled and not already shown by formatter
      if (this.config.enableTimestamps && toolCallState && !result.executionTime) {
        const executionTime = Date.now() - toolCallState.startTime;
        console.log(formatSystemInfo(`${name} completed in ${executionTime}ms`));
      }
    } catch (error) {
      console.error('Error handling tool call result:', error);
    }
  }

  /**
   * Send message to Agent - simplified method signature
   */
  async sendMessageToAgent(message: string): Promise<void> {
    if (!this.sessionManager) {
      console.log(formatError('No session manager configured'));
      return;
    }

    if (!this.currentSessionId) {
      console.log(formatError('No active session'));
      return;
    }

    try {
      console.log(formatSystemInfo('Sending message to agent...'));
      
      // Mark agent as processing and create completion promise
      this.agentProcessing = true;
      this.agentCompletionPromise = new Promise<void>((resolve) => {
        this.agentCompletionResolve = resolve;
      });
      
      // Use session manager to send message
      await this.sessionManager.sendMessageToAgent(
        message, 
        this.config.maxSteps || 10, 
        this.currentSessionId
      );
      
      console.log(formatSystemInfo('Message sent successfully, waiting for completion...'));
      console.log(formatSystemInfo('💡 Press ESC to interrupt agent execution'));
      
      // Wait for agent to complete (stop_signal = true)
      await this.agentCompletionPromise;
      
      console.log(formatSystemInfo('Agent processing completed'));
    } catch (error) {
      console.log(formatError(`Failed to send message: ${error}`));
      // Reset processing state on error
      this.agentProcessing = false;
      this.agentCompletionResolve = undefined;
      this.agentCompletionPromise = undefined;
    }
  }

  /**
   * Create new session - simplified method signature
   */
  newSession(): void {
    if (!this.sessionManager) {
      console.log(formatError('No session manager configured'));
      return;
    }

    try {
      // Use session manager to create new session
      this.currentSessionId = this.sessionManager.createSession(
        this.config.userId,
        this.config.agentId
      );
      
      console.log(formatSystemInfo(`New session created: ${this.currentSessionId}`));
      
      // Display session information
      this.showSessionInfo();
    } catch (error) {
      console.log(formatError(`Failed to create session: ${error}`));
    }
  }

  // ===========================================
  // CLI client core functionality
  // ===========================================

  /**
   * Start CLI client
   */
  public async start(): Promise<void> {
    try {
      // Get workspace information (if there is a SessionManager)
      let workspace: string | undefined;
      if (this.sessionManager && this.sessionManager.agent) {
        // Try to get workspace path from CodingAgent
        const agent = this.sessionManager.agent;
        if (typeof (agent as any).getWorkspacePath === 'function') {
          workspace = (agent as any).getWorkspacePath();
        }
      }

      // Display welcome information
      showWelcome({
        name: this.config.name,
        userId: this.config.userId,
        sessionId: this.currentSessionId,
        workspace: workspace
      });

      // Start input loop
      this.startInputLoop();

      console.log('🚀 CLI Client started successfully');
    } catch (error) {
      console.error('❌ Failed to start CLI Client:', error);
      throw error;
    }
  }

  /**
   * Stop CLI client
   */
  public async stop(): Promise<void> {
    try {
      // Save history
      if (this.config.enableHistory && this.config.historyFile) {
        saveHistory(this.config.historyFile, this.history);
      }

      // Close readline
      safeExit(this.rl);

      console.log('👋 CLI Client stopped');
    } catch (error) {
      console.error('❌ Error stopping CLI Client:', error);
    }
  }

  /**
   * Display session information
   */
  private showSessionInfo(): void {
    // Display workspace information
    const workspaceDir = this.fileImporter.getConfig().workingDirectory;
    console.log(formatSystemInfo(`Workspace: ${workspaceDir}`));
    
    if (this.currentSessionId) {
      console.log(formatSystemInfo(`Active Session: ${this.currentSessionId}`));
      if (this.sessionManager) {
        const sessionCount = this.sessionManager.getSessionCount();
        console.log(formatSystemInfo(`Total Sessions: ${sessionCount}`));
      }
    }
  }

  /**
   * Set event listeners
   */
  private setupEventListeners(): void {
    // Handle user input
    this.rl.on('line', this.handleUserInput.bind(this));

    // Handle exit signal
    this.rl.on('SIGINT', this.handleExit.bind(this));
    this.rl.on('close', this.handleExit.bind(this));

    // Handle errors
    this.rl.on('error', (error) => {
      console.error('Readline error:', error);
    });

    // Enable keypress events for ESC handling during agent processing
    if (process.stdin.isTTY) {
      // Enable keypress events
      require('readline').emitKeypressEvents(process.stdin);
      process.stdin.on('keypress', this.handleKeypress.bind(this));
    }
  }

  /**
   * Handle keypress events (particularly ESC key for interrupting agent)
   */
  private handleKeypress(str: string, key: any): void {
    // Handle ESC key to interrupt agent execution
    if (key && key.name === 'escape' && this.agentProcessing) {
      this.interruptAgent();
    }
    
    // Handle Ctrl+C
    if (key && key.ctrl && key.name === 'c') {
      this.handleExit();
    }
  }

  /**
   * Interrupt agent execution
   */
  private interruptAgent(): void {
    if (!this.agentProcessing) {
      return;
    }

    console.log('\n🛑 Interrupting agent execution...');
    
    try {
      // Try to stop the agent if it has a stop method
      if (this.sessionManager && this.sessionManager.agent) {
        const agent = this.sessionManager.agent;
        if (typeof agent.stop === 'function') {
          agent.stop();
          console.log('✅ Agent stopped successfully');
        } else {
          console.log('⚠️ Agent does not support stopping');
        }
      }
    } catch (error) {
      console.log(`❌ Error stopping agent: ${error}`);
    }

    // Reset processing state
    this.agentProcessing = false;
    if (this.agentCompletionResolve) {
      this.agentCompletionResolve();
      this.agentCompletionResolve = undefined;
      this.agentCompletionPromise = undefined;
    }

    // Show prompt again
    setTimeout(() => this.showPrompt(), 100);
  }

  /**
   * Start input loop
   */
  private startInputLoop(): void {
    this.showPrompt();
  }

  /**
   * Display input prompt
   */
  private showPrompt(): void {
    // If agent is processing, don't show prompt and check again later
    if (this.agentProcessing) {
      setTimeout(() => this.showPrompt(), 100);
      return;
    }

    // In single-line mode, display multi-line mode prompt every 5 times
    if (this.currentState === 'single' && this.promptCounter % 5 === 0) {
      console.log('💡 Tip: Type ### to start multi-line input mode');
    }
    
    this.promptCounter++;
    
    const prompt = getPrompt(
      this.currentState === 'multiline' ? 'multiline' : 'single',
      this.multilineState.buffer.length + 1
    );
    
    this.rl.setPrompt(prompt);
    this.rl.prompt();
  }

  /**
   * Handle user input
   */
  private async handleUserInput(input: string): Promise<void> {
    try {
      this.stats.totalInputs++;
      this.stats.lastInputTime = Date.now();

      // Handle pending prompts
      if (this.pendingPrompts.length > 0) {
        const prompt = this.pendingPrompts.shift()!;
        prompt.resolve(input);
        return;
      }

      // Handle multi-line mode
      if (this.currentState === 'multiline') {
        await this.handleMultilineInput(input);
        return;
      }

      // Check if it's a multi-line mode switch
      if (input.trim() === this.multilineState.delimiter) {
        this.toggleMultilineMode();
        return;
      }

      // Handle command
      if (isCommand(input)) {
        await this.handleCommand(input);
        return;
      }

      // Handle normal message
      await this.handleUserMessage(input);

    } catch (error) {
      console.error('Error handling input:', error);
    } finally {
      // Only show prompt if agent is not processing
      if (!this.agentProcessing) {
        this.showPrompt();
      }
    }
  }

  /**
   * Handle multi-line input
   */
  private async handleMultilineInput(input: string): Promise<void> {
    // Check if multi-line mode ends
    if (input.trim() === this.multilineState.delimiter) {
      await this.submitMultilineInput();
      return;
    }

    // Add to buffer
    this.multilineState.buffer.push(input);
  }

  /**
   * Submit multi-line input
   */
  private async submitMultilineInput(): Promise<void> {
    const content = this.multilineState.buffer.join('\n').trim();
    
    if (content) {
      this.stats.multilineInputs++;
      this.addToHistory(content, 'multiline');
      
      console.log('\n✅ Multi-line input submitted\n');
      await this.handleUserMessage(content);
    } else {
      console.log('\n❌ Empty multi-line input cancelled\n');
    }

    // Exit multi-line mode
    this.currentState = 'single';
    this.multilineState.isActive = false;
    this.multilineState.buffer = [];
  }

  /**
   * Toggle multi-line mode
   */
  public toggleMultilineMode(): void {
    if (this.currentState === 'multiline') {
      // Exit multi-line mode
      this.currentState = 'single';
      this.multilineState.isActive = false;
      this.multilineState.buffer = [];
      console.log('\n📝 Exited multi-line mode');
      console.log('💬 Back to single-line input mode\n');
    } else {
      // Enter multi-line mode
      this.currentState = 'multiline';
      this.multilineState.isActive = true;
      this.multilineState.buffer = [];
      console.log('\n📝 Multi-line mode activated!');
      console.log('┌─────────────────────────────────────┐');
      console.log('│ • Type your content (Enter for new lines)');
      console.log(`│ • Type '${this.multilineState.delimiter}' on a new line to submit`);
      console.log('│ • Your input will be collected until you submit');
      console.log('└─────────────────────────────────────┘\n');
    }
  }

  /**
   * Handle command
   */
  private async handleCommand(input: string): Promise<void> {
    const { command, args } = parseCommand(input);
    
    if (!command) {
      console.log('❌ Invalid command format');
      return;
    }

    const handler = this.commands[command.toLowerCase()];
    
    if (!handler) {
      console.log(`❌ Unknown command: ${command}`);
      console.log('Type /help or ? for available commands');
      return;
    }

    try {
      this.stats.commandsExecuted++;
      this.addToHistory(input, 'command');
      
      await handler.handler(args, this);
    } catch (error) {
      console.error(`Error executing command '${command}':`, error);
    }
  }

  /**
   * Handle user message
   */
  private async handleUserMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    try {
      // Handle file import syntax @file_path
      const processedContent = await this.fileImporter.processInput(content);
      
      // If content has changed, display processed content preview
      if (processedContent !== content) {
        const previewLength = 200;
        const preview = processedContent.length > previewLength 
          ? processedContent.substring(0, previewLength) + '...'
          : processedContent;
        
        console.log('\n📄 Processed message preview:');
        console.log('─'.repeat(50));
        console.log(preview);
        console.log('─'.repeat(50));
        console.log(`Total length: ${processedContent.length} characters\n`);
      }

      this.addToHistory(content, 'single'); // Save original input to history

      // Directly send processed message through SessionManager
      if (this.sessionManager) {
        console.log('✅ SessionManager found, sending message...');
        await this.sendMessageToAgent(processedContent);
      } else {
        console.log(formatError('SessionManager not configured. Use /send command or configure sessionManager.'));
      }
    } catch (error) {
      console.error('Error processing user message:', error);
      console.log(formatError(`Failed to process message: ${(error as Error).message}`));
    }
  }

  /**
   * Add to history
   */
  private addToHistory(command: string, type: 'single' | 'multiline' | 'command'): void {
    if (!this.config.enableHistory) return;

    const item: HistoryItem = {
      command,
      timestamp: Date.now(),
      type
    };

    this.history.push(item);

    // Limit history size
    const maxSize = this.config.maxHistorySize || 1000;
    if (this.history.length > maxSize) {
      this.history = this.history.slice(-maxSize);
    }
  }

  /**
   * Handle exit
   */
  private handleExit(): void {
    console.log('\n👋 Goodbye!');
    this.stop().catch(console.error);
  }

  /**
   * Prompt user input (for handling special input requests)
   */
  public async promptUserInput(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`\n📝 ${prompt}`);
      this.pendingPrompts.push({ resolve, reject });
      this.showPrompt();
    });
  }

  /**
   * Get statistics
   */
  public getStats(): CLIStats {
    return { ...this.stats };
  }

  /**
   * Get configuration
   */
  public getConfig(): CLIClientConfig {
    return this.config;
  }

  /**
   * Get history
   */
  public getHistory(): HistoryItem[] {
    return [...this.history];
  }

  /**
   * Get file importer
   */
  public getFileImporter(): FileImporter {
    return this.fileImporter;
  }
} 