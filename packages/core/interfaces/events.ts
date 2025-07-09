import { AgentStep, ToolCallParams, ToolExecutionResult, AgentStorage } from './index.js';

/**
 * 事件基类
 */
export interface BaseEvent {
    type: string;
    timestamp: number;
    sessionId?: string;
    stepIndex?: number;
    source: string; // 事件源组件名称
}

/**
 * 会话事件 - 管理用户会话生命周期
 */
export interface SessionEvent extends BaseEvent {
    type: 
        | 'session.started'    // 会话开始
        | 'session.ended'      // 会话结束
        | 'session.switched';  // 会话切换
    sessionId: string;
    userId?: string;
    agentId?: string;
    data?: {
        userId?: string;
        agentId?: string;
        userInput?: string;
        maxSteps?: number;
        sessionId?: string;
    };
}

/**
 * Agent执行事件 - 管理Agent的执行状态和步骤
 */
export interface AgentEvent extends BaseEvent {
    type: 
        | 'agent.step.started'     // Agent步骤开始
        | 'agent.step.completed'   // Agent步骤完成
        | 'agent.step.failed'      // Agent步骤失败
        | 'agent.stopped'          // Agent停止
        | 'agent.setup.started'    // Agent设置开始
        | 'agent.setup.completed'  // Agent设置完成
        | 'agent.state.changed';   // Agent状态变化
    stepIndex?: number;
    data?: {
        step?: AgentStep<any>;
        error?: string;
        reason?: string;
        agentId?: string;
        agentName?: string;
        previousState?: string;
        newState?: string;
        sessionId?: string;
    };
}

/**
 * LLM事件 - 管理LLM调用和响应
 */
export interface LLMEvent extends BaseEvent {
    type: 
        | 'llm.call.started'           // LLM调用开始
        | 'llm.call.completed'         // LLM调用完成
        | 'llm.text.delta'             // 文本增量输出（流式）
        | 'llm.text.completed'         // 文本生成完成
        | 'llm.tool.call.started'      // 工具调用开始
        | 'llm.tool.call.completed'    // 工具调用完成
        | 'llm.thinking.started'       // 思考开始
        | 'llm.thinking.completed';    // 思考完成
        
    stepIndex?: number;
    data: {
        // 基于LLMStreamChunk的数据结构
        content?: string;              // 文本内容
        chunkIndex?: number;           // 块索引
        outputIndex?: number;          // 输出索引
        toolCall?: ToolCallParams;     // 工具调用参数
        result?: any;                  // 调用结果
        error?: Error;                 // 错误信息
        
        // 思考相关
        thought?: string;              // 思考内容
        confidence?: number;           // 置信度
        finalThought?: string;         // 最终思考
        
        // 调用模式标识
        isStreaming?: boolean;         // 是否为流式调用
        callType?: 'async' | 'stream'; // 调用类型
        
        // SimpleClient需要的属性
        stepIndex?: number;            // 步骤索引（在data中）
        delta?: string;                // 文本增量
        text?: string;                 // 完整文本
    };
}

/**
 * 工具事件 - 管理工具调用和执行
 */
export interface ToolEvent extends BaseEvent {
    type: 
        | 'tool.execution.started'     // 工具执行开始
        | 'tool.execution.completed'   // 工具执行完成
        | 'tool.execution.failed'      // 工具执行失败
        | 'tool.execution.error';      // 工具执行错误
    stepIndex?: number;
    data: {
        toolCall?: ToolCallParams;
        result?: ToolExecutionResult;
        error?: string;
        executionTime?: number;
        agentId?: string;
        sessionId?: string;
    };
}

/**
 * UI事件 - 管理用户界面交互
 */
export interface UIEvent extends BaseEvent {
    type: 
        | 'ui.message.added'           // UI消息添加
        | 'ui.state.changed'           // UI状态变化
        | 'ui.input.received'          // UI输入接收
        | 'user.message';              // 用户消息
    data: {
        message?: any;
        state?: any;
        input?: string;
        messageContent?: string;
        userId?: string;
        clientName?: string;
        sessionId?: string;
    };
}

