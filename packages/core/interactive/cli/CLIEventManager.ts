/**
 * 🎯 CLI 事件管理器 - 负责事件订阅、处理和分发
 */
import { 
  AgentInternalEvent, 
  AgentStepEvent, 
  AgentThinkingEvent, 
  AgentReplyEvent,
  ToolExecutionResultEvent,
  AgentStateChangeEvent,
  PlanCreatedEvent,
  PlanStepStartedEvent,
  PlanStepCompletedEvent,
  PlanProgressUpdateEvent,
  PlanCompletedEvent,
  PlanErrorEvent,
  FileCreatedEvent,
  FileModifiedEvent,
  FileDeletedEvent,
  DirectoryCreatedEvent,
  DiffReversedEvent
} from '../../events/agentEvents';
import {
  InteractiveMessage,
  ApprovalRequestEvent,
  InputRequestEvent,
  StatusUpdateEvent,
  ErrorEvent
} from '../../events/types';
import { CLIRenderer } from './CLIRenderer';
import { logger } from '../../utils/logger';

export interface EventHandlerConfig {
  enableThinking?: boolean;
  enableStepTracking?: boolean;
  enableFileTracking?: boolean;
  enablePlanTracking?: boolean;
  enablePerformanceTracking?: boolean;
  compactMode?: boolean;
}

export class CLIEventManager {
  private config: Required<EventHandlerConfig>;
  private renderer: CLIRenderer;
  private subscriptionIds: string[] = [];
  
  // 状态跟踪
  private currentStep: number = 0;
  private currentPlan: any = {};
  private trackedFiles = new Set<string>();
  private fileChanges: Array<{
    type: 'created' | 'modified' | 'deleted';
    path: string;
    timestamp: number;
    diff?: string;
  }> = [];
  
  // 性能统计
  private performanceStats = {
    totalSteps: 0,
    averageStepDuration: 0,
    totalToolCalls: 0,
    toolCallStats: new Map<string, { 
      count: number; 
      totalTime: number; 
      successRate: number 
    }>(),
    planHistory: [] as any[]
  };

  constructor(renderer: CLIRenderer, config: EventHandlerConfig = {}) {
    this.renderer = renderer;
    this.config = {
      enableThinking: true,
      enableStepTracking: true,
      enableFileTracking: true,
      enablePlanTracking: true,
      enablePerformanceTracking: true,
      compactMode: false,
      ...config
    };
  }

  // 订阅事件
  subscribeToEvents(subscribeFunction: (eventType: string, handler: (event: any) => Promise<void>) => string): void {
    // Agent 核心事件
    if (this.config.enableThinking) {
      this.subscriptionIds.push(
        subscribeFunction('agent_thinking', this.handleThinkingEvent.bind(this))
      );
    }
    
    this.subscriptionIds.push(
      subscribeFunction('agent_reply', this.handleReplyEvent.bind(this))
    );
    
    if (this.config.enableStepTracking) {
      this.subscriptionIds.push(
        subscribeFunction('agent_step', this.handleStepEvent.bind(this)),
        subscribeFunction('agent_step_start', this.handleStepStartEvent.bind(this))
      );
    }
    
    this.subscriptionIds.push(
      subscribeFunction('agent_state_change', this.handleStateChangeEvent.bind(this))
    );
    
    if (this.config.enablePerformanceTracking) {
      this.subscriptionIds.push(
        subscribeFunction('tool_execution_result', this.handleToolExecutionEvent.bind(this))
      );
    }
    
    // Plan 相关事件
    if (this.config.enablePlanTracking) {
      this.subscriptionIds.push(
        subscribeFunction('plan_created', this.handlePlanCreatedEvent.bind(this)),
        subscribeFunction('plan_step_started', this.handlePlanStepStartedEvent.bind(this)),
        subscribeFunction('plan_step_completed', this.handlePlanStepCompletedEvent.bind(this)),
        subscribeFunction('plan_progress_update', this.handlePlanProgressEvent.bind(this)),
        subscribeFunction('plan_completed', this.handlePlanCompletedEvent.bind(this)),
        subscribeFunction('plan_error', this.handlePlanErrorEvent.bind(this))
      );
    }
    
    // 文件操作事件
    if (this.config.enableFileTracking) {
      this.subscriptionIds.push(
        subscribeFunction('file_created', this.handleFileCreatedEvent.bind(this)),
        subscribeFunction('file_modified', this.handleFileModifiedEvent.bind(this)),
        subscribeFunction('file_deleted', this.handleFileDeletedEvent.bind(this)),
        subscribeFunction('directory_created', this.handleDirectoryCreatedEvent.bind(this)),
        subscribeFunction('diff_reversed', this.handleDiffReversedEvent.bind(this))
      );
    }
    
    // 交互事件
    this.subscriptionIds.push(
      subscribeFunction('input_request', this.handleInputRequestEvent.bind(this)),
      subscribeFunction('approval_request', this.handleApprovalRequestEvent.bind(this)),
      subscribeFunction('status_update', this.handleStatusUpdateEvent.bind(this)),
      subscribeFunction('error', this.handleErrorEvent.bind(this))
    );
  }

