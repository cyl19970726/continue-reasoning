import { randomUUID } from 'crypto';
import { logger } from '../utils/logger';
import { IEventBus } from './eventBus';

// 对话记录数据结构（简化版）
export interface ConversationRecord {
  id: string;
  sessionId: string;
  userId?: string;
  agentId: string;
  timestamp: number;
  type: 'user_message' | 'agent_reply' | 'system_notification' | 'tool_execution';
  role: 'user' | 'agent' | 'system';
  content: string;
  metadata?: Record<string, any>;
}

// 会话摘要数据结构（简化版）
export interface SessionSummary {
  sessionId: string;
  userId?: string;
  agentId: string;
  startTime: number;
  endTime?: number;
  messageCount: number;
  summary: string;
  topics: string[];
  outcomes: string[];
}

// InteractiveMemory 接口（简化版）
export interface IInteractiveMemory {
  // 基础属性
  id: string;
  name: string;
  
  // 核心功能
  recordConversation(record: Omit<ConversationRecord, 'id' | 'timestamp'>): Promise<string>;
  getConversationHistory(sessionId: string, limit?: number): Promise<ConversationRecord[]>;
  searchConversations(query: string, options?: ConversationSearchOptions): Promise<ConversationRecord[]>;
  
  // 会话管理
  createSession(userId?: string, agentId?: string): Promise<string>;
  getSessionSummary(sessionId: string): Promise<SessionSummary | null>;
  generateSessionSummary(sessionId: string): Promise<SessionSummary>;
  archiveSession(sessionId: string): Promise<void>;
  
  // 统计和分析
  getUserConversationStats(userId: string): Promise<UserConversationStats>;
  getAgentConversationStats(agentId: string): Promise<AgentConversationStats>;
  
  // 生命周期
  start(): Promise<void>;
  stop(): Promise<void>;
  
  // 事件订阅
  startEventListening(): void;
  stopEventListening(): void;
}

export interface ConversationSearchOptions {
  sessionId?: string;
  userId?: string;
  agentId?: string;
  type?: ConversationRecord['type'];
  role?: ConversationRecord['role'];
  startTime?: number;
  endTime?: number;
  limit?: number;
  includeMetadata?: boolean;
  sortBy?: 'timestamp' | 'importance';
  sortOrder?: 'asc' | 'desc';
}

export interface UserConversationStats {
  userId: string;
  totalSessions: number;
  totalMessages: number;
  averageSessionLength: number;
  mostActiveAgent: string;
  commonTopics: string[];
  lastActiveTime: number;
}

export interface AgentConversationStats {
  agentId: string;
  totalSessions: number;
  totalMessages: number;
  averageResponseTime: number;
  mostActiveUser: string;
  commonQueries: string[];
  successRate: number;
}

// 简化的 InteractiveMemory 实现类
export class InteractiveMemory implements IInteractiveMemory {
  public readonly id: string;
  public readonly name: string;
  
  private eventBus: IEventBus;
  private isRunning = false;
  private subscriptionIds: string[] = [];
  
  // 内存存储
  private conversations: Map<string, ConversationRecord[]> = new Map(); // sessionId -> conversations
  private sessionSummaries: Map<string, SessionSummary> = new Map();
  private allConversations: ConversationRecord[] = []; // 全局记录用于搜索
  
  // 配置选项
  private maxConversationsPerSession = 1000;
  private maxTotalConversations = 10000;
  
  constructor(
    id: string,
    name: string,
    eventBus: IEventBus,
    options?: {
      maxConversationsPerSession?: number;
      maxTotalConversations?: number;
    }
  ) {
    this.id = id;
    this.name = name;
    this.eventBus = eventBus;
    
    if (options?.maxConversationsPerSession) {
      this.maxConversationsPerSession = options.maxConversationsPerSession;
    }
    if (options?.maxTotalConversations) {
      this.maxTotalConversations = options.maxTotalConversations;
    }
    
    logger.info(`InteractiveMemory initialized: ${id}`);
  }
  
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    // 启动事件监听
    this.startEventListening();
    