/**
 * 错误事件 - 管理系统错误和异常
 */
export interface ErrorEvent extends BaseEvent {
    type: 
        | 'error.occurred';            // 错误发生
    data: {
        error: Error | string;
        context?: any;
    };
}

/**
 * 存储事件 - 管理数据存储操作
 */
export interface StorageEvent extends BaseEvent {
    type: 
        | 'storage.save.requested'     // 存储保存请求
        | 'storage.load.requested'     // 存储加载请求
        | 'storage.updated';           // 存储更新完成
    data: {
        storage?: AgentStorage;
        operation?: string;
        sessionId?: string;
        clientName?: string;
    };
}

/**
 * 联合事件类型
 */
export type AppEvent = SessionEvent | AgentEvent | LLMEvent | ToolEvent | UIEvent | ErrorEvent | StorageEvent;

/**
 * 事件处理器类型
 */
export type EventHandler<T extends AppEvent = AppEvent> = (event: T) => void | Promise<void>;

/**
 * 事件过滤器
 */
export interface EventFilter {
    type?: string | string[];
    sessionId?: string;
    stepIndex?: number;
    source?: string;
}

/**
 * 事件总线接口
 */
export interface IEventBus {
    // 事件订阅
    subscribe<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): string; // 返回订阅ID
    
    // 事件发布
    publish(event: AppEvent): Promise<void>;
    
    // 取消订阅
    unsubscribe(subscriptionId: string): void;
    
    // 批量取消订阅
    unsubscribeAll(source?: string): void;
    
    // 事件历史查询
    getEventHistory(filter?: EventFilter): AppEvent[];
    
    // 清理事件历史
    clearHistory(olderThan?: number): void;
    
    // 获取统计信息
    getStats(): {
        totalEvents: number;
        activeSubscriptions: number;
        eventsByType: Record<string, number>;
    };
}

/**
 * 事件发布者接口
 */
export interface IEventPublisher {
    eventBus: IEventBus;
    componentName: string;
    
    // 便捷的事件发布方法
    publishEvent(event: Omit<AppEvent, 'timestamp' | 'source'>): Promise<void>;
}

/**
 * 事件订阅者接口
 */
export interface IEventSubscriber {
    eventBus: IEventBus;
    componentName: string;
    subscriptionIds: string[];
    
    // 便捷的事件订阅方法
    subscribeToEvent<T extends AppEvent>(
        eventType: T['type'] | T['type'][], 
        handler: EventHandler<T>,
        filter?: EventFilter
    ): void;
    
    // 清理订阅
    cleanup(): void;
}

/**
 * LLMStreamChunk到LLMEvent的映射工具
 */
