/**
 * Agent回调桥接器 - 将Agent回调转换为流式事件
 */

import { IAgentCallbackBridge, IStreamingSession } from './interfaces';
import { StreamEvent, StreamEventType } from './types';
import { AgentCallbacks, AgentStep, ToolExecutionResult, ToolCallParams } from '../interfaces';
import { logger } from '../utils/logger';

/**
 * Agent回调到流式事件的桥接器
 */
export class AgentCallbackBridge implements IAgentCallbackBridge {
  private streamingSession?: IStreamingSession;
  private eventFilter?: (event: StreamEvent) => boolean;
  private eventTransformer?: (event: StreamEvent) => StreamEvent;
  
  // 文本位置追踪
  private textPosition: Map<number, number> = new Map();

  /**
   * 设置目标流式会话
   */
  setStreamingSession(session: IStreamingSession): void {
    this.streamingSession = session;
    this.textPosition.clear();
  }

  /**
   * 设置事件过滤器
   */
  setEventFilter(filter: (event: StreamEvent) => boolean): void {
    this.eventFilter = filter;
  }

  /**
   * 设置事件转换器
   */
  setEventTransformer(transformer: (event: StreamEvent) => StreamEvent): void {
    this.eventTransformer = transformer;
  }

  /**
   * 创建流式回调
   */
  createStreamingCallbacks(): AgentCallbacks {
    if (!this.streamingSession) {
      throw new Error('Streaming session not set');
    }

    const sessionId = this.streamingSession.sessionId;

    return {
      // 会话生命周期回调
      onSessionStart: (sid: string) => {
        logger.debug(`Bridge: Session ${sid} started`);
        // Session start已经在StreamingSession中处理
      },

      onSessionEnd: (sid: string) => {
        logger.debug(`Bridge: Session ${sid} ended`);
        // Session end会在StreamingSessionManager中处理
      },

      // LLM文本流回调
      onLLMTextDelta: (stepIndex: number, chunkIndex: number, delta: string) => {
        const position = this.getTextPosition(stepIndex);
        this.updateTextPosition(stepIndex, position + delta.length);
        
        this.emitEvent({
          type: StreamEventType.TEXT_DELTA,
          payload: { 
            text: delta, 
            position 
          },
          metadata: { 
            stepIndex, 
            chunkIndex, 
            source: 'llm', 
            priority: 'normal' 
          }
        });
      },

      onLLMTextDone: (stepIndex: number, chunkIndex: number, text: string) => {
        this.emitEvent({
          type: StreamEventType.TEXT_CHUNK,
          payload: { 
            chunkIndex, 
            text 
          },
          metadata: { 
            stepIndex, 
            chunkIndex, 
            source: 'llm', 
            priority: 'normal' 
          }
        });
      },

      onStepTextDone: (stepIndex: number, chunkIndex: number, text: string) => {
        this.emitEvent({
          type: StreamEventType.TEXT_COMPLETE,
          payload: { 
            fullText: text, 
            tokenCount: this.estimateTokenCount(text) 
          },
          metadata: { 
            stepIndex, 
            source: 'llm', 
            priority: 'normal' 
          }
        });
      },

      // 工具调用回调
      onToolCallStart: (toolCall: ToolCallParams) => {
        this.emitEvent({
          type: StreamEventType.TOOL_CALL_START,
          payload: {
            toolName: toolCall.name,
            toolId: toolCall.call_id,
            parameters: toolCall.parameters,
            estimatedDuration: this.estimateToolDuration(toolCall.name)
          },
          metadata: {
            source: 'agent',
            priority: 'high'
          }
        });
      },

      onToolExecutionEnd: (result: ToolExecutionResult) => {
        if (result.status === 'succeed') {
          this.emitEvent({
            type: StreamEventType.TOOL_CALL_COMPLETE,
            payload: {
              toolId: result.call_id,
              result
            },
            metadata: {
              source: 'tool',
              priority: 'high'
            }
          });
        } else {
          this.emitEvent({
            type: StreamEventType.TOOL_CALL_ERROR,
            payload: {
              toolId: result.call_id,
              error: new Error(result.message || 'Tool execution failed')
            },
            metadata: {
              source: 'tool',
              priority: 'critical'
            }
          });
        }
      },

      // Agent步骤回调
      onAgentStep: (step: AgentStep<any>) => {
        // 步骤开始事件
        this.emitEvent({
          type: StreamEventType.STEP_START,
          payload: {
            stepIndex: step.stepIndex!,
            timestamp: Date.now()
          },
          metadata: {
            stepIndex: step.stepIndex,
            source: 'agent',
            priority: 'high'
          }
        });

        // 如果有错误，发送错误事件
        if (step.error) {
          this.emitEvent({
            type: StreamEventType.ERROR_OCCURRED,
            payload: {
              error: new Error(step.error),
              context: { stepIndex: step.stepIndex }
            },
            metadata: {
              stepIndex: step.stepIndex,
              source: 'agent',
              priority: 'critical'
            }
          });
        }
      },

      // 错误回调
      onError: (error: any) => {
        this.emitEvent({
          type: StreamEventType.ERROR_OCCURRED,
          payload: {
            error: error instanceof Error ? error : new Error(String(error)),
            context: { sessionId }
          },
          metadata: {
            source: 'agent',
            priority: 'critical'
          }
        });
      },

      // 状态存储回调
      onStateStorage: (state) => {
        // 创建检查点
        this.streamingSession?.createCheckpoint();
      },

      // 异步加载存储
      loadAgentStorage: async (sid: string) => {
        // 这个通常由SessionManager处理
        return null;
      }
    };
  }

  /**
   * 发送事件（应用过滤和转换）
   */
  private emitEvent(event: Partial<StreamEvent>): void {
    if (!this.streamingSession) {
      return;
    }

    let fullEvent = event as StreamEvent;

    // 应用过滤器
    if (this.eventFilter && !this.eventFilter(fullEvent)) {
      return;
    }

    // 应用转换器
    if (this.eventTransformer) {
      fullEvent = this.eventTransformer(fullEvent);
    }

    // 发送事件
    this.streamingSession.emitEvent(fullEvent);
  }

  /**
   * 获取文本位置
   */
  private getTextPosition(stepIndex: number): number {
    return this.textPosition.get(stepIndex) || 0;
  }

  /**
   * 更新文本位置
   */
  private updateTextPosition(stepIndex: number, position: number): void {
    this.textPosition.set(stepIndex, position);
  }

  /**
   * 估算token数量（简单实现）
   */
  private estimateTokenCount(text: string): number {
    // 粗略估算：平均每4个字符一个token
    return Math.ceil(text.length / 4);
  }

  /**
   * 估算工具执行时间（基于历史数据）
   */
  private estimateToolDuration(toolName: string): number {
    // 这里可以基于历史数据进行估算
    const estimates: Record<string, number> = {
      'web_search': 3000,
      'file_read': 500,
      'file_write': 1000,
      'api_call': 2000,
      // 默认估算
      'default': 1500
    };

    return estimates[toolName] || estimates['default'];
  }
}