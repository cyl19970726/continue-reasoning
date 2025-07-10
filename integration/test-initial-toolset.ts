import { StreamAgent } from '../packages/core/stream-agent.js';
import { EnhancedPromptProcessor } from '../packages/core/prompts/enhanced-prompt-processor.js';
import { LogLevel } from '../packages/core/utils/logger.js';
import { EventBus } from '../packages/core/event-bus/event-bus.js';
import { DEFAULT_CONTEXTS } from '../packages/core/base-agent.js';

// 测试 StreamAgent 的工具集初始化
async function testToolSetInitialization() {
    console.log('🧪 Testing ToolSet initialization...');
    
    let eventBus = new EventBus(1000);
    try {
        // 创建 StreamAgent 实例
        const agent = new StreamAgent(
            'test-agent',
            'Test Agent',
            'Test agent for verifying toolset initialization',
            3,
            new EnhancedPromptProcessor(),
            LogLevel.INFO,
            { 
                model: 'gpt-4o',
                temperature: 0.7 
            },
            DEFAULT_CONTEXTS,
            eventBus
        );

        // 执行 setup
        await agent.setup();

        // 检查工具集是否被正确加载
        const toolSets = agent.listToolSets();
        console.log(`✅ Found ${toolSets.length} toolSets:`);
        
        for (const ts of toolSets) {
            console.log(`  - ${ts.name}: ${ts.tools?.length || 0} tools (active: ${ts.active})`);
        }

        // 检查活跃工具
        const activeTools = agent.getActiveTools();
        console.log(`✅ Found ${activeTools.length} active tools:`);
        
        for (const tool of activeTools.slice(0, 10)) { // 只显示前10个
            console.log(`  - ${tool.name}: ${tool.description || 'No description'}`);
        }

        if (activeTools.length > 10) {
            console.log(`  ... and ${activeTools.length - 10} more tools`);
        }

        // 测试结果
        if (toolSets.length > 0 && activeTools.length > 0) {
            console.log('✅ ToolSet initialization test PASSED!');
            return true;
        } else {
            console.log('❌ ToolSet initialization test FAILED - No tools found');
            return false;
        }

    } catch (error) {
        console.error('❌ Test failed with error:', error);
        return false;
    }
}

// 运行测试
testToolSetInitialization().then(success => {
    console.log(`\n🎯 Test ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});