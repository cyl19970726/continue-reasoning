import { ILLM } from '@continue-reasoning/core';
import { z } from 'zod';

// 简单的工具接口，不依赖 @core 的复杂工具系统
export interface ITool {
  name: string;
  description: string;
  params: z.ZodSchema<any>;
  execute_func: (params: any) => Promise<any> | any;
  toCallDefinition: () => ToolCallDefinition;
}

// 工具调用定义（匹配 @continue-reasoning/core 的格式）
export interface ToolCallDefinition {
  type: 'function';
  name: string;
  description: string;
  paramSchema: z.ZodObject<any>;
  strict: boolean;
  async?: boolean;
  resultSchema?: any;
  resultDescription?: string;
}

// 工具调用结果
export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

// Agent 执行结果
export interface AgentResult {
  success: boolean;
  finalAnswer?: string;
  steps: AgentStep[];
  error?: string;
}

// Agent 执行步骤 - 支持多种数据类型
export interface AgentStep {
  // 主要内容
  content: string;
  // 可选的额外数据
  thinking?: string;           // 思考内容
  response?: string;           // 普通回答
  finalAnswer?: string;        // 最终答案
  // 可以包含多个工具调用
  toolCalls?: Array<{
    tool: string;
    params: any;
    result: any;
  }>;
}

// 简单的 Agent 接口
export interface IAgent {
  name: string;
  description: string;
  llm: ILLM;
  tools: ITool[];
  
  execute(prompt: string): Promise<AgentResult>;
  addTool(tool: ITool): void;
  removeTool(toolName: string): void;
}

// XML 提取器接口（基于文档中的 xml-extractor）
export interface IXmlExtractor {
  extract(text: string, tagPath: string): { success: boolean; content?: string; error?: string };
  extractMultiple(text: string, tagPaths: string[]): Record<string, string>;
} 