import * as readline from 'readline';
import * as fs from 'fs';
import { HistoryItem } from '../types';

/**
 * 创建 readline 接口
 */
export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    completer: undefined // 可以后续添加自动完成功能
  });
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * 加载命令历史
 */
export function loadHistory(filePath: string): HistoryItem[] {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data) || [];
    }
  } catch (error) {
    console.warn('Failed to load command history:', error);
  }
  return [];
}

/**
 * 保存命令历史
 */
export function saveHistory(filePath: string, history: HistoryItem[]): void {
  try {
    const data = JSON.stringify(history, null, 2);
    fs.writeFileSync(filePath, data, 'utf8');
  } catch (error) {
    console.warn('Failed to save command history:', error);
  }
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}

/**
 * 清除终端
 */
export function clearTerminal(): void {
  console.clear();
}

/**
 * 显示欢迎信息
 */
export function showWelcome(config: { 
  name?: string; 
  userId?: string; 
  sessionId?: string;
  workspace?: string;
}): void {
  const width = 70;
  const border = '─'.repeat(width - 2);
  
  console.log(`┌${border}┐`);
  console.log(`│${' '.repeat(width - 2)}│`);
  console.log(`│ ✨ Welcome to ${config.name || 'Continue Reasoning CLI'}!${' '.repeat(width - 2 - ` ✨ Welcome to ${config.name || 'Continue Reasoning CLI'}!`.length)}│`);
  console.log(`│${' '.repeat(width - 2)}│`);
  console.log(`│ Type /help or ? for help, /multiline or ### for multi-line input${' '.repeat(width - 2 - ' Type /help or ? for help, /multiline or ### for multi-line input'.length)}│`);
  console.log(`│${' '.repeat(width - 2)}│`);
  
  if (config.workspace) {
    const workspaceText = `📍 Workspace: ${config.workspace}`;
    const truncatedWorkspace = workspaceText.length > width - 4 ? 
      workspaceText.substring(0, width - 7) + '...' : workspaceText;
    console.log(`│ ${truncatedWorkspace}${' '.repeat(width - 2 - truncatedWorkspace.length - 1)}│`);
  }
  
  if (config.userId) {
    const userText = `👤 User: ${config.userId}`;
    console.log(`│ ${userText}${' '.repeat(width - 2 - userText.length - 1)}│`);
  }
  
  if (config.sessionId) {
    const sessionText = `🆔 Session: ${config.sessionId.substring(0, 12)}...`;
    console.log(`│ ${sessionText}${' '.repeat(width - 2 - sessionText.length - 1)}│`);
  }
  
  console.log(`└${border}┘`);
  console.log('');
  console.log('💡 Quick Start:');
  console.log('  • Type your message and press Enter');
  console.log('  • Use ### to start/end multi-line input');
  console.log('  • Type ? for help and available commands');
  console.log('');
}

/**
 * 显示输入提示符
 */
export function getPrompt(state: 'single' | 'multiline', lineNumber?: number): string {
  if (state === 'multiline') {
    const line = lineNumber ? lineNumber.toString().padStart(2, '0') : '01';
    return `│ ${line} │ `;
  }
  return '📝 > ';
}

/**
 * 验证输入
 */
export function validateInput(input: string, options?: {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}): { valid: boolean; error?: string } {
  if (!input || !input.trim()) {
    if (options?.required) {
      return { valid: false, error: 'Input is required' };
    }
    return { valid: true };
  }

  const trimmed = input.trim();

  if (options?.minLength && trimmed.length < options.minLength) {
    return { valid: false, error: `Input must be at least ${options.minLength} characters` };
  }

  if (options?.maxLength && trimmed.length > options.maxLength) {
    return { valid: false, error: `Input must be no more than ${options.maxLength} characters` };
  }

  if (options?.pattern && !options.pattern.test(trimmed)) {
    return { valid: false, error: 'Input format is invalid' };
  }

  return { valid: true };
}

/**
 * 提示用户输入
 */
export function promptUser(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * 安全退出
 */
export function safeExit(rl: readline.Interface, code: number = 0): void {
  try {
    rl.close();
  } catch (error) {
    // 忽略关闭错误
  }
  process.exit(code);
} 