  // 取消所有订阅
  unsubscribeAll(unsubscribeFunction: (subscriptionId: string) => void): void {
    this.subscriptionIds.forEach(id => unsubscribeFunction(id));
    this.subscriptionIds = [];
  }

  // 获取当前状态
  getCurrentState(): {
    currentStep: number;
    currentPlan: any;
    trackedFiles: Set<string>;
    fileChanges: any[];
    performanceStats: any;
  } {
    return {
      currentStep: this.currentStep,
      currentPlan: this.currentPlan,
      trackedFiles: this.trackedFiles,
      fileChanges: this.fileChanges,
      performanceStats: this.performanceStats
    };
  }

  // 事件处理方法
  private async handleThinkingEvent(event: AgentThinkingEvent): Promise<void> {
    const thinking = event.payload.thinking;
    const thinkingText = thinking.reasoning || thinking.analysis || thinking.plan || '';
    
    if (thinkingText) {
      this.renderer.renderThinking(thinkingText, this.config.compactMode);
    }
  }

  private async handleReplyEvent(event: AgentReplyEvent): Promise<void> {
    const { content, replyType, metadata } = event.payload;
    this.renderer.renderAgentReply(content, replyType, metadata);
  }

  private async handleStepEvent(event: AgentStepEvent): Promise<void> {
    const { stepIndex, action } = event.payload;
    
    if (action === 'start') {
      this.currentStep = stepIndex;
      this.performanceStats.totalSteps++;
    }
    
    this.renderer.renderStepStatus(stepIndex, action);
  }

  private async handleStepStartEvent(event: any): Promise<void> {
    this.currentStep = event.payload.stepIndex;
  }

  private async handleStateChangeEvent(event: AgentStateChangeEvent): Promise<void> {
    const { fromState, toState, reason } = event.payload;
    
    if (!this.config.compactMode) {
      const stateIcon = toState === 'running' ? '🏃' : 
                       toState === 'idle' ? '💤' : 
                       toState === 'error' ? '❌' : '⏹️';
      
      this.renderer.renderInfo(`${stateIcon} Agent state: ${fromState} → ${toState}`);
      if (reason) {
        this.renderer.renderInfo(`  Reason: ${reason}`);
      }
    }
  }

  private async handleToolExecutionEvent(event: ToolExecutionResultEvent): Promise<void> {
    const { toolName, success, executionTime } = event.payload;
    
    // 更新统计
    this.updateToolStats(toolName, success, executionTime);
    
    this.renderer.renderToolExecution(toolName, success, executionTime);
  }

