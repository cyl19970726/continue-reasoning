import { CommandHandler } from '../types';
import { helpCommand } from './help';
import { multilineCommand } from './multiline';
import { exitCommand } from './exit';
import { sessionCommands } from './session-commands';
import { 
  fileImportInfoCommand, 
  fileImportConfigCommand, 
  fileCompletionInfoCommand 
} from './file-import';

/**
 * 内置命令映射
 */
export const BUILT_IN_COMMANDS: Record<string, CommandHandler> = {
  'help': helpCommand,
  '?': helpCommand, // 别名
  'multiline': multilineCommand,
  '###': multilineCommand, // 别名
  'fileinfo': fileImportInfoCommand,
  'fileconfig': fileImportConfigCommand,
  'completion': fileCompletionInfoCommand,
};

/**
 * 获取所有可用命令
 */
export function getAllCommands(customCommands?: Record<string, CommandHandler>): Record<string, CommandHandler> {
  const baseCommands: Record<string, CommandHandler> = {
    // 基础命令
    help: helpCommand,
    '?': helpCommand, // help 别名
    
    // 输入模式命令
    multiline: multilineCommand,
    '###': multilineCommand, // multiline 别名
    
    // 文件导入命令
    fileinfo: fileImportInfoCommand,
    fileconfig: fileImportConfigCommand,
    completion: fileCompletionInfoCommand,
    
    // 会话管理命令
    new: sessionCommands.new,
    session: sessionCommands.session,
    send: sessionCommands.send,
    
    // 系统命令
    exit: exitCommand,
    quit: exitCommand, // exit 别名
  };

  // 合并自定义命令
  if (customCommands) {
    Object.assign(baseCommands, customCommands);
  }

  return baseCommands;
}

/**
 * 检查输入是否为命令
 */
export function isCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/**
 * 解析命令
 */
export function parseCommand(input: string): { command: string; args: string[] } {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    throw new Error('Not a command');
  }

  const parts = trimmed.slice(1).split(' ');
  const command = parts[0];
  const args = parts.slice(1);

  return { command, args };
}

// 导出所有命令
export * from './help';
export * from './multiline';
export * from './exit';
export * from './session-commands';
export * from './file-import'; 