    this.isRunning = true;
    logger.info(`InteractiveMemory started: ${this.id}`);
  }
  
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.stopEventListening();
    
    this.isRunning = false;
    logger.info(`InteractiveMemory stopped: ${this.id}`);
  }
  
  async recordConversation(record: Omit<ConversationRecord, 'id' | 'timestamp'>): Promise<string> {
    const fullRecord: ConversationRecord = {
      ...record,
      id: randomUUID(),
      timestamp: Date.now()
    };
    
    // 保存到会话记录
    const sessionConversations = this.conversations.get(record.sessionId) || [];
    sessionConversations.push(fullRecord);
    
    // 限制每个会话的记录数量
    if (sessionConversations.length > this.maxConversationsPerSession) {
      sessionConversations.shift(); // 移除最老的记录
    }
    
    this.conversations.set(record.sessionId, sessionConversations);
    
    // 保存到全局记录
    this.allConversations.push(fullRecord);
    
    // 限制全局记录数量
    if (this.allConversations.length > this.maxTotalConversations) {
      this.allConversations.shift(); // 移除最老的记录
    }
    
    logger.debug(`Conversation recorded: ${fullRecord.id} in session ${record.sessionId}`);
    return fullRecord.id;
  }
  
  async getConversationHistory(sessionId: string, limit = 100): Promise<ConversationRecord[]> {
    const sessionConversations = this.conversations.get(sessionId) || [];
    return sessionConversations
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-limit);
  }
  
  async searchConversations(query: string, options: ConversationSearchOptions = {}): Promise<ConversationRecord[]> {
    let filteredRecords = this.allConversations.filter(record => {
      if (options.sessionId && record.sessionId !== options.sessionId) return false;
      if (options.userId && record.userId !== options.userId) return false;
      if (options.agentId && record.agentId !== options.agentId) return false;
      if (options.type && record.type !== options.type) return false;
      if (options.role && record.role !== options.role) return false;
      if (options.startTime && record.timestamp < options.startTime) return false;
      if (options.endTime && record.timestamp > options.endTime) return false;
      
      return true;
    });
    
    // 文本搜索
    if (query) {
      const lowerQuery = query.toLowerCase();
      filteredRecords = filteredRecords.filter(record => {
        const searchText = `${record.content}`.toLowerCase();
        return searchText.includes(lowerQuery);
      });
    }
    
    // 排序
    const sortBy = options.sortBy || 'timestamp';
    const sortOrder = options.sortOrder || 'desc';
    
    filteredRecords.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'timestamp') {
        comparison = a.timestamp - b.timestamp;
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
    
    // 限制结果数量
    const limit = options.limit || 50;
    return filteredRecords.slice(0, limit);
  }
  
  async createSession(userId?: string, agentId?: string): Promise<string> {
    const sessionId = randomUUID();
    
    // 记录会话开始
    await this.recordConversation({
      sessionId,
      userId,
      agentId: agentId || 'unknown',
      type: 'system_notification',
      role: 'system',
      content: 'Session started'
    });
    
    logger.info(`New session created: ${sessionId}`);
    return sessionId;
  }
  
  async getSessionSummary(sessionId: string): Promise<SessionSummary | null> {
    return this.sessionSummaries.get(sessionId) || null;
  }
  
  async generateSessionSummary(sessionId: string): Promise<SessionSummary> {
    const conversations = await this.getConversationHistory(sessionId);
    
    if (conversations.length === 0) {
      throw new Error(`No conversations found for session ${sessionId}`);
    }
    
    const firstMessage = conversations[0];
    const lastMessage = conversations[conversations.length - 1];
    
    // 提取主题（简化实现）
    const topics = this.extractTopics(conversations);
    
    // 生成摘要（简化实现）
    const summary = this.generateSummaryText(conversations);
    
    const sessionSummary: SessionSummary = {
      sessionId,
      userId: firstMessage.userId,
      agentId: firstMessage.agentId,
      startTime: firstMessage.timestamp,
      endTime: lastMessage.timestamp,
      messageCount: conversations.length,
      summary,
      topics,
      outcomes: [] // 可以进一步分析得出
    };
    
    this.sessionSummaries.set(sessionId, sessionSummary);
    
    logger.info(`Session summary generated for ${sessionId}`);
    return sessionSummary;
  }
  
  async archiveSession(sessionId: string): Promise<void> {
    // 生成摘要
    await this.generateSessionSummary(sessionId);
    
    // 这里可以实现将会话数据保存到持久化存储的逻辑
    // 比如保存到文件、数据库等
    
    logger.info(`Session archived: ${sessionId}`);
  }
  
  async getUserConversationStats(userId: string): Promise<UserConversationStats> {
    const userRecords = this.allConversations.filter(record => record.userId === userId);
    
    const sessions = new Set(userRecords.map(r => r.sessionId));
    const agentCounts = new Map<string, number>();
    
    userRecords.forEach(record => {
      const count = agentCounts.get(record.agentId) || 0;
      agentCounts.set(record.agentId, count + 1);
    });
    
    const mostActiveAgent = Array.from(agentCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    
    const lastActiveTime = Math.max(...userRecords.map(r => r.timestamp));
    
    return {
      userId,
      totalSessions: sessions.size,
      totalMessages: userRecords.length,
      averageSessionLength: userRecords.length / sessions.size,
      mostActiveAgent,
      commonTopics: [], // 需要更复杂的分析
      lastActiveTime
    };
  }
  
  async getAgentConversationStats(agentId: string): Promise<AgentConversationStats> {
    const agentRecords = this.allConversations.filter(record => record.agentId === agentId);
    
    const sessions = new Set(agentRecords.map(r => r.sessionId));
    const userCounts = new Map<string, number>();
    
    agentRecords.forEach(record => {
      if (record.userId) {
        const count = userCounts.get(record.userId) || 0;
        userCounts.set(record.userId, count + 1);
      }
    });
    
    const mostActiveUser = Array.from(userCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    
    return {
      agentId,
      totalSessions: sessions.size,
      totalMessages: agentRecords.length,
      averageResponseTime: 0, // 需要分析响应时间
      mostActiveUser,
      commonQueries: [], // 需要更复杂的分析
      successRate: 0.95 // 需要分析成功率
    };
  }
  
  startEventListening(): void {
    if (!this.eventBus) return;
    
    // 监听用户消息
    const userMessageSub = this.eventBus.subscribe('user_message', async (event: any) => {
      await this.handleUserMessage(event);
    });
    
    // 监听Agent回复
    const agentReplySub = this.eventBus.subscribe('agent_reply', async (event: any) => {
      await this.handleAgentReply(event);
    });
    
    // 监听工具执行
    const toolCallSub = this.eventBus.subscribe('tool_call', async (event: any) => {
      await this.handleToolCall(event);
    });
    
    this.subscriptionIds.push(userMessageSub, agentReplySub, toolCallSub);
    
    logger.debug('InteractiveMemory event listening started');
  }
  
  stopEventListening(): void {
    this.subscriptionIds.forEach(id => {
      this.eventBus?.unsubscribe(id);
    });
    this.subscriptionIds = [];
    
    logger.debug('InteractiveMemory event listening stopped');
  }
  
  // 私有辅助方法
  private extractTopics(conversations: ConversationRecord[]): string[] {
    // 简化的主题提取
    const topics = new Set<string>();
    
    conversations.forEach(conv => {
      // 简单的关键词提取逻辑
      const words = conv.content.toLowerCase().split(/\s+/);
      words.forEach(word => {
        if (word.length > 4 && !['that', 'this', 'with', 'from', 'they', 'have', 'been', 'were'].includes(word)) {
          topics.add(word);
        }
      });
    });
    
    return Array.from(topics).slice(0, 10); // 返回最多10个主题
  }
  
  private generateSummaryText(conversations: ConversationRecord[]): string {
    // 简化的摘要生成
    const userMessages = conversations.filter(c => c.role === 'user').length;
    const agentMessages = conversations.filter(c => c.role === 'agent').length;
    
    return `Session with ${userMessages} user messages and ${agentMessages} agent responses. ` +
           `Started at ${new Date(conversations[0].timestamp).toISOString()}.`;
  }
  
  // 事件处理方法
  private async handleUserMessage(event: any): Promise<void> {
    try {
      await this.recordConversation({
        sessionId: event.sessionId,
        userId: event.payload?.userId,
        agentId: 'unknown', // 需要从上下文获取
        type: 'user_message',
        role: 'user',
        content: event.payload?.content || event.payload?.message || 'Unknown user message',
        metadata: {
          originalEvent: event.type,
          timestamp: event.timestamp
        }
      });
    } catch (error) {
      logger.error('Failed to handle user message:', error);
    }
  }
  
  private async handleAgentReply(event: any): Promise<void> {
    try {
      await this.recordConversation({
        sessionId: event.sessionId,
        userId: event.payload?.userId,
        agentId: event.payload?.agentId || 'unknown',
        type: 'agent_reply',
        role: 'agent',
        content: event.payload?.content || event.payload?.message || 'Unknown agent reply',
        metadata: {
          originalEvent: event.type,
          timestamp: event.timestamp
        }
      });
    } catch (error) {
      logger.error('Failed to handle agent reply:', error);
    }
  }
  
  private async handleToolCall(event: any): Promise<void> {
    try {
      await this.recordConversation({
        sessionId: event.sessionId,
        userId: event.payload?.userId,
        agentId: event.payload?.agentId || 'unknown',
        type: 'tool_execution',
        role: 'system',
        content: `Tool executed: ${event.payload?.toolName || 'unknown'}`,
        metadata: {
          originalEvent: event.type,
          toolName: event.payload?.toolName,
          parameters: event.payload?.parameters,
          timestamp: event.timestamp
        }
      });
    } catch (error) {
      logger.error('Failed to handle tool call:', error);
    }
  }

  // 🆕 持久化功能（可选实现）
  async saveToPersistentStorage(filePath?: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const saveData = {
        conversations: Object.fromEntries(this.conversations),
        sessionSummaries: Object.fromEntries(this.sessionSummaries),
        allConversations: this.allConversations,
        metadata: {
          id: this.id,
          name: this.name,
          savedAt: new Date().toISOString()
        }
      };
      
      const targetPath = filePath || `./interactive-memory-${this.id}.json`;
      await fs.writeFile(targetPath, JSON.stringify(saveData, null, 2));
      
      logger.info(`InteractiveMemory saved to: ${targetPath}`);
    } catch (error) {
      logger.error('Failed to save to persistent storage:', error);
      throw error;
    }
  }

  // 🆕 从持久化存储加载
  async loadFromPersistentStorage(filePath?: string): Promise<void> {
    try {
      const fs = await import('fs/promises');
      
      const targetPath = filePath || `./interactive-memory-${this.id}.json`;
      const data = await fs.readFile(targetPath, 'utf-8');
      const saveData = JSON.parse(data);
      
      this.conversations = new Map(Object.entries(saveData.conversations));
      this.sessionSummaries = new Map(Object.entries(saveData.sessionSummaries));
      this.allConversations = saveData.allConversations || [];
      
      logger.info(`InteractiveMemory loaded from: ${targetPath}`);
    } catch (error) {
      logger.warn('Failed to load from persistent storage, starting fresh:', error);
    }
  }

  // 🆕 获取内存使用统计
  getMemoryStats(): {
    totalConversations: number;
    totalSessions: number;
    averageConversationsPerSession: number;
    memoryUsage: {
      conversations: number;
      sessionSummaries: number;
      allConversations: number;
    };
  } {
    const totalConversations = this.allConversations.length;
    const totalSessions = this.conversations.size;
    const averageConversationsPerSession = totalSessions > 0 ? totalConversations / totalSessions : 0;
    
    return {
      totalConversations,
      totalSessions,
      averageConversationsPerSession,
      memoryUsage: {
        conversations: this.conversations.size,
        sessionSummaries: this.sessionSummaries.size,
        allConversations: this.allConversations.length
      }
    };
  }
} 