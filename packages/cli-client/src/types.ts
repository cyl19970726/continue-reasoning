import { FileImporterConfig } from './utils/file-importer';
import { FileCompleterConfig } from './utils/file-completer';

/**
 * CLI Client 配置接口
 */
export interface CLIClientConfig {
  // 基础配置
  name: string;
  userId?: string;
  sessionId?: string;
  agentId?: string;
  
  // Agent 配置
  maxSteps?: number;
  
  // 输入配置
  enableMultilineInput?: boolean;
  multilineDelimiter?: string;
  enableHistory?: boolean;
  historyFile?: string;
  maxHistorySize?: number;
  
  // 显示配置
  enableColors?: boolean;
  enableTimestamps?: boolean;
  promptPrefix?: string;
  
  // 文件导入配置
  fileImporter?: FileImporterConfig;
  
  // 文件补全配置
  fileCompleter?: FileCompleterConfig;
  
  // 扩展配置
  customCommands?: Record<string, CommandHandler>;
}

/**
 * 会话管理器接口（简化版本，用于类型检查）
 */
export interface ISessionManager {
  agent: any;
  setCallbacks(callbacks: any): void;
  sendMessageToAgent(message: string, maxSteps: number, sessionId: string): Promise<string>;
  createSession(userId?: string, agentId?: string): string;
  getSessionCount(): number;
}

/**
 * 命令处理器接口
 */
export interface CommandHandler {
  name: string;
  description: string;
  handler: (args: string[], client: any) => Promise<void> | void;
}

/**
 * 输入状态
 */
export type InputState = 'single' | 'multiline' | 'waiting';

/**
 * 多行输入状态
 */
export interface MultilineState {
  isActive: boolean;
  buffer: string[];
  delimiter: string;
}

/**
 * 命令历史项
 */
export interface HistoryItem {
  command: string;
  timestamp: number;
  type: 'single' | 'multiline' | 'command';
}

/**
 * CLI 统计信息
 */
export interface CLIStats {
  totalInputs: number;
  multilineInputs: number;
  commandsExecuted: number;
  sessionStartTime: number;
  lastInputTime: number;
}

/**
 * Tool 调用显示状态
 */
export interface ToolCallDisplayState {
  callId: string;
  name: string;
  params: any;
  startTime: number;
  isActive: boolean;
} 