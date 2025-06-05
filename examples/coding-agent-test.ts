/**
 * CodingAgent 测试示例
 * 
 * 测试新的架构：
 * - CodingAgent 继承自 BaseAgent
 * - 使用 agents/contexts/coding 中的 coding context
 * - 🆕 使用 interactive context 的 install 函数提供 requestApproval 和 requestUserInput 方法
 * - 验证事件系统和生命周期钩子
 */

import { CodingAgent } from '../src/agents/coding-agent';
import { EventBus } from '../src/core/events/eventBus';
import { LogLevel } from '../src/core/utils/logger';
import { OPENAI_MODELS } from '../src/core/models';
import path from 'path';

async function testCodingAgent() {
    console.log('🚀 Testing CodingAgent with new architecture...');
    
    // 创建事件总线
    const eventBus = new EventBus();
    await eventBus.start();
    
    // 创建工作空间路径
    const workspacePath = path.join(process.cwd(), 'test-workspace');
    
    // 创建 CodingAgent
    const codingAgent = new CodingAgent(
        'coding-agent-test',
        'Test Coding Agent',
        'A test coding agent to verify the new architecture',
        workspacePath,
        5, // maxSteps
        LogLevel.INFO,
        {
            model: OPENAI_MODELS.GPT_4O,
            enableThinkingSystem: true,
            executionMode: 'manual'
        },
        [], // additional contexts
        eventBus
    );
    
    try {
        // 设置 Agent
        console.log('📋 Setting up CodingAgent...');
        await codingAgent.setup();
        
        // 测试工作空间路径
        console.log(`📁 Workspace path: ${codingAgent.getWorkspacePath()}`);
        
        // 测试执行模式
        console.log(`⚙️ Execution mode: ${codingAgent.getExecutionMode()}`);
        
        // 测试思考系统
        console.log(`🧠 Thinking system enabled: ${codingAgent.isThinkingEnabled()}`);
        
        // 测试工具集
        const toolSets = codingAgent.listToolSets();
        console.log(`🔧 Available tool sets: ${toolSets.length}`);
        toolSets.forEach(ts => {
            console.log(`  - ${ts.name}: ${ts.tools.length} tools (active: ${ts.active})`);
        });
        
        // 🆕 测试 interactive context 提供的方法和工具
        console.log('🤝 Testing interactive functionality...');
        
        // 检查 requestApproval 方法是否存在（由 install 函数添加）
        const hasRequestApproval = typeof (codingAgent as any).requestApproval === 'function';
        console.log(`  - requestApproval method available: ${hasRequestApproval}`);
        
        // 检查 requestUserInput 工具是否存在（作为工具提供）
        const allTools = codingAgent.listToolSets()
            .filter(ts => ts.active)
            .flatMap(ts => ts.tools);
        const requestUserInputTool = allTools.find(tool => tool.name === 'request_user_input');
        console.log(`  - request_user_input tool available: ${!!requestUserInputTool}`);
        
        // 检查 interaction_management 工具是否存在
        const interactionManagementTool = allTools.find(tool => tool.name === 'interaction_management');
        console.log(`  - interaction_management tool available: ${!!interactionManagementTool}`);
        
        if (hasRequestApproval && requestUserInputTool && interactionManagementTool) {
            console.log('✅ Interactive functionality successfully configured!');
            console.log('  - requestApproval available as agent method');
            console.log('  - requestUserInput available as tool');
            console.log('  - interaction_management available as tool');
        } else {
            console.log('❌ Some interactive functionality not found');
        }
        
        // 测试事件发布
        console.log('📡 Testing event publishing...');
        await codingAgent.publishEvent('test_event', {
            message: 'Hello from CodingAgent!',
            timestamp: Date.now()
        });
        
        console.log('✅ CodingAgent test completed successfully!');
        
    } catch (error) {
        console.error('❌ CodingAgent test failed:', error);
    } finally {
        // 清理
        await eventBus.stop();
    }
}

// 运行测试
if (require.main === module) {
    testCodingAgent().catch(console.error);
}

export { testCodingAgent }; 