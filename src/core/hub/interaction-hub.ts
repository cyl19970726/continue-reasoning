import { IInteractionHub, IAgent, IInteractiveLayer } from '../interfaces';
import { IEventBus } from '../events/eventBus';
import { logger } from '../utils/logger';

/**
 * 🎯 交互中心实现
 * 
 * 职责：
 * - 协调 Agent 和 InteractiveLayer 之间的通信
 * - 管理组件生命周期
 * - 提供系统级的状态监控
 * - 统一的事件路由和广播
 */
export class InteractionHub implements IInteractionHub {
    public readonly eventBus: IEventBus;
    private agents: Map<string, IAgent> = new Map();
    private interactiveLayers: Map<string, IInteractiveLayer> = new Map();
    private isRunning: boolean = false;

    constructor(eventBus: IEventBus) {
        this.eventBus = eventBus;
        logger.info('InteractionHub initialized');
    }

    /**
     * 注册智能体
     */
    registerAgent(agent: IAgent): void {
        if (this.agents.has(agent.id)) {
            logger.warn(`Agent ${agent.id} is already registered`);
            return;
        }

        this.agents.set(agent.id, agent);
        logger.info(`Agent registered: ${agent.id} (${agent.name})`);

        // 设置事件总线
        if (!agent.eventBus) {
            (agent as any).eventBus = this.eventBus;
        }

        // 设置事件处理器
        agent.setupEventHandlers();

        // 发布agent注册事件
        this.eventBus.publish({
            type: 'agent_registered',
            source: 'interaction_hub',
            sessionId: 'system',
            payload: {
                agentId: agent.id,
                agentName: agent.name,
                timestamp: Date.now()
            }
        }).catch(error => {
            logger.error('Error publishing agent_registered event:', error);
        });
    }

    /**
     * 注册交互层
     */
    registerInteractiveLayer(layer: IInteractiveLayer): void {
        if (this.interactiveLayers.has(layer.id)) {
            logger.warn(`InteractiveLayer ${layer.id} is already registered`);
            return;
        }

        this.interactiveLayers.set(layer.id, layer);
        logger.info(`InteractiveLayer registered: ${layer.id}`);

        // 设置InteractionHub引用
        if (layer.setInteractionHub) {
            layer.setInteractionHub(this);
        }

        // 订阅agent状态变化事件
        this.eventBus.subscribe('agent_state_change', async (event: any) => {
            if (layer.onAgentStateChange) {
                await layer.onAgentStateChange(event.payload.agentId || 'unknown', event.payload);
            }
        });

        // 发布交互层注册事件
        this.eventBus.publish({
            type: 'interactive_layer_registered',
            source: 'interaction_hub',
            sessionId: 'system',
            payload: {
                layerId: layer.id,
                capabilities: layer.getCapabilities(),
                timestamp: Date.now()
            }
        }).catch(error => {
            logger.error('Error publishing interactive_layer_registered event:', error);
        });
    }

    /**
     * 启动系统
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            logger.warn('InteractionHub is already running');
            return;
        }

        logger.info('Starting InteractionHub...');

        try {
            // 启动事件总线
            if (!this.eventBus) {
                throw new Error('EventBus is required');
            }
            await this.eventBus.start();

            // 启动所有已注册的交互层
            for (const [id, layer] of this.interactiveLayers) {
                try {
                    await layer.start();
                    logger.info(`InteractiveLayer started: ${id}`);
                } catch (error) {
                    logger.error(`Failed to start InteractiveLayer ${id}:`, error);
                }
            }

            // 设置系统级事件处理
            this.setupSystemEventHandlers();

            this.isRunning = true;
            logger.info('InteractionHub started successfully');

            // 发布系统启动事件
            await this.eventBus.publish({
                type: 'system_started',
                source: 'interaction_hub',
                sessionId: 'system',
                payload: {
                    timestamp: Date.now(),
                    registeredAgents: Array.from(this.agents.keys()),
                    registeredLayers: Array.from(this.interactiveLayers.keys())
                }
            });

        } catch (error) {
            logger.error('Failed to start InteractionHub:', error);
            throw error;
        }
    }

    /**
     * 停止系统
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            logger.warn('InteractionHub is not running');
            return;
        }

        logger.info('Stopping InteractionHub...');

        try {
            // 停止所有Agent
            for (const [id, agent] of this.agents) {
                try {
                    agent.stop();
                    logger.info(`Agent stopped: ${id}`);
                } catch (error) {
                    logger.error(`Failed to stop Agent ${id}:`, error);
                }
            }

            // 停止所有交互层
            for (const [id, layer] of this.interactiveLayers) {
                try {
                    await layer.stop();
                    logger.info(`InteractiveLayer stopped: ${id}`);
                } catch (error) {
                    logger.error(`Failed to stop InteractiveLayer ${id}:`, error);
                }
            }

            // 停止事件总线
            await this.eventBus.stop();

            this.isRunning = false;
            logger.info('InteractionHub stopped successfully');

        } catch (error) {
            logger.error('Failed to stop InteractionHub:', error);
            throw error;
        }
    }

    /**
     * 获取已注册的Agent列表
     */
    getAgents(): IAgent[] {
        return Array.from(this.agents.values());
    }

