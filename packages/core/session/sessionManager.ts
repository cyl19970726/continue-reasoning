import { 
  ISessionManager, 
  ISessionManagerCallbacks,
  AgentStorage, 
  ChatContext, 
  IAgent, 
  ToolCallResult, 
  ToolExecutionResult, 
  AgentStep, 
  ToolCallParams 
} from '../interfaces';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_AGENT_STEPS = 1000;

/**
 * 极简会话管理器 - 只负责状态存储，使用回调解耦
 */
export class SessionManager implements ISessionManager {
  private sessions = new Map<string, AgentStorage>();
  private callbacks?: ISessionManagerCallbacks;
  
  agent: IAgent;

  constructor(agent: IAgent) {
    this.agent = agent;
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: ISessionManagerCallbacks): void {
    this.callbacks = callbacks;
    this.setupAgentCallbacks();
  }

  /**
   * 设置Agent的回调
   */
  private setupAgentCallbacks(): void {
    this.agent.setCallBacks({
      onToolCallResult: (result: ToolExecutionResult) => {
        this.callbacks?.onToolCallResult?.(result);
      },
      loadAgentStorage: async (sessionId: string): Promise<AgentStorage | null> => {
        return await this.loadSession(sessionId);
      },
      onAgentStep: (step: AgentStep<any>) => {
        this.callbacks?.onAgentStep?.(step);
      },
      onStateStorage: (state: AgentStorage) => {
        this.saveSession(state.sessionId, state);
      },
      onToolCall: (toolCall: ToolCallParams) => {
        this.callbacks?.onToolCall?.(toolCall);   
      },
    });
  }

  /**
   * 发送消息给Agent
   */
  async sendMessageToAgent(message: string, maxSteps: number = DEFAULT_AGENT_STEPS, sessionId: string): Promise<string> {
    let session = await this.loadSession(sessionId);
    if (!session) {
      sessionId = this.createSession();
    }
    
    // 启动Agent处理
    await this.agent.startWithUserInput(message, maxSteps, sessionId);
    return sessionId;
  }

  /**
   * 创建新会话
   */
  createSession(userId?: string, agentId?: string): string {
    const sessionId = uuidv4();
    const initialState: AgentStorage = {
      sessionId,
      agentId: agentId || 'default-agent',
      userId,
      currentStep: 0,
      agentSteps: [],
      contexts: [],
      chatContext: {
        fullHistory: [],
        optimizedContext: [],
        historySummaries: [],
        totalMessages: 0,
        compressionRatio: 1.0,
        lastOptimizedAt: Date.now()
      },
      totalTokensUsed: 0,
      sessionStartTime: Date.now(),
      lastActiveTime: Date.now()
    };
    
    this.sessions.set(sessionId, initialState);
    logger.info(`SessionManager: Created session ${sessionId} for user ${userId || 'anonymous'}`);
    
    // 触发回调
    this.callbacks?.onSessionStart?.(sessionId);
    
    return sessionId;
  }

  /**
   * 加载会话状态
   */
  async loadSession(sessionId: string): Promise<AgentStorage | null> {
    const state = this.sessions.get(sessionId);
    if (state) {
      state.lastActiveTime = Date.now();
      logger.debug(`SessionManager: Loaded session ${sessionId}`);
    } else {
      logger.warn(`SessionManager: Session ${sessionId} not found`);
    }
    return state || null;
  }

  /**
   * 保存会话状态
   */
  async saveSession(sessionId: string, state: AgentStorage): Promise<void> {
    state.lastActiveTime = Date.now();
    this.sessions.set(sessionId, state);
    logger.debug(`SessionManager: Saved session ${sessionId}, step: ${state.currentStep}, agentSteps: ${state.agentSteps.length}, messages: ${state.chatContext?.totalMessages || 0}`);
  }

