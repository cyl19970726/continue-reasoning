import { 
  ISessionManager, 
  ISessionManagerCallbacks,
  AgentStorage, 
  IAgent, 
  ToolExecutionResult, 
  AgentStep, 
  ToolCallParams 
} from '../interfaces';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_AGENT_STEPS = 1000;

/**
 * Minimal session manager - Only responsible for state storage, using callbacks for decoupling
 */
export class SessionManager implements ISessionManager {
  private sessions = new Map<string, AgentStorage>();
  private callbacks?: ISessionManagerCallbacks;
  
  agent: IAgent;

  constructor(agent: IAgent) {
    this.agent = agent;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: ISessionManagerCallbacks): void {
    this.callbacks = callbacks;
    this.setupAgentCallbacks();
  }

  /**
   * Setup Agent callbacks
   */
  private setupAgentCallbacks(): void {
    this.agent.setCallBacks({
      onToolExecutionEnd: (result: ToolExecutionResult) => {
        this.callbacks?.onToolExecutionEnd?.(result);
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
      onToolCallStart: (toolCall: ToolCallParams) => {
        this.callbacks?.onToolCallStart?.(toolCall);   
      },
    });
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
    
    // Trigger callback
    this.callbacks?.onSessionStart?.(sessionId);
    
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
      
      // Trigger callback
      this.callbacks?.onSessionEnd?.(sessionId);
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