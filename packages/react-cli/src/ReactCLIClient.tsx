import React from 'react';
import { render, Instance } from 'ink';
import {
  IClient,
  ClientType,
  ClientStatus,
  ClientMessage,
  ISessionManager,
  AgentCallbacks,
  AgentStep,
  ToolCallParams,
  ToolExecutionResult,
} from '@continue-reasoning/core';
import { ReactCLIConfig, UIState, ImportedFile } from './interfaces/index.js';
import { ToolFormatterRegistry } from './formatters/index.js';
import { FileImporterRegistry } from './importers/index.js';
import App from './components/App.js';

/**
 * React CLI 客户端实现
 * 基于最新的 IClient 接口，使用 AgentCallbacks 处理事件
 */
export class ReactCLIClient implements IClient {
  // IClient 必需属性
  readonly name: string;
  readonly type: ClientType = 'react-terminal';
  currentSessionId?: string;
  sessionManager?: ISessionManager;
  agentCallbacks?: AgentCallbacks;

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
  }

  /**
   * 停止客户端
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    
    if (this.inkInstance) {
      this.inkInstance.unmount();
      this.inkInstance = undefined;
    }
  }

  /**
   * 设置会话管理器
   */
  setSessionManager(sessionManager: ISessionManager): void {
    this.sessionManager = sessionManager;
    // 注意：新架构中 SessionManager 通过构造函数接收 client，而不是 setClient 方法
  }

  /**
   * 设置 Agent 回调
   * 这是新架构的核心 - 通过 AgentCallbacks 处理所有事件
   */
  setAgentCallbacks(callbacks: AgentCallbacks): void {
    this.agentCallbacks = {
      ...callbacks,
      
      // UI 相关的回调覆盖
      onAgentStep: (step: AgentStep<any>) => {
        this.handleAgentStep(step);
        callbacks.onAgentStep?.(step);
      },
      
      onToolCallStart: (toolCall: ToolCallParams) => {
        this.handleToolCallStart(toolCall);
        callbacks.onToolCallStart?.(toolCall);
      },
      
      onToolExecutionEnd: (result: ToolExecutionResult) => {
        this.handleToolExecutionEnd(result);
        callbacks.onToolExecutionEnd?.(result);
      },
      
      // 流式模式回调
      onLLMTextDelta: this.isStreamingMode() ? (stepIndex: number, chunkIndex: number, delta: string) => {
        this.handleStreamDelta(delta);
        callbacks.onLLMTextDelta?.(stepIndex, chunkIndex, delta);
      } : undefined,
      
      // 会话回调
      onSessionStart: (sessionId: string) => {
        this.currentSessionId = sessionId;
        this.addMessage({
          id: `session_start_${Date.now()}`,
          content: `🚀 Session started: ${sessionId}`,
          type: 'system',
          timestamp: Date.now()
        });
        callbacks.onSessionStart?.(sessionId);
      },
      
      onSessionEnd: (sessionId: string) => {
        this.addMessage({
          id: `session_end_${Date.now()}`,
          content: `👋 Session ended: ${sessionId}`,
          type: 'system',
          timestamp: Date.now()
        });
        callbacks.onSessionEnd?.(sessionId);
      }
    };
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
   * 处理工具调用 - IClient 接口要求的方法
   */
  handleToolCall(toolCall: ToolCallParams): void {
    this.handleToolCallStart(toolCall);
  }

  /**
   * 处理工具调用结果 - IClient 接口要求的方法
   */
  handleToolCallResult(result: ToolExecutionResult): void {
    this.handleToolExecutionEnd(result);
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
   * 处理工具调用开始
   */
  private handleToolCallStart(toolCall: ToolCallParams): void {
    const message: ClientMessage = {
      id: `tool_start_${toolCall.call_id}`,
      content: `🔧 Calling tool: ${toolCall.name}`,
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
   * 处理流式文本增量
   */
  private handleStreamDelta(delta: string): void {
    // 在流式模式下，我们可以实时更新最后一条消息
    if (this.messages.length > 0) {
      const lastMessage = this.messages[this.messages.length - 1];
      if (lastMessage.type === 'agent' && lastMessage.metadata?.streaming) {
        lastMessage.content += delta;
        this.triggerUIUpdate();
        return;
      }
    }
    
    // 如果没有正在流式传输的消息，创建新的
    this.addMessage({
      id: `stream_${Date.now()}`,
      content: delta,
      type: 'agent',
      timestamp: Date.now(),
      metadata: { streaming: true }
    });
  }

  /**
   * 格式化 Agent 步骤
   */
  private formatAgentStep(step: AgentStep<any>): string {
    if (step.extractorResult?.response) {
      return step.extractorResult.response;
    }
    
    if (step.extractorResult?.thinking) {
      return `💭 Thinking: ${step.extractorResult.thinking}`;
    }
    
    return `Step ${step.stepIndex} completed`;
  }

  /**
   * 处理 UI 状态变化
   */
  private handleUIStateChange(state: Partial<UIState>): void {
    this.uiState = { ...this.uiState, ...state };
    this.onUIUpdate?.(this.uiState);
  }

  /**
   * 处理用户提交
   */
  private handleUserSubmit(message: string): void {
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
}