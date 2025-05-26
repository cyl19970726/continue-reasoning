import { IAgent, IInteractionHub } from '../interfaces';
import { IInteractiveLayer } from '../events/interactiveLayer';
import { IEventBus } from '../events/eventBus';
import { logger } from '../utils/logger';

export class InteractionHub implements IInteractionHub {
  eventBus: IEventBus;
  private agents: IAgent[] = [];
  private interactiveLayers: IInteractiveLayer[] = [];
  private isRunning: boolean = false;

  constructor(eventBus: IEventBus) {
    this.eventBus = eventBus;
  }

  registerAgent(agent: IAgent): void {
    if (!this.agents.includes(agent)) {
      this.agents.push(agent);
      // 确保Agent使用同一个EventBus
      if (agent.eventBus !== this.eventBus) {
        logger.warn(`Agent ${agent.id} has different EventBus, updating to use hub's EventBus`);
        (agent as any).eventBus = this.eventBus;
      }
      logger.info(`Agent ${agent.id} registered with InteractionHub`);
    }
  }

  registerInteractiveLayer(layer: IInteractiveLayer): void {
    if (!this.interactiveLayers.includes(layer)) {
      this.interactiveLayers.push(layer);
      logger.info(`InteractiveLayer registered with InteractionHub`);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('InteractionHub is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting InteractionHub...');

    // 启动EventBus
    await this.eventBus.start();

    // 启动所有InteractiveLayer
    for (const layer of this.interactiveLayers) {
      try {
        await layer.start();
        logger.info('InteractiveLayer started successfully');
      } catch (error) {
        logger.error('Failed to start InteractiveLayer:', error);
      }
    }

    // 设置所有Agent
    for (const agent of this.agents) {
      try {
        await agent.setup();
        logger.info(`Agent ${agent.id} setup completed`);
      } catch (error) {
        logger.error(`Failed to setup Agent ${agent.id}:`, error);
      }
    }

    // 设置事件路由（如果需要的话）
    this.setupEventRouting();

    logger.info('InteractionHub started successfully');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('InteractionHub is not running');
      return;
    }

    this.isRunning = false;
    logger.info('Stopping InteractionHub...');

    // 停止所有Agent
    for (const agent of this.agents) {
      try {
        agent.stop();
        logger.info(`Agent ${agent.id} stopped`);
      } catch (error) {
        logger.error(`Failed to stop Agent ${agent.id}:`, error);
      }
    }

    // 停止所有InteractiveLayer
    for (const layer of this.interactiveLayers) {
      try {
        await layer.stop();
        logger.info('InteractiveLayer stopped');
      } catch (error) {
        logger.error('Failed to stop InteractiveLayer:', error);
      }
    }

    // 停止EventBus
    await this.eventBus.stop();

    logger.info('InteractionHub stopped successfully');
  }

  getAgents(): IAgent[] {
    return [...this.agents];
  }

  getInteractiveLayers(): IInteractiveLayer[] {
    return [...this.interactiveLayers];
  }

  // 可选的事件路由功能，用于复杂的多对多场景
  async routeEvent(event: any, targetType: 'agent' | 'interactive_layer', targetId?: string): Promise<void> {
    // 这里可以实现复杂的事件路由逻辑
    // 目前简单实现：直接发布到EventBus
    await this.eventBus.publish(event);
  }

  // 设置基本的事件路由
  private setupEventRouting(): void {
    // 监听用户消息事件，转发给所有Agent
    this.eventBus.subscribe('user_message', async (event: any) => {
      logger.info(`Routing user_message to ${this.agents.length} agents`);
      // 由于所有组件共享EventBus，事件会自动传播
      // 这里可以添加更复杂的路由逻辑
    });

    // 监听Agent回复事件，转发给所有InteractiveLayer
    this.eventBus.subscribe('agent_reply', async (event: any) => {
      logger.info(`Routing agent_reply to ${this.interactiveLayers.length} interactive layers`);
      // 由于所有组件共享EventBus，事件会自动传播
    });

    // 监听执行模式变更请求事件
    this.eventBus.subscribe('execution_mode_change_request', async (event: any) => {
      logger.info('Routing execution_mode_change_request event');
      // 确保所有Agent都收到模式变更请求事件
    });

    logger.info('Event routing setup completed');
  }

  // 工具方法：获取统计信息
  getStats() {
    return {
      isRunning: this.isRunning,
      agentCount: this.agents.length,
      interactiveLayerCount: this.interactiveLayers.length,
      eventBusStats: this.eventBus.getStats()
    };
  }

  // 工具方法：检查健康状态
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {};
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // 检查EventBus
    try {
      const eventBusStats = this.eventBus.getStats();
      details.eventBus = { status: 'healthy', stats: eventBusStats };
    } catch (error) {
      details.eventBus = { status: 'unhealthy', error: (error as Error).message };
      status = 'unhealthy';
    }

    // 检查Agent状态
    details.agents = this.agents.map(agent => ({
      id: agent.id,
      status: 'unknown' // 可以扩展Agent接口添加健康检查
    }));

    // 检查InteractiveLayer状态
    details.interactiveLayers = this.interactiveLayers.map((layer, index) => ({
      index,
      status: 'unknown' // 可以扩展InteractiveLayer接口添加健康检查
    }));

    return { status, details };
  }
} 