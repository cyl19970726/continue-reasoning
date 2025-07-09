import React from 'react';
import { render, Instance } from 'ink';
import {
  IClient,
  ClientType,
  ClientStatus,
  ClientMessage,
  ISessionManager,
  AgentStep,
  ToolCallParams,
  ToolExecutionResult,
  IEventBus,
  AppEvent,
  SessionEvent,
  AgentEvent,
  LLMEvent,
  ToolEvent,
  UIEvent,
  ErrorEvent,
  EventHandler
} from '@continue-reasoning/core';
import { ReactCLIConfig, UIState, ImportedFile } from './interfaces/index.js';
import { ToolFormatterRegistry } from './formatters/index.js';
import { FileImporterRegistry } from './importers/index.js';
import App from './components/App.js';

/**
 * React CLI 客户端实现
 * 基于最新的 IClient 接口，使用事件驱动架构处理事件
 */
export class ReactCLIClient implements IClient {
  // IClient 必需属性
  readonly name: string;
  readonly type: ClientType = 'react-terminal';
  currentSessionId?: string;
  sessionManager?: ISessionManager;
  eventBus?: IEventBus;
  
  // 事件订阅管理
  private eventSubscriptionIds: string[] = [];

  // ReactCLI 特有属性
  private config: ReactCLIConfig;
  private messages: ClientMessage[] = [];
  private uiState: UIState;
  private isRunning: boolean = false;
  private inkInstance?: Instance;
  private toolFormatter: ToolFormatterRegistry;
  private fileImporter: FileImporterRegistry;
  
  // 用于通信的回调
  private onUIUpdate?: (state: UIState) => void;
  private resolveInput?: (value: string) => void;

  constructor(config: ReactCLIConfig) {
    this.name = config.name || 'React CLI Client';
    this.config = config;
    
    // 初始化 UI 状态
    this.uiState = {
      isProcessing: false,
      currentInput: '',
      showHelp: false,
      compactMode: config.compactMode || false,
      theme: config.theme || 'dark'
    };
    
    // 初始化工具系统
    this.toolFormatter = new ToolFormatterRegistry();
    this.fileImporter = new FileImporterRegistry();
    
    // 事件订阅将在 setEventBus 中设置
  }

