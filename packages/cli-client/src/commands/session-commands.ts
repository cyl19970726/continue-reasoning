import { CommandHandler } from '../types';
import { formatSystemInfo, formatError } from '../utils/display-formatter';

/**
 * 新建会话命令
 */
export const newSessionCommand: CommandHandler = {
  name: 'new',
  description: 'Create a new session',
  handler: async (args: string[], client: any) => {
    try {
      if (client.config?.sessionManager) {
        client.newSession(client.config.sessionManager);
      } else {
        console.log(formatError('SessionManager not available'));
      }
    } catch (error) {
      console.log(formatError(`Failed to create new session: ${error instanceof Error ? error.message : error}`));
    }
  }
};

/**
 * 显示当前会话信息命令
 */
export const sessionInfoCommand: CommandHandler = {
  name: 'session',
  description: 'Show current session information',
  handler: async (args: string[], client: any) => {
    try {
      if (client.currentSessionId) {
        console.log(formatSystemInfo(`Current session: ${client.currentSessionId}`));
        console.log(formatSystemInfo(`Client name: ${client.name}`));
        
        if (client.config?.sessionManager) {
          const sessions = client.config.sessionManager.getActiveSessions();
          console.log(formatSystemInfo(`Total active sessions: ${sessions.length}`));
        }
      } else {
        console.log(formatSystemInfo('No active session'));
      }
    } catch (error) {
      console.log(formatError(`Failed to get session info: ${error instanceof Error ? error.message : error}`));
    }
  }
};

/**
 * 发送消息命令
 */
export const sendCommand: CommandHandler = {
  name: 'send',
  description: 'Send a message to the agent',
  handler: async (args: string[], client: any) => {
    try {
      const message = args.join(' ');
      if (!message.trim()) {
        console.log(formatError('Please provide a message to send'));
        return;
      }
      
      if (client.config?.sessionManager) {
        client.sendMessageToAgent(message, client.config.sessionManager);
      } else {
        console.log(formatError('SessionManager not available'));
      }
    } catch (error) {
      console.log(formatError(`Failed to send message: ${error instanceof Error ? error.message : error}`));
    }
  }
};

/**
 * 导出所有 session 相关命令
 */
export const sessionCommands = {
  new: newSessionCommand,
  session: sessionInfoCommand,
  send: sendCommand
}; 