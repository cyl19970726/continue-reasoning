import { 
  InteractiveMessage, 
  MessageHandler, 
  InteractiveCapabilities,
  SubscriptionConfig 
} from './types';
import { IEventBus } from './eventBus';
// 🆕 导入新的简化版 InteractiveMemory
import { IInteractiveMemory, InteractiveMemory } from './interactiveMemory';

export interface IInteractiveLayer {
  id: string; // 🆕 添加 id 属性
  sendMessage(message: InteractiveMessage): Promise<void>;
  receiveMessage(): Promise<InteractiveMessage>;
  subscribe(eventType: string | string[], handler: MessageHandler, config?: SubscriptionConfig): string;
  unsubscribe(eventType: string | string[], handler: MessageHandler): void;
  getCapabilities(): InteractiveCapabilities;
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // 新增方法
  setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void>;
  getCurrentSession(): string;
  getActiveEvents(): InteractiveMessage[];
  clearEventHistory(): void;
  
  // 🆕 InteractiveMemory 集成
  getInteractiveMemory(): IInteractiveMemory;
  sendUserMessageWithHistory(content: string, messageType?: 'question' | 'command' | 'request' | 'feedback'): Promise<void>;
}

export interface InteractiveLayerConfig {
  name: string;
  capabilities: InteractiveCapabilities;
  eventBus: IEventBus;
  sessionTimeout?: number; // 会话超时时间(ms)
  messageQueueSize?: number; // 消息队列大小
  enablePersistence?: boolean; // 是否启用持久化
}

export abstract class BaseInteractiveLayer implements IInteractiveLayer {
  public abstract readonly id: string; // 🆕 抽象 id 属性
  protected config: InteractiveLayerConfig;
  protected currentSession: string;
  protected executionMode: 'auto' | 'manual' | 'supervised' = 'auto';
  protected isRunning: boolean = false;
  protected subscriptionIds: Map<string, string> = new Map();
  protected messageQueue: InteractiveMessage[] = [];
  protected messagePromiseResolvers: Array<(message: InteractiveMessage) => void> = [];

  // 🆕 轻量化的 InteractiveMemory（无 MapMemoryManager 依赖）
  protected interactiveMemory!: IInteractiveMemory;

  constructor(config: InteractiveLayerConfig) {
    this.config = config;
    // 使用已存在的 session 或创建新的，但优先使用已存在的
    const existingSessions = config.eventBus.getActiveSessions();
    this.currentSession = existingSessions.length > 0 ? existingSessions[0] : config.eventBus.createSession();
    
    // 🆕 简化的初始化
    this.initializeInteractiveMemory();
  }

  // 🆕 简化的 InteractiveMemory 初始化
  private initializeInteractiveMemory(): void {
    // 直接创建轻量化的内存存储，无需 MapMemoryManager
    this.interactiveMemory = new InteractiveMemory(
      `interactive-memory-${this.id}`,
      `Interactive Memory for ${this.id}`,
      this.config.eventBus
    );
  }

  abstract sendMessage(message: InteractiveMessage): Promise<void>;

  async receiveMessage(): Promise<InteractiveMessage> {
    // 如果队列中有消息，立即返回
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift()!;
    }