  /**
   * 初始化客户端
   */
  async initialize(config?: ReactCLIConfig): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    // 设置默认值
    this.config.maxMessages = this.config.maxMessages || 100;
    this.config.enableToolFormatting = this.config.enableToolFormatting ?? true;
    this.config.enableFileImport = this.config.enableFileImport ?? true;
  }

  /**
   * 启动客户端
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    
    this.isRunning = true;
    
    // 检查是否支持 raw mode (应该在外层已经检查过了)
    if (!this.isRawModeSupported()) {
      console.error('❌ Raw mode is not supported in this environment.');
      console.error('The React CLI requires a proper terminal environment with raw mode support.');
      console.error('Please try running this in a regular terminal instead of an IDE or restricted environment.');
      console.error('');
      console.error('Alternative: You can use the standard CLI by running without the --react flag.');
      throw new Error('Raw mode not supported');
    }
    
    try {
      // 渲染 React 应用
      this.inkInstance = render(
        <App
          client={this}
          config={this.config}
          messages={this.messages}
          uiState={this.uiState}
          onUIStateChange={(state) => this.handleUIStateChange(state)}
          onSubmit={(message) => this.handleUserSubmit(message)}
          onExit={() => this.stop()}
        />
      );
      
      // 等待退出
      await this.inkInstance.waitUntilExit();
    } catch (error) {
      console.error('❌ Failed to start React CLI:', error);
      console.error('This may be due to terminal compatibility issues.');
      console.error('Please try running in a different terminal or without the --react flag.');
      process.exit(1);
    }
  }

  /**
   * 检查是否支持 raw mode
   */
  private isRawModeSupported(): boolean {
    try {
      // 在 VS Code 中尝试强制使用 React CLI
      const isVSCode = process.env.VSCODE_PID || process.env.TERM_PROGRAM === 'vscode';
      
      // 如果在 VS Code 中，尝试更宽松的检查
      if (isVSCode) {
        // 检查 stdin 是否有 setRawMode 方法
        if (typeof process.stdin.setRawMode !== 'function') {
          return false;
        }
        
        // 尝试临时设置 raw mode
        try {
          const originalRawMode = process.stdin.isRaw;
          process.stdin.setRawMode(true);
          process.stdin.setRawMode(originalRawMode || false);
          return true;
        } catch (error) {
          console.log('VS Code raw mode test failed, but continuing anyway...');
          return true; // 在 VS Code 中即使失败也尝试运行
        }
      }
      
      // 非 VS Code 环境使用标准检查
      // 检查 stdin 是否为 TTY
      if (!process.stdin.isTTY) {
        return false;
      }
      
      // 检查 stdin 是否有 setRawMode 方法
      if (typeof process.stdin.setRawMode !== 'function') {
        return false;
      }
      
      // 检查环境变量和常见的问题环境
      const isJetBrains = process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm';
      const isCI = process.env.CI || process.env.GITHUB_ACTIONS;
      
      if (isJetBrains || isCI) {
        return false;
      }
      
      // 尝试临时设置 raw mode
      const originalRawMode = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.setRawMode(originalRawMode || false);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 停止客户端
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    // 清理事件订阅
    this.cleanupSubscriptions();
    
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = undefined;
    }
  }

  /**
   * 设置事件总线
   */
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
    this.setupEventSubscriptions();
  }

  /**
   * 设置事件订阅
   */
  private setupEventSubscriptions(): void {
    if (!this.eventBus) return;
    
    // 清理现有订阅
    this.cleanupSubscriptions();
    
    // 设置新订阅
    this.subscribeToSessionEvents();
    this.subscribeToAgentEvents();
    this.subscribeToLLMEvents();
    this.subscribeToToolEvents();
    this.subscribeToErrorEvents();
  }

  /**
   * 订阅会话事件
   */
  private subscribeToSessionEvents(): void {
    if (!this.eventBus) return;
    
    // 会话开始
    const sessionStartId = this.eventBus.subscribe(
      'session.started',
      this.handleSessionStarted.bind(this)
    );
    
    // 会话结束
    const sessionEndId = this.eventBus.subscribe(
      'session.ended',
      this.handleSessionEnded.bind(this)
    );
    
    // 会话切换
    const sessionSwitchId = this.eventBus.subscribe(
      'session.switched',
      this.handleSessionSwitched.bind(this)
    );
    
    this.eventSubscriptionIds.push(sessionStartId, sessionEndId, sessionSwitchId);
  }

  /**
   * 订阅Agent事件
   */
  private subscribeToAgentEvents(): void {
    if (!this.eventBus) return;
    
    // Agent步骤完成
    const stepCompletedId = this.eventBus.subscribe(
      'agent.step.completed',
      this.handleAgentStepCompleted.bind(this)
    );
    
    // Agent停止
    const agentStoppedId = this.eventBus.subscribe(
      'agent.stopped',
      this.handleAgentStopped.bind(this)
    );
    
    this.eventSubscriptionIds.push(stepCompletedId, agentStoppedId);
  }

  /**
   * 订阅LLM事件
   */
  private subscribeToLLMEvents(): void {
    if (!this.eventBus || !this.isStreamingMode()) return;
    
    // 文本增量 (流式模式)
    const textDeltaId = this.eventBus.subscribe(
      'llm.text.delta',
      this.handleLLMTextDelta.bind(this)
    );
    
    // 文本完成
    const textCompleteId = this.eventBus.subscribe(
      'llm.text.completed',
      this.handleLLMTextCompleted.bind(this)
    );
    
    this.eventSubscriptionIds.push(textDeltaId, textCompleteId);
  }

  /**
   * 订阅工具事件
   */
  private subscribeToToolEvents(): void {
    if (!this.eventBus) return;
    
    // 工具执行开始
    const toolStartId = this.eventBus.subscribe(
      'tool.execution.started',
      this.handleToolExecutionStarted.bind(this)
    );
    
    // 工具执行完成
    const toolCompletedId = this.eventBus.subscribe(
      'tool.execution.completed',
      this.handleToolExecutionCompleted.bind(this)
    );
    
    // 工具执行失败
    const toolFailedId = this.eventBus.subscribe(
      'tool.execution.failed',
      this.handleToolExecutionFailed.bind(this)
    );
    
    this.eventSubscriptionIds.push(toolStartId, toolCompletedId, toolFailedId);
  }

  /**
   * 订阅错误事件
   */
  private subscribeToErrorEvents(): void {
    if (!this.eventBus) return;
    
    const errorId = this.eventBus.subscribe(
      'error.occurred',
      this.handleError.bind(this),
      { sessionId: this.currentSessionId } // 只处理当前会话的错误
    );
    
    this.eventSubscriptionIds.push(errorId);
  }

  /**
   * 设置会话管理器
   */
  setSessionManager(sessionManager: ISessionManager): void {
    this.sessionManager = sessionManager;
  }

  /**
   * 设置 Agent 回调 (已弃用)
   * @deprecated 请使用 setEventBus 和事件驱动架构代替
   */
  setAgentCallbacks(callbacks: any): void {
    console.warn('setAgentCallbacks is deprecated. Use setEventBus and event-driven architecture instead.');
    
    // 为了向后兼容，暂时保留这个方法
    // 但不建议使用，因为它与新的事件驱动架构冲突
    // 新的架构应该使用 setEventBus 方法
  }

  /**
   * 检查是否为流式模式
   */
  isStreamingMode(): boolean {
    return this.config.enableStreaming ?? true;
  }

  /**
   * 创建新会话
   */
  createSession(userId?: string, agentId?: string): string | undefined {
    if (!this.sessionManager) {
      this.addMessage({
        id: `error_${Date.now()}`,
        content: '❌ No session manager configured',
        type: 'error',
        timestamp: Date.now()
      });
      return undefined;
    }
    
    const sessionId = this.sessionManager.createSession(userId, agentId);
    this.currentSessionId = sessionId;
    return sessionId;
  }

  /**
   * 切换会话
   */
  switchSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.clearMessages();
    this.addMessage({
      id: `switch_${Date.now()}`,
      content: `📋 Switched to session: ${sessionId}`,
      type: 'system',
      timestamp: Date.now()
    });
  }

  /**
   * 创建新会话
   */
  newSession(): void {
    const sessionId = this.createSession(this.config.userId, this.config.agentId);
    if (sessionId) {
      this.addMessage({
        id: `new_session_${Date.now()}`,
        content: `✨ New session created: ${sessionId}`,
        type: 'system',
        timestamp: Date.now()
      });
    }
  }

  /**
   * 发送消息给 Agent
   */
  async sendMessageToAgent(message: string): Promise<void> {
    if (!this.sessionManager || !this.currentSessionId) {
      this.addMessage({
        id: `error_${Date.now()}`,
        content: '❌ No active session. Please create or select a session first.',
        type: 'error',
        timestamp: Date.now()
      });
      return;
    }
    
    // 添加用户消息
    this.addMessage({
      id: `user_${Date.now()}`,
      content: message,
      type: 'user',
      timestamp: Date.now()
    });
    
    // 更新 UI 状态
    this.updateUIState({ isProcessing: true });
    
    try {
      // 发送给 Agent
      await this.sessionManager.sendMessageToAgent(
        message,
        this.config.maxSteps || 50,
        this.currentSessionId
      );
    } catch (error) {
      this.addMessage({
        id: `error_${Date.now()}`,
        content: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
        type: 'error',
        timestamp: Date.now()
      });
    } finally {
      this.updateUIState({ isProcessing: false });
    }
  }

  /**
   * 消息管理
   */
  addMessage(message: ClientMessage): void {
    this.messages.push(message);
    
    // 限制消息数量
    if (this.messages.length > (this.config.maxMessages || 100)) {
      this.messages = this.messages.slice(-this.config.maxMessages!);
    }
    
    // 触发 UI 更新
    this.triggerUIUpdate();
  }

  clearMessages(): void {
    this.messages = [];
    this.triggerUIUpdate();
  }

  getMessages(): ClientMessage[] {
    return [...this.messages];
  }

  /**
   * 获取客户端状态
   */
  getStatus(): ClientStatus {
    return {
      name: this.name,
      type: this.type,
      isInitialized: true,
      isRunning: this.isRunning,
      hasSessionManager: !!this.sessionManager,
      currentSessionId: this.currentSessionId,
      messageCount: this.messages.length,
      lastActivity: this.messages.length > 0 
        ? this.messages[this.messages.length - 1].timestamp 
        : undefined
    };
  }

  /**
   * 处理 Agent 步骤 - IClient 接口要求的方法
   */
  handleAgentStep(step: AgentStep<any>): void {
    const stepMessage: ClientMessage = {
      id: `step_${step.stepIndex}`,
      content: this.formatAgentStep(step),
      type: 'agent',
      timestamp: Date.now(),
      stepIndex: step.stepIndex,
      metadata: { step }
    };
    
    this.addMessage(stepMessage);
  }

  /**
   * 处理工具调用开始 - 目前无需处理
   */
  private handleToolCallStart(toolCall: ToolCallParams): void {
    // 无需处理，工具调用在执行开始时才显示
  }

  /**
   * 处理工具执行开始 - 显示工具名称和参数
   */
  private handleToolExecutionStart(toolCall: ToolCallParams): void {
    // 格式化参数显示
    const paramsStr = toolCall.parameters && Object.keys(toolCall.parameters).length > 0
      ? JSON.stringify(toolCall.parameters, null, 2)
      : 'No parameters';
    
    const message: ClientMessage = {
      id: `tool_start_${toolCall.call_id}`,
      content: `🔧 **${toolCall.name}**\n\`\`\`json\n${paramsStr}\n\`\`\``,
      type: 'tool',
      timestamp: Date.now(),
      metadata: { toolCall, status: 'running' }
    };
    
    this.addMessage(message);
  }

  /**
   * 处理工具执行结束
   */
  private handleToolExecutionEnd(result: ToolExecutionResult): void {
    // 使用格式化器格式化结果
    const formattedContent = this.config.enableToolFormatting
      ? this.toolFormatter.format(result.name, result)
      : JSON.stringify(result, null, 2);
    
    const message: ClientMessage = {
      id: `tool_end_${result.call_id}`,
      content: formattedContent,
      type: 'tool',
      timestamp: Date.now(),
      metadata: { result, status: 'completed' }
    };
    
    this.addMessage(message);
  }

  /**
   * 处理流式文本增量 (已弃用)
   * @deprecated 请使用事件驱动架构中的 handleLLMTextDelta 方法
   */
  private handleStreamDelta(delta: string): void {
    console.warn('handleStreamDelta is deprecated. Use event-driven architecture instead.');
    // 此方法已被 handleLLMTextDelta 事件处理方法替代
  }

  /**
   * 格式化 Agent 步骤
   */
  private formatAgentStep(step: AgentStep<any>): string {
    // 优先显示 Agent 的响应
    if (step.extractorResult?.response) {
      return step.extractorResult.response;
    }
    
    // 如果有思考过程，显示思考内容
    if (step.extractorResult?.thinking) {
      return `💭 Thinking: ${step.extractorResult.thinking}`;
    }
    
    // 如果有工具调用结果，显示工具调用信息
    if (step.toolExecutionResults && step.toolExecutionResults.length > 0) {
      const toolResults = step.toolExecutionResults.map((result: ToolExecutionResult) => {
        if (result.status === 'succeed') {
          return `✅ Tool ${result.name}: ${result.message || 'Success'}`;
        } else if (result.status === 'failed') {
          return `❌ Tool ${result.name}: ${result.message || 'Failed'}`;
        } else {
          return `⏳ Tool ${result.name}: ${result.message || 'Pending'}`;
        }
      }).join('\n');
      return toolResults;
    }
    
    // 如果有原始文本，显示原始文本
    if (step.rawText) {
      return step.rawText;
    }
    
    // 兜底显示
    return `Step ${step.stepIndex} completed`;
  }

  /**
   * 处理 UI 状态变化
   */
  private handleUIStateChange(state: Partial<UIState>): void {
    this.uiState = { ...this.uiState, ...state };
    
    // 发布UI状态变化事件
    if (this.eventBus) {
      this.eventBus.publish({
        type: 'ui.state.changed',
        timestamp: Date.now(),
        source: 'ReactCLIClient',
        sessionId: this.currentSessionId,
        data: {
          state: this.uiState,
          clientName: this.name
        }
      } as UIEvent);
    }
    
    this.onUIUpdate?.(this.uiState);
  }

  /**
   * 处理用户提交
   */
  private handleUserSubmit(message: string): void {
    // 发布用户消息事件
    if (this.eventBus) {
      this.eventBus.publish({
        type: 'user.message',
        timestamp: Date.now(),
        source: 'ReactCLIClient',
        sessionId: this.currentSessionId,
        data: {
          messageContent: message,
          userId: this.config.userId,
          clientName: this.name,
          sessionId: this.currentSessionId
        }
      } as UIEvent);
    }
    
    if (this.resolveInput) {
      this.resolveInput(message);
      this.resolveInput = undefined;
    } else {
      // 直接发送给 Agent
      this.sendMessageToAgent(message).catch(console.error);
    }
  }

  /**
   * 触发 UI 更新
   */
  private triggerUIUpdate(): void {
    // React 会自动处理状态更新
    if (this.inkInstance) {
      // 强制重新渲染
      this.inkInstance.rerender(
        <App
          client={this}
          config={this.config}
          messages={this.messages}
          uiState={this.uiState}
          onUIStateChange={(state) => this.handleUIStateChange(state)}
          onSubmit={(message) => this.handleUserSubmit(message)}
          onExit={() => this.stop()}
        />
      );
    }
  }

  // ========== React CLI 特有方法 ==========

  /**
   * 更新 UI 状态
   */
  updateUIState(state: Partial<UIState>): void {
    this.handleUIStateChange(state);
  }

  /**
   * 切换紧凑模式
   */
  toggleCompactMode(): void {
    this.uiState.compactMode = !this.uiState.compactMode;
    this.triggerUIUpdate();
  }

  /**
   * 设置主题
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.uiState.theme = theme;
    this.config.theme = theme;
    this.triggerUIUpdate();
  }

  /**
   * 导入文件
   */
  async importFile(filePath: string): Promise<ImportedFile> {
    try {
      const imported = await this.fileImporter.import(filePath, {
        maxSize: this.config.maxFileSize,
        includeMetadata: true
      });
      
      this.addMessage({
        id: `import_${Date.now()}`,
        content: `📄 Imported file: ${imported.name} (${imported.type})`,
        type: 'system',
        timestamp: Date.now(),
        metadata: { file: imported }
      });
      
      return imported;
    } catch (error) {
      const errorMsg = `Failed to import ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
      this.addMessage({
        id: `import_error_${Date.now()}`,
        content: `❌ ${errorMsg}`,
        type: 'error',
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * 批量导入文件
   */
  async importFiles(filePaths: string[]): Promise<ImportedFile[]> {
    const results = await Promise.allSettled(
      filePaths.map(path => this.importFile(path))
    );
    
    return results
      .filter((result): result is PromiseFulfilledResult<ImportedFile> => 
        result.status === 'fulfilled'
      )
      .map(result => result.value);
  }

  /**
   * 格式化工具结果
   */
  formatToolResult(toolName: string, result: any): string {
    return this.toolFormatter.format(toolName, result as any);
  }

  /**
   * 搜索消息
   */
  searchMessages(query: string): ClientMessage[] {
    const lowerQuery = query.toLowerCase();
    return this.messages.filter(msg => 
      msg.content.toLowerCase().includes(lowerQuery) ||
      msg.type.includes(lowerQuery) ||
      (msg.metadata && JSON.stringify(msg.metadata).toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * 导出消息
   */
  exportMessages(format: 'json' | 'markdown' | 'txt'): string {
    switch (format) {
      case 'json':
        return JSON.stringify(this.messages, null, 2);
      
      case 'markdown':
        return this.messages.map(msg => {
          const timestamp = new Date(msg.timestamp).toLocaleString();
          const type = msg.type.toUpperCase();
          return `### [${timestamp}] ${type}\n\n${msg.content}\n`;
        }).join('\n---\n\n');
      
      case 'txt':
        return this.messages.map(msg => {
          const timestamp = new Date(msg.timestamp).toLocaleString();
          const type = msg.type.toUpperCase();
          return `[${timestamp}] ${type}: ${msg.content}`;
        }).join('\n\n');
      
      default:
        return '';
    }
  }

  // ========== 事件处理方法 ==========

  /**
   * 处理会话开始事件
   */
  private handleSessionStarted(event: SessionEvent): void {
    if (event.type === 'session.started') {
      this.currentSessionId = event.sessionId;
      this.addMessage({
        id: `session_start_${Date.now()}`,
        content: `🚀 Session started: ${event.sessionId}`,
        type: 'system',
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理会话结束事件
   */
  private handleSessionEnded(event: SessionEvent): void {
    if (event.type === 'session.ended') {
      this.addMessage({
        id: `session_end_${Date.now()}`,
        content: `👋 Session ended: ${event.sessionId}`,
        type: 'system',
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理会话切换事件
   */
  private handleSessionSwitched(event: SessionEvent): void {
    if (event.type === 'session.switched') {
      this.currentSessionId = event.sessionId;
      this.clearMessages();
      this.addMessage({
        id: `session_switch_${Date.now()}`,
        content: `📋 Switched to session: ${event.sessionId}`,
        type: 'system',
        timestamp: Date.now()
      });
    }
  }

  /**
   * 处理Agent步骤完成事件
   */
  private handleAgentStepCompleted(event: AgentEvent): void {
    if (event.type === 'agent.step.completed' && event.data?.step) {
      const stepMessage: ClientMessage = {
        id: `step_${event.stepIndex}`,
        content: this.formatAgentStep(event.data.step),
        type: 'agent',
        timestamp: Date.now(),
        stepIndex: event.stepIndex,
        metadata: { step: event.data.step }
      };
      
      this.addMessage(stepMessage);
    }
  }

  /**
   * 处理Agent停止事件
   */
  private handleAgentStopped(event: AgentEvent): void {
    if (event.type === 'agent.stopped') {
      this.addMessage({
        id: `agent_stopped_${Date.now()}`,
        content: `🛑 Agent stopped: ${event.data?.reason || 'Unknown reason'}`,
        type: 'system',
        timestamp: Date.now()
      });
      // 更新UI状态
      this.updateUIState({ isProcessing: false });
    }
  }

  /**
   * 处理LLM文本增量事件（流式模式）
   */
  private handleLLMTextDelta(event: LLMEvent): void {
    if (event.type === 'llm.text.delta' && event.data?.content) {
      // 在流式模式下，实时更新最后一条消息
      if (this.messages.length > 0) {
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage.type === 'agent' && lastMessage.metadata?.streaming) {
          lastMessage.content += event.data.content;
          this.triggerUIUpdate();
          return;
        }
      }
      
      // 如果没有正在流式传输的消息，创建新的
      this.addMessage({
        id: `stream_${Date.now()}`,
        content: event.data.content,
        type: 'agent',
        timestamp: Date.now(),
        metadata: { streaming: true }
      });
    }
  }

  /**
   * 处理LLM文本完成事件
   */
  private handleLLMTextCompleted(event: LLMEvent): void {
    if (event.type === 'llm.text.completed' && event.data?.content) {
      // 如果是流式模式，标记最后一条消息为完成
      if (this.isStreamingMode() && this.messages.length > 0) {
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage.type === 'agent' && lastMessage.metadata?.streaming) {
          lastMessage.metadata.streaming = false;
          this.triggerUIUpdate();
          return;
        }
      }
      
      // 如果是非流式模式，添加完整的消息
      this.addMessage({
        id: `llm_text_${Date.now()}`,
        content: event.data.content,
        type: 'agent',
        timestamp: Date.now(),
        stepIndex: event.stepIndex
      });
    }
  }

  /**
   * 处理工具执行开始事件
   */
  private handleToolExecutionStarted(event: ToolEvent): void {
    if (event.type === 'tool.execution.started' && event.data?.toolCall) {
      const paramsStr = event.data.toolCall.parameters && 
        Object.keys(event.data.toolCall.parameters).length > 0
          ? JSON.stringify(event.data.toolCall.parameters, null, 2)
          : 'No parameters';
      
      const message: ClientMessage = {
        id: `tool_start_${event.data.toolCall.call_id}`,
        content: `🔧 **${event.data.toolCall.name}**\n\`\`\`json\n${paramsStr}\n\`\`\``,
        type: 'tool',
        timestamp: Date.now(),
        metadata: { toolCall: event.data.toolCall, status: 'running' }
      };
      
      this.addMessage(message);
    }
  }

  /**
   * 处理工具执行完成事件
   */
  private handleToolExecutionCompleted(event: ToolEvent): void {
    if (event.type === 'tool.execution.completed' && event.data?.result) {
      // 使用格式化器格式化结果
      const formattedContent = this.config.enableToolFormatting
        ? this.toolFormatter.format(event.data.result.name, event.data.result)
        : JSON.stringify(event.data.result, null, 2);
      
      const message: ClientMessage = {
        id: `tool_end_${event.data.result.call_id}`,
        content: formattedContent,
        type: 'tool',
        timestamp: Date.now(),
        metadata: { result: event.data.result, status: 'completed' }
      };
      
      this.addMessage(message);
    }
  }

  /**
   * 处理工具执行失败事件
   */
  private handleToolExecutionFailed(event: ToolEvent): void {
    if (event.type === 'tool.execution.failed' && event.data?.result) {
      const message: ClientMessage = {
        id: `tool_failed_${event.data.result.call_id}`,
        content: `❌ Tool ${event.data.result.name} failed: ${event.data.result.message || 'Unknown error'}`,
        type: 'tool',
        timestamp: Date.now(),
        metadata: { result: event.data.result, status: 'failed' }
      };
      
      this.addMessage(message);
    }
  }

  /**
   * 处理错误事件
   */
  private handleError(event: ErrorEvent): void {
    if (event.type === 'error.occurred') {
      const errorMessage = event.data.error instanceof Error 
        ? event.data.error.message 
        : String(event.data.error);
      
      this.addMessage({
        id: `error_${Date.now()}`,
        content: `❌ Error: ${errorMessage}`,
        type: 'error',
        timestamp: Date.now(),
        metadata: { context: event.data.context }
      });
    }
  }

  // ========== 资源管理 ==========

  /**
   * 清理订阅
   */
  private cleanupSubscriptions(): void {
    if (this.eventBus && this.eventSubscriptionIds.length > 0) {
      this.eventSubscriptionIds.forEach(id => {
        this.eventBus!.unsubscribe(id);
      });
      this.eventSubscriptionIds = [];
    }
  }
}