    /**
     * 获取已注册的InteractiveLayer列表
     */
    getInteractiveLayers(): IInteractiveLayer[] {
        return Array.from(this.interactiveLayers.values());
    }

    /**
     * 广播到所有Agent
     */
    async broadcastToAgents(eventType: string, payload: any): Promise<void> {
        const promises: Promise<void>[] = [];

        for (const agent of this.agents.values()) {
            promises.push(
                agent.publishEvent(eventType, payload).catch(error => {
                    logger.error(`Failed to broadcast to agent ${agent.id}:`, error);
                })
            );
        }

        await Promise.allSettled(promises);
    }

    /**
     * 广播到所有InteractiveLayer
     */
    async broadcastToInteractiveLayers(eventType: string, payload: any): Promise<void> {
        await this.eventBus.publish({
            type: eventType,
            source: 'interaction_hub',
            sessionId: 'broadcast',
            payload
        });
    }

    /**
     * 获取系统状态
     */
    getSystemStatus(): {
        agents: Array<{ id: string; status: string; isRunning: boolean }>;
        interactiveLayers: Array<{ id: string; capabilities: any }>;
        eventBusStatus: any;
    } {
        const agents = Array.from(this.agents.values()).map(agent => ({
            id: agent.id,
            status: agent.currentState,
            isRunning: agent.isRunning
        }));

        const interactiveLayers = Array.from(this.interactiveLayers.values()).map(layer => ({
            id: layer.id,
            capabilities: layer.getCapabilities()
        }));

        return {
            agents,
            interactiveLayers,
            eventBusStatus: this.eventBus.getStats()
        };
    }

    /**
     * 事件路由（高级功能）
     */
    async routeEvent(event: any, targetType: 'agent' | 'interactive_layer', targetId?: string): Promise<void> {
        if (targetType === 'agent') {
            if (targetId) {
                const agent = this.agents.get(targetId);
                if (agent) {
                    await agent.publishEvent(event.type, event.payload, event.sessionId);
                } else {
                    logger.warn(`Agent ${targetId} not found for event routing`);
                }
            } else {
                await this.broadcastToAgents(event.type, event.payload);
            }
        } else if (targetType === 'interactive_layer') {
            // 路由到特定的交互层或广播
            await this.broadcastToInteractiveLayers(event.type, event.payload);
        }
    }

    /**
     * 设置系统级事件处理器
     */
    private setupSystemEventHandlers(): void {
        // 处理系统关闭请求
        this.eventBus.subscribe('system_shutdown_request', async (event: any) => {
            logger.info('System shutdown requested');
            await this.stop();
        });

        // 处理Agent状态变化
        this.eventBus.subscribe('agent_state_change', async (event: any) => {
            const { payload } = event;
            logger.debug(`Agent state change: ${payload.fromState} -> ${payload.toState}`);

            // 如果有Agent发生错误，可以在这里实现恢复逻辑
            if (payload.toState === 'error') {
                logger.warn(`Agent ${payload.agentId || 'unknown'} entered error state: ${payload.reason}`);
                // 可以实现自动重启或错误恢复逻辑
            }
        });

        // 处理交互层事件
        this.eventBus.subscribe('user_message', async (event: any) => {
            logger.debug('User message received, routing to agents');
            // 消息已经通过eventBus自动路由到注册的Agent
        });

        // 处理批准请求
        this.eventBus.subscribe('approval_request', async (event: any) => {
            logger.info('Approval request received, routing to interactive layers');
            await this.broadcastToInteractiveLayers('approval_request', event.payload);
        });

        // 处理输入请求
        this.eventBus.subscribe('input_request', async (event: any) => {
            logger.info('Input request received, routing to interactive layers');
            await this.broadcastToInteractiveLayers('input_request', event.payload);
        });
    }

    /**
     * 检查系统健康状态
     */
    public checkHealth(): {
        status: 'healthy' | 'degraded' | 'unhealthy';
        details: {
            hubRunning: boolean;
            eventBusRunning: boolean;
            agentsCount: number;
            layersCount: number;
            errorAgents: string[];
        };
    } {
        const errorAgents = Array.from(this.agents.values())
            .filter(agent => agent.currentState === 'error')
            .map(agent => agent.id);

        const details = {
            hubRunning: this.isRunning,
            eventBusRunning: this.eventBus ? true : false,
            agentsCount: this.agents.size,
            layersCount: this.interactiveLayers.size,
            errorAgents
        };

        let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
        
        if (!this.isRunning || !this.eventBus) {
            status = 'unhealthy';
        } else if (errorAgents.length > 0) {
            status = 'degraded';
        }

        return { status, details };
    }
} 