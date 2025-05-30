import { BaseAgent } from '../src/core/agent';
import { ContextManager } from '../src/core/context';
import { MapMemoryManager } from '../src/core/memory/baseMemory';
import { CliClient } from '../src/core/contexts/client';
import { LogLevel } from '../src/core/utils/logger';
import path from 'path';

// 自定义系统提示词 - 简单字符串方式
const customSystemPrompt = `
# Custom AI Assistant
You are a specialized AI assistant focused on technical tasks.

## Core Principles
- Be concise and precise
- Focus on technical accuracy
- Provide code examples when helpful
- Always use stop-response when task is complete
`;

// 自定义系统提示词 - 函数方式
const customSystemPromptFunction = (mode: 'minimal' | 'standard' | 'detailed') => {
    switch (mode) {
        case 'minimal':
            return `# Tech Assistant - Minimal\nAnswer questions. Use tools. Call stop-response when done.`;
        case 'standard':
            return `# Tech Assistant - Standard\n\n## Purpose\nTechnical assistance with coding and problem-solving.\n\n## Flow\n1. Analyze request\n2. Execute solution\n3. Call stop-response`;
        case 'detailed':
            return customSystemPrompt; // 使用详细版本
        default:
            return customSystemPrompt;
    }
};

async function demonstrateSystemPromptOverride() {
    console.log('🎯 Demonstrating System Prompt Override...\n');

    // 创建基础组件
    const contextManager = new ContextManager(
        'example-context-manager',
        'Example Context Manager',
        'Context manager for system prompt override example',
        {},
        { mode: 'standard' } // 使用 standard 模式
    );
    
    const memoryManager = new MapMemoryManager('example-memory', 'Example Memory', 'Memory for example');
    const clients = [new CliClient()];

    // 示例 1: 使用字符串形式的 systemPromptOverride
    console.log('📝 Example 1: Using string-based system prompt override');
    const agent1 = new BaseAgent(
        'agent-1',
        'Custom Prompt Agent',
        'Agent with custom system prompt',
        contextManager,
        memoryManager,
        clients,
        5,
        LogLevel.INFO,
        {
            enableParallelToolCalls: false,
            temperature: 0.7,
            maxTokens: 2048,
            systemPromptOverride: customSystemPrompt // 使用自定义提示词
        }
    );

    // 示例 2: 使用函数形式的 systemPromptOverride
    console.log('\n📝 Example 2: Using function-based system prompt override');
    const agent2 = new BaseAgent(
        'agent-2',
        'Dynamic Prompt Agent',
        'Agent with dynamic system prompt based on mode',
        new ContextManager('context-2', 'Context 2', 'Second context', {}, { mode: 'minimal' }),
        new MapMemoryManager('memory-2', 'Memory 2', 'Second memory'),
        clients,
        5,
        LogLevel.INFO,
        {
            enableParallelToolCalls: false,
            temperature: 0.5,
            maxTokens: 1024,
            systemPromptOverride: customSystemPromptFunction // 使用函数形式
        }
    );

    // 示例 3: 不使用 systemPromptOverride（使用默认提示词）
    console.log('\n📝 Example 3: Using default system prompt');
    const agent3 = new BaseAgent(
        'agent-3',
        'Default Prompt Agent',
        'Agent with default system prompt',
        new ContextManager('context-3', 'Context 3', 'Third context', {}, { mode: 'detailed' }),
        new MapMemoryManager('memory-3', 'Memory 3', 'Third memory'),
        clients,
        5,
        LogLevel.INFO,
        {
            enableParallelToolCalls: false,
            temperature: 0.7,
            maxTokens: 4096
            // 没有 systemPromptOverride，将使用 prompts.ts 中的默认提示词
        }
    );

    console.log('\n✅ All agents created successfully with different prompt configurations!');
    
    // 设置 agents
    await agent1.setup();
    await agent2.setup();
    await agent3.setup();
    
    console.log('\n🔍 Agents have been set up and are ready to use.');
    console.log('   - Agent 1: Custom static prompt');
    console.log('   - Agent 2: Dynamic prompt based on mode');
    console.log('   - Agent 3: Default system prompt from prompts.ts');
}

// 运行示例
if (require.main === module) {
    demonstrateSystemPromptOverride()
        .then(() => {
            console.log('\n✨ Example completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Error:', error);
            process.exit(1);
        });
}

export { demonstrateSystemPromptOverride }; 