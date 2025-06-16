import { CommandHandler } from '../types';

/**
 * 多行输入命令处理器
 */
export const multilineCommand: CommandHandler = {
  name: 'multiline',
  description: 'Toggle multi-line input mode',
  handler: async (args: string[], client: any) => {
    if (client && typeof client.toggleMultilineMode === 'function') {
      client.toggleMultilineMode();
    } else {
      console.log('\n📝 Multi-line Input Mode');
      console.log('=' .repeat(30));
      console.log('To use multi-line input:');
      console.log('1. Type ### to start multi-line mode');
      console.log('2. Type your content (press Enter for new lines)');
      console.log('3. Type ### on a new line to submit');
      console.log('');
      console.log('This is ideal for:');
      console.log('• Code snippets');
      console.log('• Long text or documentation');
      console.log('• Multi-paragraph content');
      console.log('');
    }
  }
}; 