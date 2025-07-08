import { 
  IClient, 
  ClientConfig, 
  ClientMessage, 
} from '@continue-reasoning/core';

/**
 * React CLI 客户端配置
 */
export interface ReactCLIConfig extends ClientConfig {
  // UI 配置
  theme?: 'light' | 'dark';
  compactMode?: boolean;
  showTimestamps?: boolean;
  showStepNumbers?: boolean;
  
  // 性能配置
  maxMessages?: number;
  scrollBuffer?: number;
  
  // 工具配置
  enableToolFormatting?: boolean;
  enableFileImport?: boolean;
  maxFileSize?: number;
  
  // 调试配置
  debug?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * React CLI 客户端事件处理器
 */
export interface ReactCLIEventHandlers {
  onUIUpdate?: (state: UIState) => void;
  onToolFormatted?: (toolName: string, result: string) => void;
  onFileImported?: (file: ImportedFile) => void;
  onThemeChanged?: (theme: string) => void;
  onMessage?: (message: ClientMessage) => void;
  onError?: (error: Error) => void;
  onExit?: () => void;
}

/**
 * UI 状态接口
 */
export interface UIState {
  isProcessing: boolean;
  currentInput: string;
  selectedMessageId?: string;
  showHelp: boolean;
  compactMode: boolean;
  theme: string;
}

/**
 * 导入的文件接口
 */
export interface ImportedFile {
  name: string;
  path: string;
  type: string;
  size: number;
  content: string | Buffer;
  encoding?: string;
}

/**
 * React CLI 客户端接口
 */
export interface IReactCLIClient extends IClient {
  // UI 控制
  updateUI(state: Partial<UIState>): void;
  toggleCompactMode(): void;
  setTheme(theme: 'light' | 'dark'): void;
  
  // 文件导入
  importFile(filePath: string): Promise<ImportedFile>;
  importFiles(filePaths: string[]): Promise<ImportedFile[]>;
  
  // 工具格式化
  formatToolResult(toolName: string, result: any): string;
  
  // 消息管理扩展
  searchMessages(query: string): ClientMessage[];
  exportMessages(format: 'json' | 'markdown' | 'txt'): string;
}