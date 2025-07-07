/**
 * 流式系统导出模块
 */

// 核心类型
export * from './types';
export * from './interfaces';

// 核心实现
export { StreamingSession } from './StreamingSession';
export { StreamingSessionManager } from './StreamingSessionManager';
export { AgentCallbackBridge } from './AgentCallbackBridge';
export { BufferManager } from './BufferManager';
export { ErrorRecoveryManager } from './ErrorRecoveryManager';
export { StreamingMonitor } from './StreamingMonitor';

// 便捷工厂函数
export function createStreamingSessionManager(agent: any) {
  return new StreamingSessionManager(agent);
}

export function createStreamingSession(config: { sessionId: string; options?: any }) {
  return new StreamingSession(config);
}