import { FileImporterConfig } from './utils/file-importer';
import { FileCompleterConfig } from './utils/file-completer';

/**
 * CLI Client configuration interface
 */
export interface CLIClientConfig {
  // Basic configuration
  name: string;
  userId?: string;
  sessionId?: string;
  agentId?: string;
  
  // Agent configuration
  maxSteps?: number;
  
  // Input configuration
  enableMultilineInput?: boolean;
  multilineDelimiter?: string;
  enableHistory?: boolean;
  historyFile?: string;
  maxHistorySize?: number;
  
  // Display configuration
  enableColors?: boolean;
  enableTimestamps?: boolean;
  promptPrefix?: string;
  
  // File import configuration
  fileImporter?: FileImporterConfig;
  
  // File completion configuration
  fileCompleter?: FileCompleterConfig;
  
  // Extension configuration
  customCommands?: Record<string, CommandHandler>;
}

/**
 * Session manager interface (simplified version for type checking)
 */
export interface ISessionManager {
  agent: any;
  setCallbacks(callbacks: any): void;
  sendMessageToAgent(message: string, maxSteps: number, sessionId: string): Promise<string>;
  createSession(userId?: string, agentId?: string): string;
  getSessionCount(): number;
}

/**
 * Command handler interface
 */
export interface CommandHandler {
  name: string;
  description: string;
  handler: (args: string[], client: any) => Promise<void> | void;
}

/**
 * Input state
 */
export type InputState = 'single' | 'multiline' | 'waiting';

/**
 * Multi-line input state
 */
export interface MultilineState {
  isActive: boolean;
  buffer: string[];
  delimiter: string;
}

/**
 * Command history item
 */
export interface HistoryItem {
  command: string;
  timestamp: number;
  type: 'single' | 'multiline' | 'command';
}

/**
 * CLI statistics
 */
export interface CLIStats {
  totalInputs: number;
  multilineInputs: number;
  commandsExecuted: number;
  sessionStartTime: number;
  lastInputTime: number;
}

/**
 * Tool call display state
 */
export interface ToolCallDisplayState {
  callId: string;
  name: string;
  params: any;
  startTime: number;
  isActive: boolean;
} 