  // Plan 事件处理
  private async handlePlanCreatedEvent(event: PlanCreatedEvent): Promise<void> {
    this.currentPlan = {
      id: event.payload.planId,
      title: event.payload.title,
      totalSteps: event.payload.totalSteps,
      currentStepIndex: 0,
      steps: event.payload.steps.map(step => ({
        id: step.id,
        title: step.title,
        status: 'pending' as const
      }))
    };
    
    this.performanceStats.planHistory.push({
      ...this.currentPlan,
      startTime: Date.now()
    });
    
    this.renderer.renderInfo(`📋 Plan Created: ${event.payload.title}`);
    this.renderer.renderInfo(`${event.payload.totalSteps} steps planned`);
    
    if (!this.config.compactMode) {
      event.payload.steps.forEach((step, index) => {
        console.log(`  ${index + 1}. ${step.title}`);
      });
    }
  }

  private async handlePlanStepStartedEvent(event: PlanStepStartedEvent): Promise<void> {
    this.currentPlan.currentStepIndex = event.payload.stepIndex;
    
    if (this.currentPlan.steps) {
      const step = this.currentPlan.steps.find((s: any) => s.id === event.payload.stepId);
      if (step) step.status = 'running';
    }
    
    this.renderer.renderProgressBar(
      event.payload.stepIndex,
      this.currentPlan.totalSteps || 1,
      event.payload.stepTitle
    );
  }

  private async handlePlanStepCompletedEvent(event: PlanStepCompletedEvent): Promise<void> {
    if (this.currentPlan.steps) {
      const step = this.currentPlan.steps.find((s: any) => s.id === event.payload.stepId);
      if (step) step.status = 'completed';
    }
    
    this.renderer.renderSuccess(`${event.payload.stepTitle} completed`);
    this.renderer.renderProgressBar(
      event.payload.stepIndex + 1,
      this.currentPlan.totalSteps || 1
    );
  }

  private async handlePlanProgressEvent(event: PlanProgressUpdateEvent): Promise<void> {
    this.currentPlan.currentStepIndex = event.payload.currentStepIndex;
    
    this.renderer.renderProgressBar(
      event.payload.currentStepIndex,
      event.payload.totalSteps,
      event.payload.currentStepTitle
    );
  }

  private async handlePlanCompletedEvent(event: PlanCompletedEvent): Promise<void> {
    const { title, totalSteps, executionTime } = event.payload;
    const timeStr = executionTime ? ` in ${Math.round(executionTime / 1000)}s` : '';
    
    this.renderer.renderSuccess(`🎉 Plan "${title}" completed!`);
    this.renderer.renderInfo(`${totalSteps} steps executed${timeStr}`);
    
    // 更新统计
    const planIndex = this.performanceStats.planHistory.findIndex(
      p => p.id === event.payload.planId
    );
    if (planIndex !== -1) {
      this.performanceStats.planHistory[planIndex].endTime = Date.now();
      this.performanceStats.planHistory[planIndex].executionTime = executionTime;
    }
    
    this.currentPlan = {};
  }

  private async handlePlanErrorEvent(event: PlanErrorEvent): Promise<void> {
    this.renderer.renderError(`Plan error: ${event.payload.error}`);
    if (event.payload.stepTitle) {
      this.renderer.renderError(`Failed at step: ${event.payload.stepTitle}`);
    }
    
    if (this.currentPlan.steps && event.payload.stepId) {
      const step = this.currentPlan.steps.find((s: any) => s.id === event.payload.stepId);
      if (step) step.status = 'failed';
    }
  }

  // 文件事件处理
  private async handleFileCreatedEvent(event: FileCreatedEvent): Promise<void> {
    this.trackedFiles.add(event.payload.path);
    this.fileChanges.push({
      type: 'created',
      path: event.payload.path,
      timestamp: Date.now(),
      diff: event.payload.diff
    });
    
    if (!this.config.compactMode) {
      this.renderer.renderSuccess(`Created: ${this.getRelativePath(event.payload.path)} (${event.payload.size} bytes)`);
      
      if (event.payload.diff) {
        this.renderer.renderDiff(event.payload.diff, 'created');
      }
    }
  }

