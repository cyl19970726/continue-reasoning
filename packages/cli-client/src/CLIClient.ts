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

// 从本地类型定义导入接口类型
import {
  IClient,
  ISessionManager,
  ISessionManagerCallbacks,
  AgentStep,
  ToolCallParams,
  ToolExecutionResult
} from './core-types';

/**
 * 模块化的 CLI 客户端，实现 IClient 接口
 */
export class CLIClient implements IClient {
  // IClient 接口属性
  public name: string;
  public currentSessionId?: string;
  public sessionManager?: ISessionManager;

  private config: CLIClientConfig;
  private rl: readline.Interface;
  private commands: Record<string, CommandHandler>;
  
  // 状态管理
  private currentState: InputState = 'single';
  private multilineState: MultilineState;
  private history: HistoryItem[] = [];
  private stats: CLIStats;
  
  // Tool call 状态管理
  private activeToolCalls: Map<string, ToolCallDisplayState> = new Map();
  
  // 等待队列（用于处理用户输入请求）
  private pendingPrompts: Array<{
    resolve: (input: string) => void;
    reject: (error: Error) => void;
  }> = [];

  // 文件导入器
  private fileImporter: FileImporter;

  // 添加一个计数器来控制提示显示频率
  private promptCounter: number = 0;

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

    // 设置 IClient 属性
    this.name = this.config.name || 'cli-client';
    this.currentSessionId = this.config.sessionId;

    // 获取workspace目录
    const workspaceDir = getWorkspaceDirectory();

    // 初始化组件
    this.rl = createReadlineInterface({
      workingDirectory: workspaceDir,
      maxResults: 10,
      showHidden: false,
      allowedExtensions: this.config.fileImporter?.allowedExtensions || [],
      ...this.config.fileCompleter
    });
    this.commands = getAllCommands(this.config.customCommands);

    // 初始化文件导入器
    this.fileImporter = createFileImporter({
      workingDirectory: workspaceDir,
      maxFileSize: 1024 * 1024, // 1MB
      maxDepth: 3,
      showFilePath: true,
      // 可以从 config 中获取文件导入配置
      ...this.config.fileImporter
    });

    // 初始化状态
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

    // 加载历史记录
    if (this.config.enableHistory && this.config.historyFile) {
      this.history = loadHistory(this.config.historyFile);
    }

