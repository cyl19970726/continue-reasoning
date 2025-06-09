// 核心组件导出
export { ThinkingExtractor } from './thinking-extractor';
export type { ParsedThinking } from './thinking-extractor';

export { ResponseExtractor } from './response-extractor';
export type { ParsedResponse, UserInputContext, TaskType, ConversationMessage } from './response-extractor';

export { ExecutionTracker } from './execution-tracker';
export type { ExecutionStep } from './execution-tracker';

export { ThinkingEngine } from './thinking-engine';
export type { LLMResponse, ThinkingQuality } from './thinking-engine';

export { ThinkingOrchestrator } from './thinking-orchestrator';
export type { ProcessResult, ThinkingOrchestratorOptions } from './thinking-orchestrator';

export type { ExecutionHistoryRenderOptions } from './execution-tracker';


// 便捷的工厂函数
import { ILLM } from '../interfaces';
import { ThinkingOrchestrator, ThinkingOrchestratorOptions } from './thinking-orchestrator';
import { XmlExtractor } from './xml-extractor';

export function createThinkingSystem(llm: ILLM, options: ThinkingOrchestratorOptions) {
  return new ThinkingOrchestrator(llm, options);
} 

export { XmlExtractor } from './xml-extractor';