  private async handleFileModifiedEvent(event: FileModifiedEvent): Promise<void> {
    this.trackedFiles.add(event.payload.path);
    this.fileChanges.push({
      type: 'modified',
      path: event.payload.path,
      timestamp: Date.now(),
      diff: event.payload.diff
    });
    
    if (!this.config.compactMode) {
      this.renderer.renderWarning(`Modified: ${this.getRelativePath(event.payload.path)} (${event.payload.changesApplied} changes)`);
      
      if (event.payload.diff) {
        this.renderer.renderDiff(event.payload.diff, 'modified');
      }
    }
  }

  private async handleFileDeletedEvent(event: FileDeletedEvent): Promise<void> {
    this.trackedFiles.delete(event.payload.path);
    this.fileChanges.push({
      type: 'deleted',
      path: event.payload.path,
      timestamp: Date.now()
    });
    
    if (!this.config.compactMode) {
      this.renderer.renderError(`Deleted: ${this.getRelativePath(event.payload.path)}`);
    }
  }

  private async handleDirectoryCreatedEvent(event: DirectoryCreatedEvent): Promise<void> {
    if (!this.config.compactMode) {
      this.renderer.renderInfo(`Directory created: ${this.getRelativePath(event.payload.path)}`);
    }
  }

  private async handleDiffReversedEvent(event: DiffReversedEvent): Promise<void> {
    if (!this.config.compactMode) {
      this.renderer.renderWarning(`Reverted ${event.payload.changesReverted} changes`);
      if (event.payload.reason) {
        this.renderer.renderInfo(`Reason: ${event.payload.reason}`);
      }
    }
  }

  // 交互事件处理
  private async handleInputRequestEvent(event: InputRequestEvent): Promise<void> {
    // 这些事件需要外部处理，因为涉及用户交互
    // 这里只是记录日志
    logger.info('Input request received:', event.payload);
  }

  private async handleApprovalRequestEvent(event: ApprovalRequestEvent): Promise<void> {
    // 这些事件需要外部处理，因为涉及用户交互
    // 这里只是记录日志
    logger.info('Approval request received:', event.payload);
  }

  private async handleStatusUpdateEvent(event: StatusUpdateEvent): Promise<void> {
    if (event.payload.message) {
      this.renderer.renderInfo(event.payload.message);
    }
  }

  private async handleErrorEvent(event: ErrorEvent): Promise<void> {
    if (event.payload.message || event.payload.error) {
      this.renderer.renderError(event.payload.message || event.payload.error);
    }
  }

  // 辅助方法
  private updateToolStats(toolName: string, success: boolean, executionTime?: number): void {
    this.performanceStats.totalToolCalls++;
    
    let stats = this.performanceStats.toolCallStats.get(toolName);
    if (!stats) {
      stats = { count: 0, totalTime: 0, successRate: 0 };
      this.performanceStats.toolCallStats.set(toolName, stats);
    }
    
    stats.count++;
    if (executionTime) {
      stats.totalTime += executionTime;
    }
    stats.successRate = (stats.successRate * (stats.count - 1) + (success ? 1 : 0)) / stats.count;
  }

  private getRelativePath(fullPath: string): string {
    const cwd = process.cwd();
    if (fullPath.startsWith(cwd)) {
      return fullPath.substring(cwd.length + 1);
    }
    return fullPath;
  }

  // 配置方法
  setCompactMode(enabled: boolean): void {
    this.config.compactMode = enabled;
    this.renderer.setCompactMode(enabled);
  }

  enableFeature(feature: keyof EventHandlerConfig, enabled: boolean): void {
    (this.config as any)[feature] = enabled;
  }
}