    this.setupEventListeners();
  }

  // ===========================================
  // IClient 接口实现
  // ===========================================

  /**
   * 设置会话管理器
   */
  setSessionManager(sessionManager: ISessionManager): void {
    this.sessionManager = sessionManager;
    
    // 设置回调
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
   * 处理 Agent 步骤事件
   */
  handleAgentStep(step: AgentStep<any>): void {
    try {
      // 处理不同类型的 Agent 步骤
      if (step.extractorResult) {
        // 处理思考内容
        if (step.extractorResult.thinking) {
          console.log(formatThinking(step.extractorResult.thinking));
        }

        // 处理最终答案
        if (step.extractorResult.finalAnswer) {
          console.log(formatFinalAnswer(step.extractorResult.finalAnswer));
        }
      }

      // 处理错误
      if (step.error) {
        console.log(formatError(step.error));
      }

      // 显示步骤信息
      if (this.config.enableTimestamps) {
        console.log(formatSystemInfo(`Step ${step.stepIndex} completed`));
      }
    } catch (error) {
      console.error('Error handling agent step:', error);
    }
  }

  /**
   * 处理工具调用开始事件
   */
  handleToolCall(toolCall: ToolCallParams): void {
    try {
      const { name, call_id, parameters } = toolCall;
      
      // 记录工具调用状态
      this.activeToolCalls.set(call_id, {
        callId: call_id,
        name: name,
        params: parameters,
        startTime: Date.now(),
        isActive: true
      });

      // 显示工具调用开始
      console.log(formatToolCallStart(name, parameters));
    } catch (error) {
      console.error('Error handling tool call:', error);
    }
  }

  /**
   * 处理工具调用结果事件
   */
  handleToolCallResult(result: ToolExecutionResult): void {
    try {
      const { name, call_id, status, result: toolResult, message } = result;
      
      // 获取对应的工具调用状态
      const toolCallState = this.activeToolCalls.get(call_id);
      if (toolCallState) {
        // 显示工具调用结果
        const success = status === 'succeed';
        const displayResult = toolResult || message || 'No result';
        
        console.log(formatToolCallResult(displayResult, success));
        
        // 清理状态
        this.activeToolCalls.delete(call_id);
        
        // 显示执行时间
        if (this.config.enableTimestamps) {
          const executionTime = Date.now() - toolCallState.startTime;
          console.log(formatSystemInfo(`${name} completed in ${executionTime}ms`));
        }
      } else {
        // 如果没有对应的开始状态，直接显示结果
        console.log(formatCompleteToolCall(name, {}, result.result || result.message, result.status === 'succeed'));
      }
    } catch (error) {
      console.error('Error handling tool call result:', error);
    }
  }

  /**
   * 发送消息给 Agent - 简化的方法签名
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
      
      // 使用会话管理器发送消息
      await this.sessionManager.sendMessageToAgent(
        message, 
        this.config.maxSteps || 10, 
        this.currentSessionId
      );
      
      console.log(formatSystemInfo('Message sent successfully'));
    } catch (error) {
      console.log(formatError(`Failed to send message: ${error}`));
    }
  }

  /**
   * 创建新会话 - 简化的方法签名
   */
  newSession(): void {
    if (!this.sessionManager) {
      console.log(formatError('No session manager configured'));
      return;
    }

    try {
      // 使用会话管理器创建新会话
      this.currentSessionId = this.sessionManager.createSession(
        this.config.userId,
        this.config.agentId
      );
      
      console.log(formatSystemInfo(`New session created: ${this.currentSessionId}`));
      
      // 显示会话信息
      this.showSessionInfo();
    } catch (error) {
      console.log(formatError(`Failed to create session: ${error}`));
    }
  }

  // ===========================================
  // CLI 客户端核心功能
  // ===========================================

  /**
   * 启动 CLI 客户端
   */
  public async start(): Promise<void> {
    try {
      // 获取 workspace 信息（如果有 SessionManager 的话）
      let workspace: string | undefined;
      if (this.sessionManager && this.sessionManager.agent) {
        // 尝试从 CodingAgent 获取 workspace 路径
        const agent = this.sessionManager.agent;
        if (typeof (agent as any).getWorkspacePath === 'function') {
          workspace = (agent as any).getWorkspacePath();
        }
      }

      // 显示欢迎信息
      showWelcome({
        name: this.config.name,
        userId: this.config.userId,
        sessionId: this.currentSessionId,
        workspace: workspace
      });

      // 开始输入循环
      this.startInputLoop();

      console.log('🚀 CLI Client started successfully');
    } catch (error) {
      console.error('❌ Failed to start CLI Client:', error);
      throw error;
    }
  }

  /**
   * 停止 CLI 客户端
   */
  public async stop(): Promise<void> {
    try {
      // 保存历史记录
      if (this.config.enableHistory && this.config.historyFile) {
        saveHistory(this.config.historyFile, this.history);
      }

      // 关闭 readline
      safeExit(this.rl);

      console.log('👋 CLI Client stopped');
    } catch (error) {
      console.error('❌ Error stopping CLI Client:', error);
    }
  }

  /**
   * 显示会话信息
   */
  private showSessionInfo(): void {
    // 显示workspace信息
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
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 处理用户输入
    this.rl.on('line', this.handleUserInput.bind(this));

    // 处理退出信号
    this.rl.on('SIGINT', this.handleExit.bind(this));
    this.rl.on('close', this.handleExit.bind(this));

    // 处理错误
    this.rl.on('error', (error) => {
      console.error('Readline error:', error);
    });
  }

  /**
   * 开始输入循环
   */
  private startInputLoop(): void {
    this.showPrompt();
  }

  /**
   * 显示输入提示符
   */
  private showPrompt(): void {
    // 在单行模式下，每5次提示显示一次多行模式的提示
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
   * 处理用户输入
   */
  private async handleUserInput(input: string): Promise<void> {
    try {
      this.stats.totalInputs++;
      this.stats.lastInputTime = Date.now();

      // 处理等待中的提示
      if (this.pendingPrompts.length > 0) {
        const prompt = this.pendingPrompts.shift()!;
        prompt.resolve(input);
        return;
      }

      // 处理多行模式
      if (this.currentState === 'multiline') {
        await this.handleMultilineInput(input);
        return;
      }

      // 检查是否为多行模式切换
      if (input.trim() === this.multilineState.delimiter) {
        this.toggleMultilineMode();
        return;
      }

      // 处理命令
      if (isCommand(input)) {
        await this.handleCommand(input);
        return;
      }

      // 处理普通消息
      await this.handleUserMessage(input);

    } catch (error) {
      console.error('Error handling input:', error);
    } finally {
      this.showPrompt();
    }
  }

  /**
   * 处理多行输入
   */
  private async handleMultilineInput(input: string): Promise<void> {
    // 检查是否结束多行模式
    if (input.trim() === this.multilineState.delimiter) {
      await this.submitMultilineInput();
      return;
    }

    // 添加到缓冲区
    this.multilineState.buffer.push(input);
  }

  /**
   * 提交多行输入
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

    // 退出多行模式
    this.currentState = 'single';
    this.multilineState.isActive = false;
    this.multilineState.buffer = [];
  }

  /**
   * 切换多行模式
   */
  public toggleMultilineMode(): void {
    if (this.currentState === 'multiline') {
      // 退出多行模式
      this.currentState = 'single';
      this.multilineState.isActive = false;
      this.multilineState.buffer = [];
      console.log('\n📝 Exited multi-line mode');
      console.log('💬 Back to single-line input mode\n');
    } else {
      // 进入多行模式
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
   * 处理命令
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
   * 处理用户消息
   */
  private async handleUserMessage(content: string): Promise<void> {
    if (!content.trim()) return;

    try {
      // 处理文件导入语法 @file_path
      const processedContent = await this.fileImporter.processInput(content);
      
      // 如果内容发生了变化，显示处理后的内容预览
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

      this.addToHistory(content, 'single'); // 保存原始输入到历史

      // 直接通过 SessionManager 发送处理后的消息
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
   * 添加到历史记录
   */
  private addToHistory(command: string, type: 'single' | 'multiline' | 'command'): void {
    if (!this.config.enableHistory) return;

    const item: HistoryItem = {
      command,
      timestamp: Date.now(),
      type
    };

    this.history.push(item);

    // 限制历史记录大小
    const maxSize = this.config.maxHistorySize || 1000;
    if (this.history.length > maxSize) {
      this.history = this.history.slice(-maxSize);
    }
  }

  /**
   * 处理退出
   */
  private handleExit(): void {
    console.log('\n👋 Goodbye!');
    this.stop().catch(console.error);
  }

  /**
   * 提示用户输入（用于处理特殊输入请求）
   */
  public async promptUserInput(prompt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log(`\n📝 ${prompt}`);
      this.pendingPrompts.push({ resolve, reject });
      this.showPrompt();
    });
  }

  /**
   * 获取统计信息
   */
  public getStats(): CLIStats {
    return { ...this.stats };
  }

  /**
   * 获取配置
   */
  public getConfig(): CLIClientConfig {
    return this.config;
  }

  /**
   * 获取历史记录
   */
  public getHistory(): HistoryItem[] {
    return [...this.history];
  }

  /**
   * 获取文件导入器
   */
  public getFileImporter(): FileImporter {
    return this.fileImporter;
  }
} 