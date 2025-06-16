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
    
    console.log('\n💬 Input Modes:');
    console.log('  Single-line input       - Type and press Enter');
    console.log('  Multi-line input        - Type ### to start/end multi-line mode');
    console.log('                          - Press Enter to add new lines');
    console.log('                          - Type ### again to submit');
    
    console.log('\n🎯 Event Subscription:');
    console.log('  CLI automatically subscribes to these events:');
    console.log('  • agent_reply           - Agent responses');
    console.log('  • agent_think           - Agent thinking process');
    console.log('  • agent_step            - Agent execution steps');
    console.log('  • tool_call_start       - Tool execution start');
    console.log('  • tool_call_result      - Tool execution results');
    console.log('  • approval_request      - User approval requests');
    console.log('  • input_request         - User input requests');
    
    console.log('\n📤 Event Publishing:');
    console.log('  CLI publishes these events:');
    console.log('  • user_message          - User input messages');
    console.log('  • approval_response     - User approval decisions');
    console.log('  • input_response        - User input responses');
    
    console.log('\n💡 Tips:');
    console.log('  • Use ### for multi-line code, documentation, or long text');
    console.log('  • Commands are case-insensitive');
    console.log('  • Type /help anytime to see this help');
    console.log('');
  }
}; 