    // 否则等待新消息
    return new Promise<InteractiveMessage>((resolve) => {
      this.messagePromiseResolvers.push(resolve);
    });
  }

  subscribe(
    eventType: string | string[], 
    handler: MessageHandler, 
    config?: SubscriptionConfig
  ): string {
    const subscriptionId = this.config.eventBus.subscribe(eventType, async (message) => {
      // 添加到消息队列
      this.addToMessageQueue(message as InteractiveMessage);
      
      // 调用处理器
      await handler(message);
    }, config);

    // 存储订阅ID以便后续取消订阅
    const key = Array.isArray(eventType) ? eventType.join(',') : eventType;
    this.subscriptionIds.set(key, subscriptionId);
    
    return subscriptionId;
  }

  unsubscribe(eventType: string | string[], handler: MessageHandler): void {
    const key = Array.isArray(eventType) ? eventType.join(',') : eventType;
    const subscriptionId = this.subscriptionIds.get(key);
    
    if (subscriptionId) {
      this.config.eventBus.unsubscribe(subscriptionId);
      this.subscriptionIds.delete(key);
    }
  }

  getCapabilities(): InteractiveCapabilities {
    return { ...this.config.capabilities };
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    
    // 启动 InteractiveMemory
    await this.interactiveMemory.start();
    
    this.isRunning = true;
    await this.config.eventBus.start();
    await this.onStart();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    await this.onStop();
    
    // 停止 InteractiveMemory
    await this.interactiveMemory.stop();
    
    // 清理订阅
    for (const subscriptionId of this.subscriptionIds.values()) {
      this.config.eventBus.unsubscribe(subscriptionId);
    }
    this.subscriptionIds.clear();
    
    // 关闭会话
    this.config.eventBus.closeSession(this.currentSession);
  }

  // 🆕 获取 InteractiveMemory
  getInteractiveMemory(): IInteractiveMemory {
    return this.interactiveMemory;
  }

  // 🆕 发送包含历史的用户消息（简化版）
  async sendUserMessageWithHistory(content: string, messageType: 'question' | 'command' | 'request' | 'feedback' = 'request'): Promise<void> {
    // 获取最近的对话历史
    const recentHistory = await this.interactiveMemory.getConversationHistory(this.currentSession, 5);
    
    // 构建包含历史的消息
    const message: any = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      source: 'user',
      sessionId: this.currentSession,
      type: 'user_message',
      payload: {
        content,
        messageType,
        conversationHistory: recentHistory.map(record => ({
          id: record.id,
          role: record.role,
          content: record.content,
          timestamp: record.timestamp,
          metadata: record.metadata
        }))
      }
    };

    // 记录用户消息
    await this.interactiveMemory.recordConversation({
      sessionId: this.currentSession,
      userId: this.getUserId(),
      agentId: 'pending', // 将在 Agent 响应时更新
      type: 'user_message',
      role: 'user',
      content: content,
      metadata: { messageType }
    });

    // 发送消息
    await this.sendMessage(message);
  }

  async setExecutionMode(mode: 'auto' | 'manual' | 'supervised'): Promise<void> {
    const oldMode = this.executionMode;
    const requestId = `mode_change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 创建确认等待Promise
    const confirmationPromise = this.waitForModeChangeConfirmation(requestId, 5000);
    
    // 发布执行模式变更请求事件
    await this.config.eventBus.publish({
      type: 'execution_mode_change_request',
      source: 'user',
      sessionId: this.currentSession,
      payload: {
        requestId,
        fromMode: oldMode,
        toMode: mode,
        reason: 'User requested mode change'
      }
    });
    
    try {
      // 等待确认
      const confirmed = await confirmationPromise;
      if (confirmed) {
        this.executionMode = mode;
      } else {
        throw new Error('Mode change was not confirmed by agent');
      }
    } catch (error) {
      // 如果确认失败，回滚状态
      console.warn(`Mode change confirmation failed: ${error}`);
      throw error;
    }
  }

  private waitForModeChangeConfirmation(requestId: string, timeout: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      let resolved = false;
      
      // 设置超时
      const timeoutHandle = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.config.eventBus.unsubscribe(subscriptionId);
          reject(new Error(`Mode change confirmation timeout after ${timeout}ms`));
        }
      }, timeout);
      
      // 订阅响应事件
      const subscriptionId = this.config.eventBus.subscribe('execution_mode_change_response', async (event: any) => {
        if (resolved) return;
        
        // 检查是否是我们等待的确认
        if (event.payload?.requestId === requestId) {
          resolved = true;
          clearTimeout(timeoutHandle);
          this.config.eventBus.unsubscribe(subscriptionId);
          
          if (event.payload.success) {
            resolve(true);
          } else {
            reject(new Error(event.payload.error || 'Mode change failed'));
          }
        }
      });
    });
  }

  getCurrentSession(): string {
    return this.currentSession;
  }

  getActiveEvents(): InteractiveMessage[] {
    return this.config.eventBus.getEventHistory({
      sessionId: this.currentSession,
      afterTimestamp: Date.now() - 3600000 // 最近1小时
    }).map(entry => entry.event)
      .filter((event): event is InteractiveMessage => {
        // 过滤出只属于 InteractiveMessage 联合类型的事件
        const interactiveEventTypes = [
          'execution_mode_change_request',
          'execution_mode_change_response',
          'approval_request',
          'approval_response', 
          'collaboration_request',
          'collaboration_response',
          'input_request',
          'input_response',
          'user_message',
          'status_update',
          'file_operation',
          'command_execution',
          'error',
          'data_collection',
          'task_event',
          'context_switch',
          'tool_call',
          'self_test'
        ];
        return interactiveEventTypes.includes(event.type);
      });
  }

  clearEventHistory(): void {
    this.config.eventBus.clearEventHistory({
      sessionId: this.currentSession
    });
    this.messageQueue = [];
  }

  // 受保护的方法供子类重写
  protected async onStart(): Promise<void> {
    // 子类可以重写此方法进行初始化
  }

  protected async onStop(): Promise<void> {
    // 子类可以重写此方法进行清理
  }

  protected addToMessageQueue(message: InteractiveMessage): void {
    // 检查消息队列大小限制
    const maxSize = this.config.messageQueueSize || 1000;
    if (this.messageQueue.length >= maxSize) {
      this.messageQueue.shift(); // 移除最老的消息
    }
    
    this.messageQueue.push(message);
    
    // 如果有等待的Promise，立即解决它
    if (this.messagePromiseResolvers.length > 0) {
      const resolver = this.messagePromiseResolvers.shift()!;
      resolver(message);
    }
  }

  // 🆕 自动记录对话的 sendMessage 实现
  protected async sendMessageWithAutoRecord(message: InteractiveMessage): Promise<void> {
    // 对于 agent_reply，记录到 InteractiveMemory
    if (message.type === 'agent_reply') {
      await this.interactiveMemory.recordConversation({
        sessionId: message.sessionId,
        userId: this.getUserId(),
        agentId: this.extractAgentId(message),
        type: 'agent_reply',
        role: 'agent',
        content: this.extractContent(message),
        metadata: {
          originalMessage: message
        }
      });
    }

    // 继续原有的发送逻辑
    const { id, timestamp, ...eventWithoutIdAndTimestamp } = message;
    await this.config.eventBus.publish(eventWithoutIdAndTimestamp);
    this.displayMessage(message);
  }

  // 抽象方法，需要子类实现
  protected abstract getUserId(): string | undefined;
  protected abstract extractAgentId(message: InteractiveMessage): string;
  protected abstract extractContent(message: InteractiveMessage): string;
  protected abstract displayMessage(message: InteractiveMessage): void;

  // 工具方法
  protected async publishEvent(
    eventType: InteractiveMessage['type'],
    payload: any,
    source: 'user' | 'agent' | 'system' = 'system'
  ): Promise<void> {
    await this.config.eventBus.publish({
      type: eventType,
      source,
      sessionId: this.currentSession,
      payload
    } as any);
  }

  protected isEventSupported(eventType: string): boolean {
    return this.config.capabilities.supportedEventTypes.includes(eventType);
  }
} 