import { ToolExecutionResult } from '@continue-reasoning/core';

/**
 * 扩展的工具执行结果，包含实际使用中的额外字段
 */
export interface ExtendedToolExecutionResult extends ToolExecutionResult {
  // 基础字段继承自 ToolExecutionResult
  
  // 扩展字段
  content?: string | Buffer;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  data?: any;
  error?: string;
  success?: boolean;
  items?: Array<any>;
  matches?: Array<any>;
  files?: string[];
  metadata?: Record<string, any>;
}