  /**
   * 归档会话（删除并可选持久化）
   */
  async archiveSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state) {
      // TODO: 持久化到数据库或文件
      this.sessions.delete(sessionId);
      logger.info(`SessionManager: Archived session ${sessionId} with ${state.agentSteps.length} steps`);
      
      // 触发回调
      this.callbacks?.onSessionEnd?.(sessionId);
    } else {
      logger.warn(`SessionManager: Cannot archive session ${sessionId} - not found`);
    }
  }

  /**
   * 获取活跃会话列表
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * 获取会话数量
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * 清理过期会话（可选功能）
   */
  cleanupExpiredSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [sessionId, state] of this.sessions.entries()) {
      if (now - state.lastActiveTime > maxAgeMs) {
        this.sessions.delete(sessionId);
        cleanedCount++;
        logger.info(`SessionManager: Cleaned up expired session ${sessionId}`);
      }
    }
    
    return cleanedCount;
  }

  /**
   * 获取会话统计信息
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    averageStepsPerSession: number;
    averageMessagesPerSession: number;
    averageAgentStepsPerSession: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const totalSessions = sessions.length;
    const activeSessions = sessions.filter(s => Date.now() - s.lastActiveTime < 60 * 60 * 1000).length;
    
    const totalSteps = sessions.reduce((sum, s) => sum + s.currentStep, 0);
    const totalMessages = sessions.reduce((sum, s) => sum + (s.chatContext?.totalMessages || 0), 0);
    const totalAgentSteps = sessions.reduce((sum, s) => sum + s.agentSteps.length, 0);
    
    return {
      totalSessions,
      activeSessions,
      averageStepsPerSession: totalSessions > 0 ? totalSteps / totalSessions : 0,
      averageMessagesPerSession: totalSessions > 0 ? totalMessages / totalSessions : 0,
      averageAgentStepsPerSession: totalSessions > 0 ? totalAgentSteps / totalSessions : 0
    };
  }

  /**
   * 获取特定会话的详细信息（调试用）
   */
  getSessionDetails(sessionId: string): {
    sessionId: string;
    agentId: string;
    userId?: string;
    currentStep: number;
    agentStepsCount: number;
    messagesCount: number;
    totalTokensUsed: number;
    sessionDuration: number;
    lastActiveTime: string;
  } | null {
    const state = this.sessions.get(sessionId);
    if (!state) {
      return null;
    }

    return {
      sessionId: state.sessionId,
      agentId: state.agentId,
      userId: state.userId,
      currentStep: state.currentStep,
      agentStepsCount: state.agentSteps.length,
      messagesCount: state.chatContext?.totalMessages || 0,
      totalTokensUsed: state.totalTokensUsed,
      sessionDuration: Date.now() - state.sessionStartTime,
      lastActiveTime: new Date(state.lastActiveTime).toISOString()
    };
  }

  /**
   * 更新会话的Token使用量
   */
  async updateTokenUsage(sessionId: string, additionalTokens: number): Promise<void> {
    const state = await this.loadSession(sessionId);
    if (state) {
      state.totalTokensUsed += additionalTokens;
      await this.saveSession(sessionId, state);
      logger.debug(`SessionManager: Updated token usage for session ${sessionId}: +${additionalTokens} (total: ${state.totalTokensUsed})`);
    }
  }

  /**
   * 获取所有会话的摘要信息
   */
  getAllSessionsSummary(): Array<{
    sessionId: string;
    agentId: string;
    userId?: string;
    currentStep: number;
    agentStepsCount: number;
    isActive: boolean;
    lastActiveTime: string;
  }> {
    const now = Date.now();
    const activeThreshold = 60 * 60 * 1000; // 1小时

    return Array.from(this.sessions.values()).map(state => ({
      sessionId: state.sessionId,
      agentId: state.agentId,
      userId: state.userId,
      currentStep: state.currentStep,
      agentStepsCount: state.agentSteps.length,
      isActive: (now - state.lastActiveTime) < activeThreshold,
      lastActiveTime: new Date(state.lastActiveTime).toISOString()
    }));
  }
} 