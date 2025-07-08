import { 
  ISessionManager, 
  AgentStorage, 
  IAgent, 
  ToolExecutionResult, 
  AgentStep, 
  ToolCallParams,
  AgentCallbacks 
} from '../interfaces/index.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_AGENT_STEPS = 1000;

/**
 * Session manager - Responsible for session state management and callback coordination
 */
export class SessionManager implements ISessionManager {
  private sessions = new Map<string, AgentStorage>();
  private client?: any; // IClient 实例，可选
  
  agent: IAgent;

  constructor(agent: IAgent, client?: any) {
    this.agent = agent;
    this.client = client;
    if (client) {
      this.setupAgentCallbacks();
    }
  }

  /**
   * Set client (for connecting client handlers)
   */
  setClient(client: any): void {
    this.client = client;
    this.setupAgentCallbacks();
  }

  /**
   * Setup Agent callbacks - 职责分离：SessionManager 处理会话相关，Client 处理 UI 相关
   */
  private setupAgentCallbacks(): void {
    // 获取 client 的 agentCallbacks
    const clientCallbacks = this.client?.agentCallbacks;
    
    // 检查 client 是否支持流式模式
    const isStreamingMode = this.client?.isStreamingMode?.() ?? false;
    
    // SessionManager 专门处理会话相关的回调
    const sessionSpecificCallbacks: AgentCallbacks = {
      // 会话状态管理 - SessionManager 的核心职责
      onStateStorage: (state: AgentStorage) => {
        this.saveSession(state.sessionId, state);
        // 也通知 client，让它知道状态已更新
        clientCallbacks?.onStateStorage?.(state);
      },
      
      loadAgentStorage: async (sessionId: string): Promise<AgentStorage | null> => {
        // 优先使用 client 的自定义存储逻辑
        if (clientCallbacks?.loadAgentStorage) {
          const clientResult = await clientCallbacks.loadAgentStorage(sessionId);
          if (clientResult) {
            return clientResult;
          }
        }
        // 回退到 SessionManager 的本地存储
        return await this.loadSession(sessionId);
      },
      
      // 会话生命周期管理
      onSessionStart: (sessionId: string) => {
        // SessionManager 的会话开始处理
        logger.debug(`SessionManager: Session ${sessionId} started`);
        // 通知 client
        clientCallbacks?.onSessionStart?.(sessionId);
      },
      
      onSessionEnd: (sessionId: string) => {
        // SessionManager 的会话结束处理
        logger.debug(`SessionManager: Session ${sessionId} ended`);
        // 通知 client
        clientCallbacks?.onSessionEnd?.(sessionId);
      }
    };
    
    // 合并 SessionManager 的会话回调和 Client 的 UI 回调
    const mergedCallbacks: AgentCallbacks = {
      ...clientCallbacks,  // Client 的 UI 回调优先
      ...sessionSpecificCallbacks  // SessionManager 的会话回调覆盖
    };
    
    // 🆕 流式模式检查：过滤掉非流式模式下不应启用的回调
    if (!isStreamingMode) {
      // 移除流式模式专用的回调
      delete mergedCallbacks.onLLMTextDelta;
      delete mergedCallbacks.onToolCallStart;
      
      logger.debug('SessionManager: Non-streaming mode - filtered out streaming-only callbacks');
    } else {
      logger.debug('SessionManager: Streaming mode - all callbacks enabled');
    }
    
    // 将合并后的回调传递给 Agent
    this.agent.setCallBacks(mergedCallbacks);
  }

  /**
   * Send message to Agent
   */
  async sendMessageToAgent(message: string, maxSteps: number = DEFAULT_AGENT_STEPS, sessionId: string): Promise<string> {
    let session = await this.loadSession(sessionId);
    if (!session) {
      sessionId = this.createSession();
    }
    
    // Start Agent processing
    await this.agent.startWithUserInput(message, maxSteps, sessionId);
    return sessionId;
  }

  /**
   * Create new session
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
      totalTokensUsed: 0,
      sessionStartTime: Date.now(),
      lastActiveTime: Date.now()
    };
    
    this.sessions.set(sessionId, initialState);
    logger.info(`SessionManager: Created session ${sessionId} for user ${userId || 'anonymous'}`);
    
    return sessionId;
  }

  /**
   * Load session state
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
   * Save session state
   */
  async saveSession(sessionId: string, state: AgentStorage): Promise<void> {
    state.lastActiveTime = Date.now();
    this.sessions.set(sessionId, state);
    logger.debug(`SessionManager: Saved session ${sessionId}, step: ${state.currentStep}, agentSteps: ${state.agentSteps.length}`);
  }

  /**
   * Archive session (delete and optionally persist)
   */
  async archiveSession(sessionId: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state) {
      // TODO: Persist to database or file
      this.sessions.delete(sessionId);
      logger.info(`SessionManager: Archived session ${sessionId} with ${state.agentSteps.length} steps`);
    } else {
      logger.warn(`SessionManager: Cannot archive session ${sessionId} - not found`);
    }
  }

  /**
   * Get active sessions list
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Clean up expired sessions (optional feature)
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
   * Get session statistics
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
    const totalAgentSteps = sessions.reduce((sum, s) => sum + s.agentSteps.length, 0);
    
    return {
      totalSessions,
      activeSessions,
      averageStepsPerSession: totalSessions > 0 ? totalSteps / totalSessions : 0,
      averageMessagesPerSession: 0, // Not available in current AgentStorage
      averageAgentStepsPerSession: totalSessions > 0 ? totalAgentSteps / totalSessions : 0
    };
  }

  /**
   * Get specific session details (for debugging)
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
      messagesCount: 0, // Not available in current AgentStorage
      totalTokensUsed: state.totalTokensUsed,
      sessionDuration: Date.now() - state.sessionStartTime,
      lastActiveTime: new Date(state.lastActiveTime).toISOString()
    };
  }

  /**
   * Update session token usage
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
   * Get summary information for all sessions
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
    const activeThreshold = 60 * 60 * 1000; // 1 hour

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