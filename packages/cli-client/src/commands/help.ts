import { CommandHandler } from '../types';

/**
 * 帮助命令处理器
 */
export const helpCommand: CommandHandler = {
  name: 'help',
  description: 'Show help information and available commands',
  handler: async (args: string[], client: any) => {
    console.log('\n📖 Continue Reasoning CLI Help');
    console.log('=' .repeat(50));
    
    console.log('\n🔧 Basic Commands:');
    console.log('  /help, ?                - Show this help message');
    console.log('  /multiline, ###         - Toggle multi-line input mode');
    console.log('  /exit, /quit            - Exit the application');
    
    console.log('\n📁 File Import Commands:');
    console.log('  /fileinfo               - Show file import configuration and usage');
    console.log('  /fileconfig             - Configure file import settings');
    console.log('  /completion             - Show file completion help and tips');
    
    console.log('\n📄 File Import Syntax:');
    console.log('  @filename.txt           - Import a single file');
    console.log('  @folder/                - Import all files in a directory');
    console.log('  @"file with spaces.txt" - Import file with spaces in name');
    console.log('  Multiple files: @file1.js @file2.js');
    console.log('  Example: Please analyze @package.json and @src/index.ts');
    
    console.log('\n🔍 File Auto-completion:');
    console.log('  @f<Tab>                 - Show files starting with "f"');
    console.log('  @src/<Tab>              - Show contents of src directory');
    console.log('  @pack<Tab>              - Complete to @package.json');
    console.log('  @"my f<Tab>             - Complete quoted paths with spaces');
    
    console.log('\n💬 Input Modes:');
    console.log('  Single-line input       - Type and press Enter');
    console.log('  Multi-line input        - Type ### to start/end multi-line mode');
    console.log('                          - Press Enter to add new lines');
    console.log('                          - Type ### again to submit');
    
    console.log('\n🎯 Session Management:');
    console.log('  /new                    - Create a new session');
    console.log('  /session                - Show current session info');
    console.log('  /send <message>         - Send message to agent');
    
    console.log('\n💡 Tips:');
    console.log('  • Use ### for multi-line code, documentation, or long text');
    console.log('  • Use @filepath to include file contents in your message');
    console.log('  • File imports support both single files and directories');
    console.log('  • Hidden files and common ignore patterns are automatically skipped');
    console.log('  • Commands are case-insensitive');
    console.log('  • Type /help anytime to see this help');
    console.log('');
  }
}; 