export class LLMEventMapper {
    /**
     * 将LLMStreamChunk转换为LLMEvent
     */
    static mapStreamChunkToEvent(
        chunk: import('./agent.js').LLMStreamChunk,
        stepIndex: number,
        sessionId?: string,
        source: string = 'Agent'
    ): LLMEvent | null {
        const baseEvent = {
            timestamp: Date.now(),
            stepIndex,
            sessionId,
            source
        };

        switch (chunk.type) {
            case 'text-delta':
                return {
                    type: 'llm.text.delta',
                    ...baseEvent,
                    data: {
                        content: chunk.content,
                        chunkIndex: chunk.chunkIndex,
                        outputIndex: chunk.outputIndex,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'text-done':
                return {
                    type: 'llm.text.completed',
                    ...baseEvent,
                    data: {
                        content: chunk.content,
                        chunkIndex: chunk.chunkIndex,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'tool-call-start':
                return {
                    type: 'llm.tool.call.started',
                    ...baseEvent,
                    data: {
                        toolCall: chunk.toolCall,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'tool-call-done':
                return {
                    type: 'llm.tool.call.completed',
                    ...baseEvent,
                    data: {
                        toolCall: chunk.toolCall,
                        result: chunk.result,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'thinking-start':
                return {
                    type: 'llm.thinking.started',
                    ...baseEvent,
                    data: {
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'thinking-progress':
                return {
                    type: 'llm.thinking.completed',
                    ...baseEvent,
                    data: {
                        thought: chunk.thought,
                        confidence: chunk.confidence,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'thinking-complete':
                return {
                    type: 'llm.thinking.completed',
                    ...baseEvent,
                    data: {
                        finalThought: chunk.finalThought,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'step-start':
                return {
                    type: 'llm.call.started',
                    ...baseEvent,
                    data: {
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            case 'step-complete':
                return {
                    type: 'llm.call.completed',
                    ...baseEvent,
                    data: {
                        result: chunk.result,
                        isStreaming: true,
                        callType: 'stream'
                    }
                };

            default:
                return null;
        }
    }

    /**
     * 为非流式调用创建LLMEvent
     */
    static createAsyncCallEvents(
        stepIndex: number,
        sessionId?: string,
        source: string = 'Agent'
    ) {
        const baseEvent = {
            timestamp: Date.now(),
            stepIndex,
            sessionId,
            source
        };

        return {
            started: (): LLMEvent => ({
                type: 'llm.call.started',
                ...baseEvent,
                data: {
                    isStreaming: false,
                    callType: 'async'
                }
            }),

            textCompleted: (content: string): LLMEvent => ({
                type: 'llm.text.completed',
                ...baseEvent,
                data: {
                    content,
                    isStreaming: false,
                    callType: 'async'
                }
            }),

            toolCompleted: (toolCall: ToolCallParams, result?: any): LLMEvent => ({
                type: 'llm.tool.call.completed',
                ...baseEvent,
                data: {
                    toolCall,
                    result,
                    isStreaming: false,
                    callType: 'async'
                }
            }),

            completed: (result?: any): LLMEvent => ({
                type: 'llm.call.completed',
                ...baseEvent,
                data: {
                    result,
                    isStreaming: false,
                    callType: 'async'
                }
            })
        };
    }

    /**
     * 为流式调用创建LLMEvent生成器
     */
    static createStreamCallEvents(
        stepIndex: number,
        sessionId?: string,
        source: string = 'Agent'
    ) {
        const baseEvent = {
            timestamp: Date.now(),
            stepIndex,
            sessionId,
            source
        };

        return {
            started: (): LLMEvent => ({
                type: 'llm.call.started',
                ...baseEvent,
                data: {
                    isStreaming: true,
                    callType: 'stream'
                }
            }),

            textDelta: (delta: string, chunkIndex?: number): LLMEvent => ({
                type: 'llm.text.delta',
                ...baseEvent,
                data: {
                    content: delta,
                    chunkIndex,
                    isStreaming: true,
                    callType: 'stream'
                }
            }),

            textCompleted: (content: string): LLMEvent => ({
                type: 'llm.text.completed',
                ...baseEvent,
                data: {
                    content,
                    isStreaming: true,
                    callType: 'stream'
                }
            }),

            toolStarted: (toolCall: ToolCallParams): LLMEvent => ({
                type: 'llm.tool.call.started',
                ...baseEvent,
                data: {
                    toolCall,
                    isStreaming: true,
                    callType: 'stream'
                }
            }),

            toolCompleted: (toolCall: ToolCallParams, result?: any): LLMEvent => ({
                type: 'llm.tool.call.completed',
                ...baseEvent,
                data: {
                    toolCall,
                    result,
                    isStreaming: true,
                    callType: 'stream'
                }
            }),

            completed: (result?: any): LLMEvent => ({
                type: 'llm.call.completed',
                ...baseEvent,
                data: {
                    result,
                    isStreaming: true,
                    callType: 'stream'
                }
            })
        };
    }

    /**
     * 将流式chunk转换为事件数组
     */
    static convertChunkToEvents(
        chunk: any,
        stepIndex: number,
        sessionId?: string,
        source: string = 'Agent'
    ): LLMEvent[] {
        const events: LLMEvent[] = [];
        
        // 检查chunk是否是LLMStreamChunk类型
        if (chunk && typeof chunk === 'object') {
            const mapped = this.mapStreamChunkToEvent(chunk, stepIndex, sessionId, source);
            if (mapped) {
                events.push(mapped);
            }
        }
        
        return events;
    }
} 