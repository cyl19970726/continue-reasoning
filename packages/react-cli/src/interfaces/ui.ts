import { ClientMessage } from '@continue-reasoning/core';

/**
 * 主题配置
 */
export interface Theme {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    foreground: string;
    error: string;
    warning: string;
    success: string;
    info: string;
    muted: string;
  };
  styles: {
    border: string;
    padding: number;
    margin: number;
  };
}

/**
 * 组件属性基类
 */
export interface BaseComponentProps {
  theme?: Theme;
  compactMode?: boolean;
  debug?: boolean;
}

/**
 * 消息显示属性
 */
export interface MessageDisplayProps extends BaseComponentProps {
  message: ClientMessage;
  showTimestamp?: boolean;
  showStepNumber?: boolean;
  highlighted?: boolean;
  onSelect?: (messageId: string) => void;
}

/**
 * 输入区域属性
 */
export interface InputAreaProps extends BaseComponentProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  onSubmit: (value: string) => void;
  onChange: (value: string) => void;
  onCancel?: () => void;
}

/**
 * 状态栏属性
 */
export interface StatusBarProps extends BaseComponentProps {
  sessionId?: string;
  messageCount: number;
  isProcessing: boolean;
  currentStep?: number;
  totalSteps?: number;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
}

/**
 * 工具调用显示属性
 */
export interface ToolCallDisplayProps extends BaseComponentProps {
  toolName: string;
  params: any;
  result?: any;
  status: 'pending' | 'running' | 'completed' | 'error';
  duration?: number;
  onRetry?: () => void;
}

/**
 * 键盘快捷键配置
 */
export interface KeyBindings {
  submit: string;
  cancel: string;
  clear: string;
  help: string;
  quit: string;
  toggleCompact: string;
  toggleTheme: string;
  scrollUp: string;
  scrollDown: string;
  search: string;
  export: string;
}

/**
 * 应用状态
 */
export interface AppState {
  messages: ClientMessage[];
  currentInput: string;
  isProcessing: boolean;
  selectedMessageId?: string;
  showHelp: boolean;
  searchQuery: string;
  errorMessage?: string;
}