import { CommandHandler } from '../types';

/**
 * 退出命令
 */
export const exitCommand: CommandHandler = {
  name: 'exit',
  description: 'Exit the CLI client',
  handler: async (args: string[], client: any) => {
    console.log('👋 Goodbye!');
    if (client && typeof client.stop === 'function') {
      await client.stop();
    } else {
      process.exit(0);
    }
  }
}; 