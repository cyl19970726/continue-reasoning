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
  EventHandler,
  logger,
  AgentStorage,
  SessionStats,
  SessionManager
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
  
  // Agent 引用（用于创建SessionManager）
  private agent?: any;
  
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
    // 注意：SessionManager 需要在 setEventBus 被调用后才能创建
    // 因为 SessionManager 需要 EventBus 实例
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
    
    // 设置事件显示默认值
    if (!this.config.eventDisplay) {
      this.config.eventDisplay = {};
    }
    
    // Session事件默认值
    this.config.eventDisplay.session = {
      showStarted: true,
      showEnded: true,
      showSwitched: true,
      ...this.config.eventDisplay.session
    };
    
    // Agent事件默认值 - 默认隐藏详细步骤信息
    this.config.eventDisplay.agent = {
      showStepCompleted: false,  // 默认不显示步骤完成
      showStepDetails: false,     // 默认不显示步骤详情
      showReasoning: false,       // 默认不显示推理过程
      showResponse: true,         // 默认显示响应内容
      showStopped: true,
      ...this.config.eventDisplay.agent
    };
    
    // Tool事件默认值 - 默认显示工具的开始和完成
    this.config.eventDisplay.tool = {
      showStarted: true,          // 默认显示工具开始
      showCompleted: true,        // 默认显示工具完成
      showFailed: true,          // 默认显示工具失败
      showDetails: false,        // 默认不显示工具详细输出
      ...this.config.eventDisplay.tool
    };
    
    // Error事件默认值
    this.config.eventDisplay.error = {
      showErrors: true,
      showStackTrace: false,
      ...this.config.eventDisplay.error
    };
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
   * 停止当前运行的 Agent
   */
  async stopAgent(): Promise<void> {
    if (this.agent && typeof this.agent.stop === 'function') {
      try {
        await this.agent.stop();
        this.addMessage({
          id: `agent_stop_${Date.now()}`,
          content: '🛑 Agent execution stopped by user',
          type: 'system',
          timestamp: Date.now()
        });
      } catch (error) {
        this.addMessage({
          id: `agent_stop_error_${Date.now()}`,
          content: `❌ Failed to stop agent: ${error instanceof Error ? error.message : String(error)}`,
          type: 'error',
          timestamp: Date.now()
        });
      }
    } else {
      this.addMessage({
        id: `agent_stop_na_${Date.now()}`,
        content: '⚠️ No running agent to stop',
        type: 'system',
        timestamp: Date.now()
      });
    }
    
    // 更新 UI 状态
    this.updateUIState({ isProcessing: false });
  }

  /**
   * 设置事件总线
   */
  setEventBus(eventBus: IEventBus): void {
    this.eventBus = eventBus;
    this.setupEventSubscriptions();
    
    // 如果已经有Agent，现在可以创建SessionManager
    this.createSessionManagerIfReady();
    
    // 在UI中显示调试信息
    this.addMessage({
      id: `debug_eventbus_${Date.now()}`,
      content: '🔧 DEBUG: EventBus set and subscriptions created',
      type: 'system',
      timestamp: Date.now()
    });
  }

  /**
   * 设置Agent实例
   */
  setAgent(agent: any): void {
    this.agent = agent;
    
    // 如果已经有EventBus，现在可以创建SessionManager
    this.createSessionManagerIfReady();
    
    // 在UI中显示调试信息
    this.addMessage({
      id: `debug_agent_${Date.now()}`,
      content: '🔧 DEBUG: Agent set',
      type: 'system',
      timestamp: Date.now()
    });
  }

  /**
   * 创建SessionManager（如果Agent和EventBus都已准备好）
   */
  private createSessionManagerIfReady(): void {
    if (this.agent && this.eventBus && !this.sessionManager) {
      try {
        this.sessionManager = new SessionManager(this.agent, this.eventBus);
        
        // 在UI中显示调试信息
        this.addMessage({
          id: `debug_sessionmanager_${Date.now()}`,
          content: '🔧 DEBUG: SessionManager created',
          type: 'system',
          timestamp: Date.now()
        });
      } catch (error) {
        this.addMessage({
          id: `error_sessionmanager_${Date.now()}`,
          content: `❌ Failed to create SessionManager: ${error instanceof Error ? error.message : String(error)}`,
          type: 'error',
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 设置事件订阅
   */
  private setupEventSubscriptions(): void {
    if (!this.eventBus) {
      logger.warn('ReactCLIClient: No eventBus available for subscriptions');
      return;
    }
    
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
    if (!this.eventBus) return;
    
    // 暂时移除 llm.text.delta 和 llm.text.completed 事件订阅
    // 统一使用 AgentStep 事件来处理文本显示
    
    // 可以在这里添加其他 LLM 事件，比如 llm.call.started, llm.call.completed 等
    // 但是文本相关的事件暂时不处理
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
  createSession(userId?: string, agentId?: string): string {
    if (!this.sessionManager) {
      this.addMessage({
        id: `error_${Date.now()}`,
        content: '❌ No session manager configured',
        type: 'error',
        timestamp: Date.now()
      });
      throw new Error('No session manager configured');
    }
    
    const sessionId = this.sessionManager.createSession(userId, agentId);
    this.currentSessionId = sessionId;
    return sessionId;
  }

  /**
   * 切换会话
   */
  async switchSession(sessionId: string): Promise<void> {
    if (!this.sessionManager) {
      this.addMessage({
        id: `error_${Date.now()}`,
        content: '❌ No session manager configured',
        type: 'error',
        timestamp: Date.now()
      });
      throw new Error('No session manager configured');
    }
    
    await this.sessionManager.switchSession(sessionId);
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
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (!this.sessionManager) {
      throw new Error('No session manager configured');
    }
    
    await this.sessionManager.deleteSession(sessionId);
    
    // 如果删除的是当前会话，清除当前会话ID
    if (this.currentSessionId === sessionId) {
      this.currentSessionId = undefined;
    }
  }

  /**
   * 加载会话
   */
  async loadSession(sessionId: string): Promise<AgentStorage | null> {
    if (!this.sessionManager) {
      return null;
    }
    
    return await this.sessionManager.loadSession(sessionId);
  }

  /**
   * 保存会话
   */
  async saveSession(sessionId: string, storage: AgentStorage): Promise<void> {
    if (!this.sessionManager) {
      throw new Error('No session manager configured');
    }
    
    await this.sessionManager.saveSession(sessionId, storage);
  }

  /**
   * 获取当前会话ID
   */
  getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<AgentStorage[]> {
    if (!this.sessionManager) {
      return [];
    }
    
    return await this.sessionManager.listSessions();
  }

  /**
   * 获取会话统计信息
   */
  async getSessionStats(): Promise<SessionStats> {
    if (!this.sessionManager) {
      return {
        totalSessions: 0,
        activeSessions: 0,
        currentSessionId: this.currentSessionId
      };
    }
    
    return await this.sessionManager.getSessionStats();
  }

  /**
   * 发送消息给 Agent
   */
  async sendMessageToAgent(message: string): Promise<void> {
    if (!this.sessionManager) {
      this.addMessage({
        id: `error_${Date.now()}`,
        content: '❌ No session manager configured.',
        type: 'error',
        timestamp: Date.now()
      });
      return;
    }
    
    // 如果没有当前会话，自动创建一个
    if (!this.currentSessionId) {
      const sessionId = this.createSession(this.config.userId, this.config.agentId);
      if (!sessionId) {
        this.addMessage({
          id: `error_${Date.now()}`,
          content: '❌ Failed to create session.',
          type: 'error',
          timestamp: Date.now()
        });
        return;
      }
      this.currentSessionId = sessionId;
      this.addMessage({
        id: `session_created_${Date.now()}`,
        content: `✨ New session created: ${sessionId}`,
        type: 'system',
        timestamp: Date.now()
      });
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
    // 消息去重逻辑 - 检查是否已存在相同的消息
    const isDuplicate = this.messages.some(existingMsg => {
      // 如果有 stepIndex，基于 stepIndex 和消息类型进行去重
      if (message.stepIndex !== undefined && existingMsg.stepIndex !== undefined) {
        return existingMsg.stepIndex === message.stepIndex && 
               existingMsg.type === message.type &&
               Math.abs(existingMsg.timestamp - message.timestamp) < 5000; // 5秒内的重复消息
      }
      
      // 对于没有 stepIndex 的消息，基于内容和时间进行去重
      return existingMsg.content === message.content && 
             existingMsg.type === message.type &&
             Math.abs(existingMsg.timestamp - message.timestamp) < 1000; // 1秒内的重复消息
    });
    
    if (!isDuplicate) {
      this.messages.push(message);
      
      // 限制消息数量
      if (this.messages.length > (this.config.maxMessages || 10000)) {
        this.messages = this.messages.slice(-this.config.maxMessages!);
      }
      
      // 触发 UI 更新
      this.triggerUIUpdate();
    }
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
   * 已禁用以防止重复处理，现在统一使用事件驱动的 handleAgentStepCompleted 方法
   */
  handleAgentStep(step: AgentStep<any>): void {
    // 禁用直接调用以防止重复处理
    // 现在统一使用 handleAgentStepCompleted 事件处理方法
    console.debug('handleAgentStep called but disabled - using event-driven handleAgentStepCompleted instead');
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
        
    // 如果有思考过程，显示思考内容
    if (step.extractorResult?.reasoning) {
      return `💭 Thinking: ${step.extractorResult.thinking}`;
    }
    

    // 优先显示 Agent 的响应
    if (step.extractorResult?.response) {
      return step.extractorResult.response;
    }

    // // 如果有工具调用结果，显示工具调用信息
    // if (step.toolExecutionResults && step.toolExecutionResults.length > 0) {
    //   const toolResults = step.toolExecutionResults.map((result: ToolExecutionResult) => {
    //     if (result.status === 'succeed') {
    //       return `✅ Tool ${result.name}: ${result.message || 'Success'}`;
    //     } else if (result.status === 'failed') {
    //       return `❌ Tool ${result.name}: ${result.message || 'Failed'}`;
    //     } else {
    //       return `⏳ Tool ${result.name}: ${result.message || 'Pending'}`;
    //     }
    //   }).join('\n');
    //   return toolResults;
    // }
    
    // // 如果有原始文本，显示原始文本
    // if (step.rawText) {
    //   return step.rawText;
    // }
    
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
    // 检查是否是命令
    if (message.startsWith('/')) {
      this.handleCommand(message);
      return;
    }
    
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
   * 处理命令
   */
  private handleCommand(command: string): void {
    const cmd = command.toLowerCase().trim();
    
    switch (cmd) {
      case '/create-session':
        this.createSession();
        break;
      case '/help':
        this.showHelp();
        break;
      case '/clear':
        this.clearMessages();
        this.addMessage({
          id: `clear_${Date.now()}`,
          content: '🧹 Messages cleared',
          type: 'system',
          timestamp: Date.now()
        });
        break;
      case '/exit':
      case '/quit':
        this.stop();
        break;
      default:
        this.addMessage({
          id: `unknown_cmd_${Date.now()}`,
          content: `❓ Unknown command: ${command}. Type /help for available commands.`,
          type: 'error',
          timestamp: Date.now()
        });
    }
  }
  
  /**
   * 显示帮助信息
   */
  private showHelp(): void {
    const helpMessage = `📚 Available Commands:

/create-session    Create a new session
/clear            Clear all messages
/help             Show this help message
/exit, /quit      Exit the application

💡 Tips:
• Type your questions or coding tasks directly
• Use triple backticks to enter multiline mode
• Press Ctrl+C to cancel current input
• Press ESC to stop running agent

⌨️ Keyboard Shortcuts:
• ESC             Stop running agent
• Ctrl+H          Toggle help panel
• Ctrl+L          Clear messages
• Ctrl+K          Toggle compact mode
• Ctrl+T          Change theme
• ↑/↓ arrows      Scroll messages
• Page Up/Down    Fast scroll`;
    
    this.addMessage({
      id: `help_${Date.now()}`,
      content: helpMessage,
      type: 'system',
      timestamp: Date.now()
    });
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
      
      // 只在配置允许时显示消息
      if (this.config.eventDisplay?.session?.showStarted) {
        this.addMessage({
          id: `session_start_${Date.now()}`,
          content: `🚀 Session started: ${event.sessionId}`,
          type: 'system',
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 处理会话结束事件
   */
  private handleSessionEnded(event: SessionEvent): void {
    if (event.type === 'session.ended') {
      // 只在配置允许时显示消息
      if (this.config.eventDisplay?.session?.showEnded) {
        this.addMessage({
          id: `session_end_${Date.now()}`,
          content: `👋 Session ended: ${event.sessionId}`,
          type: 'system',
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 处理会话切换事件
   */
  private handleSessionSwitched(event: SessionEvent): void {
    if (event.type === 'session.switched') {
      this.currentSessionId = event.sessionId;
      this.clearMessages();
      
      // 只在配置允许时显示消息
      if (this.config.eventDisplay?.session?.showSwitched) {
        this.addMessage({
          id: `session_switch_${Date.now()}`,
          content: `📋 Switched to session: ${event.sessionId}`,
          type: 'system',
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * 处理Agent步骤完成事件
   */
  private handleAgentStepCompleted(event: AgentEvent): void {
    if (event.type === 'agent.step.completed' && event.data?.step) {
      let agentStep = event.data.step;
      
      // 显示推理过程 - 保持原始格式
      if (this.config.eventDisplay?.agent?.showReasoning && agentStep.extractorResult?.reasoning) {
        this.addMessage({
          id: `reasoning_${event.stepIndex}_${Date.now()}`,
          content: agentStep.extractorResult.reasoning, // 保持原始格式，不添加前缀
          type: 'agent.reasoning',
          timestamp: Date.now(),
          stepIndex: event.stepIndex,
        });
      }

      // 显示响应内容 - 保持原始格式
      if (this.config.eventDisplay?.agent?.showResponse && agentStep.extractorResult?.response) {
        this.addMessage({
          id: `response_${event.stepIndex}_${Date.now()}`,
          content: agentStep.extractorResult.response, // 保持原始格式，不添加前缀
          type: 'agent.response',
          timestamp: Date.now(),
          stepIndex: event.stepIndex,
        });
      }

      // 显示步骤完成消息
      if (this.config.eventDisplay?.agent?.showStepCompleted) {
        const stepMessage: ClientMessage = {
          id: `step_${event.stepIndex}`,
          content: `Step ${event.stepIndex} completed`,
          type: 'system',
          timestamp: Date.now(),
          stepIndex: event.stepIndex,
          metadata: { step: event.data.step }
        };
        
        this.addMessage(stepMessage);
      }
    }
  }

  /**
   * 处理Agent停止事件
   */
  private handleAgentStopped(event: AgentEvent): void {
    if (event.type === 'agent.stopped') {
      // 只在配置允许时显示停止消息
      if (this.config.eventDisplay?.agent?.showStopped) {
        this.addMessage({
          id: `agent_stopped_${Date.now()}`,
          content: `🛑 Agent stopped: ${event.data?.reason || 'Unknown reason'}`,
          type: 'system',
          timestamp: Date.now()
        });
      }
      // 更新UI状态
      this.updateUIState({ isProcessing: false });
    }
  }

  /**
   * 处理LLM文本增量事件（流式模式）- 已禁用
   * 现在统一使用 AgentStep 事件来处理文本显示
   */
  private handleLLMTextDelta(event: LLMEvent): void {
    // 暂时禁用，统一使用 AgentStep 事件处理文本显示
    // 如果需要重新启用，请在 subscribeToLLMEvents 中重新订阅此事件
  }

  /**
   * 处理LLM文本完成事件 - 已禁用
   * 现在统一使用 AgentStep 事件来处理文本显示
   */
  private handleLLMTextCompleted(event: LLMEvent): void {
    // 暂时禁用，统一使用 AgentStep 事件处理文本显示
    // 如果需要重新启用，请在 subscribeToLLMEvents 中重新订阅此事件
  }

  /**
   * 格式化工具开始消息
   */
  private formatToolStart(toolCall: any): string {
    const toolName = toolCall.name;
    const callId = toolCall.call_id;
    const params = toolCall.parameters || {};
    
    // 根据工具类型进行特殊格式化
    switch (toolName) {
      case 'ApplyWholeFileEdit':
      case 'ApplyEditBlock':
      case 'ApplyRangedEdit':
      case 'Delete':
        // editing-strategy-tools: 显示 name, call_id, path
        const path = params.path || 'N/A';
        return `🔧 **${toolName}**\n📋 Call ID: ${callId}\n📁 Path: ${path}`;
        
      case 'ApplyUnifiedDiff':
        // 对于UnifiedDiff，显示baseDir
        const baseDir = params.baseDir || 'current workspace';
        return `🔧 **${toolName}**\n📋 Call ID: ${callId}\n📁 Base Directory: ${baseDir}`;
        
      case 'TodoUpdate':
        // TodoUpdate工具：显示todos内容
        const todosContent = params.todos || '';
        const isEmptyTodos = todosContent.trim() === 'EMPTY';
        if (isEmptyTodos) {
          return `📝 **Todo Update**\n📋 Call ID: ${callId}\n🗑️ **Action**: Clear all todos`;
        } else {
          // 显示完整的todos内容，不截断
          return `📝 **Todo Update**\n📋 Call ID: ${callId}\n📋 **Todos**:\n${todosContent}`;
        }
        
      case 'AgentStopTool':
        // AgentStopTool：显示停止原因
        const reason = params.reason || 'No reason provided';
        return `🛑 **Agent Stop**\n📋 Call ID: ${callId}\n💬 **Reason**: ${reason}`;
        
      case 'BashCommand':
        // BashCommand工具：显示命令内容
        const command = params.command || 'Unknown command';
        return `🔧 **Bash Command**\n📋 Call ID: ${callId}\n💻 **Command**: ${command}`;
        
      default:
        // 默认格式：显示工具名和call_id
        return `🔧 **${toolName}**\n📋 Call ID: ${callId}`;
    }
  }

  /**
   * 格式化工具完成消息
   */
  private formatToolCompleted(result: any): string {
    const toolName = result.name;
    const success = result.result?.success;
    const message = result.result?.message || '';
    
    // 根据工具类型进行特殊格式化
    switch (toolName) {
      case 'ApplyWholeFileEdit':
      case 'ApplyEditBlock':
      case 'ApplyRangedEdit':
      case 'ApplyUnifiedDiff':
      case 'Delete':
      case 'ReverseDiff':
        // editing-strategy-tools: 显示 success, message, diff
        let content = `${success ? '✅' : '❌'} **${toolName}**\n📄 ${message}`;
        
        if (result.diff) {
          // 限制diff显示在100行以内
          const diffLines = result.diff.split('\n');
          const limitedDiff = diffLines.slice(0, 100).join('\n');
          const hasMore = diffLines.length > 100;
          
          content += `\n\n📋 **Diff:**\n\`\`\`diff\n${limitedDiff}`;
          if (hasMore) {
            content += `\n... (${diffLines.length - 100} more lines)`;
          }
          content += '\n```';
        }
        
        return content;
        
      case 'TodoUpdate':
        // TodoUpdate工具：显示完整的todos信息（markdown格式）
        let todoContent = `${success ? '✅' : '❌'} **Todo Updated**\n📄 ${message}`;
        
        // 显示完整的todos内容
        if (result.todos && result.todos.trim() !== '' && result.todos.trim() !== 'EMPTY') {
          todoContent += '\n\n📋 **Current Todos:**\n```markdown\n' + result.todos + '\n```';
        } else if (result.todos && result.todos.trim() === 'EMPTY') {
          todoContent += '\n\n📋 **Todos Status:** All todos cleared';
        }
        
        return todoContent;
        
      case 'AgentStopTool':
        // AgentStopTool：显示停止结果
        return `${success ? '✅' : '❌'} **Agent Stop Tool**\n📄 ${message}`;
        
      case 'BashCommand':
        // BashCommand工具：显示命令执行结果
        let bashContent = `${success ? '✅' : '❌'} **Bash Command**\n📄 ${message}`;
        
        // 如果有输出内容，显示前50行
        if (result.output && result.output.trim()) {
          const outputLines = result.output.split('\n');
          const limitedOutput = outputLines.slice(0, 50).join('\n');
          const hasMore = outputLines.length > 50;
          
          bashContent += `\n\n💻 **Output:**\n\`\`\`\n${limitedOutput}`;
          if (hasMore) {
            bashContent += `\n... (${outputLines.length - 50} more lines)`;
          }
          bashContent += '\n```';
        }
        
        return bashContent;
        
      default:
        // 默认格式
        return `${success ? '✅' : '❌'} **${toolName}**\n📄 ${message}`;
    }
  }

  /**
   * 格式化工具失败消息
   */
  private formatToolFailed(result: any): string {
    const toolName = result.name;
    const message = result.message || 'Unknown error';
    const callId = result.call_id;
    
    // 根据工具类型进行特殊格式化
    switch (toolName) {
      case 'ApplyWholeFileEdit':
      case 'ApplyEditBlock':
      case 'ApplyRangedEdit':
      case 'ApplyUnifiedDiff':
      case 'Delete':
      case 'ReverseDiff':
        // editing-strategy-tools: 显示失败信息和相关路径
        const path = result.path || 'N/A';
        return `❌ **${toolName} Failed**\n📋 Call ID: ${callId}\n📁 Path: ${path}\n💥 Error: ${message}`;

      case 'TodoUpdate':
        // TodoUpdate工具失败：显示失败原因
        return `❌ **Todo Update Failed**\n📋 Call ID: ${callId}\n💥 Error: ${message}`;
        
      case 'AgentStopTool':
        // AgentStopTool失败：显示失败原因
        return `❌ **Agent Stop Failed**\n📋 Call ID: ${callId}\n💥 Error: ${message}`;
        
      case 'BashCommand':
        // BashCommand工具失败：显示命令和错误信息
        return `❌ **Bash Command Failed**\n📋 Call ID: ${callId}\n💻 Command: ${result.command || 'Unknown'}\n💥 Error: ${message}`;
        
      default:
        // 默认格式
        return `❌ **${toolName} Failed**\n📋 Call ID: ${callId}\n💥 Error: ${message}`;
    }
  }

  /**
   * 处理工具执行开始事件
   */
  private handleToolExecutionStarted(event: ToolEvent): void {
    if (event.type === 'tool.execution.started' && event.data?.toolCall) {
      // 只在配置允许时显示工具开始消息
      if (this.config.eventDisplay?.tool?.showStarted) {
        const formattedContent = this.formatToolStart(event.data.toolCall);
        
        const message: ClientMessage = {
          id: `tool_start_${event.data.toolCall.call_id}`,
          content: formattedContent,
          type: 'tool.start',
          timestamp: Date.now(),
          metadata: { toolCall: event.data.toolCall, status: 'running' }
        };
        
        this.addMessage(message);
      }
    }
  }

  /**
   * 处理工具执行完成事件
   */
  private handleToolExecutionCompleted(event: ToolEvent): void {
    if (event.type === 'tool.execution.completed' && event.data?.result) {
      // 只在配置允许时显示工具完成消息
      if (this.config.eventDisplay?.tool?.showCompleted) {
        // 修复数据结构问题 - 检查result的结构
        const result = event.data.result;
        const formattedContent = this.formatToolCompleted(result);
        
        const message: ClientMessage = {
          id: `tool_end_${result.call_id || event.data.result.call_id}`,
          content: formattedContent,
          type: 'tool.completed',
          timestamp: Date.now(),
          metadata: { result: event.data.result, status: 'completed' }
        };
        
        this.addMessage(message);
      }
    }
  }

  /**
   * 处理工具执行失败事件
   */
  private handleToolExecutionFailed(event: ToolEvent): void {
    if (event.type === 'tool.execution.failed' && event.data?.result) {
      // 只在配置允许时显示工具失败消息
      if (this.config.eventDisplay?.tool?.showFailed) {
        // 修复数据结构问题 - 检查result的结构
        const result = event.data.result.result || event.data.result;
        const formattedContent = this.formatToolFailed(result);
        
        const message: ClientMessage = {
          id: `tool_failed_${result.call_id || event.data.result.call_id}`,
          content: formattedContent,
          type: 'tool.completed', // 使用 tool.completed 类型来表示失败
          timestamp: Date.now(),
          metadata: { result: event.data.result, status: 'failed' }
        };
        
        this.addMessage(message);
      }
    }
  }

  /**
   * 处理错误事件
   */
  private handleError(event: ErrorEvent): void {
    if (event.type === 'error.occurred') {
      // 只在配置允许时显示错误消息
      if (this.config.eventDisplay?.error?.showErrors) {
        const errorMessage = event.data.error instanceof Error 
          ? event.data.error.message 
          : String(event.data.error);
        
        // 根据配置决定是否显示堆栈跟踪
        const stackTrace = this.config.eventDisplay?.error?.showStackTrace && 
          event.data.error instanceof Error && 
          event.data.error.stack
            ? `\n\`\`\`\n${event.data.error.stack}\n\`\`\``
            : '';
        
        this.addMessage({
          id: `error_${Date.now()}`,
          content: `❌ Error: ${errorMessage}${stackTrace}`,
          type: 'error',
          timestamp: Date.now(),
          metadata: { context: event.data.context }
        });
      }
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