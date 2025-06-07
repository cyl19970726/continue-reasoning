import { InteractionHub } from '../src/core/hub/interaction-hub';
import { CodingAgent } from '../src/agents/coding-agent';
import { createThinkingContext } from '../src/core/thinking/thinking-context';
import { globalEventBus } from '../src/core/events/eventBus';
import { logger, LogLevel } from '../src/core/utils/logger';
import { OPENAI_MODELS } from '../src/core/models';
import path from 'path';
import fs from 'fs';

/**
 * 🎯 HHH-AGI 新架构演示
 * 
 * 展示组件关系：
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    InteractionHub                           │
 * │                    (协调中心)                               │
 * │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
 * │  │ CodingAgent │  │   Global    │  │  InteractiveLayer   │  │
 * │  │  (编程专家)  │  │  EventBus   │   │   (用户界面层)      │  │
 * │  │             │  │  (事件总线) │    │                     │  │
 * │  └─────────────┘  └─────────────┘  └─────────────────────┘  │
 * └─────────────────────────────────────────────────────────────┘
 */
async function demonstrateNewArchitecture() {
    console.log('🏗️ HHH-AGI New Architecture Demonstration\n');
    console.log('This demo showcases the improved separation of concerns:');
    console.log('- BaseAgent: Core agent functionality');
    console.log('- CodingAgent: Specialized coding capabilities');
    console.log('- InteractionHub: System coordination');
    console.log('- EventBus: Event-driven communication\n');

    // ═══════════════════════════════════════════════════════════
    // 1. 🚀 初始化核心组件
    // ═══════════════════════════════════════════════════════════

    console.log('🔧 Initializing core components...');
    
    // 创建交互中心
    const hub = new InteractionHub(globalEventBus);
    
    // 创建工作空间
    const workspacePath = path.join(process.cwd(), 'architecture-demo-workspace');
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
        console.log(`📁 Created workspace: ${workspacePath}`);
    }

    // ═══════════════════════════════════════════════════════════
    // 2. 🤖 创建专业化Agent
    // ═══════════════════════════════════════════════════════════

    console.log('\n🤖 Creating specialized agents...');
    
    // 创建thinking context
    const thinkingContext = createThinkingContext(logger, globalEventBus);

    // 创建编程专用Agent
    const codingAgent = new CodingAgent(
        'demo-coding-agent',
        'Architecture Demo Coding Agent',
        'Specialized coding agent demonstrating the new architecture',
        workspacePath,
        15, // maxSteps
        LogLevel.INFO,
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolCalls: false,
            temperature: 0.3,
            enableThinkingSystem: true,
            thinkingOptions: {
                maxConversationHistory: 8,
                maxExecutionHistory: 4
            }
        },
        [thinkingContext],
        globalEventBus
    );

    console.log(`✅ CodingAgent created: ${codingAgent.name}`);
    console.log(`📂 Workspace: ${codingAgent.getWorkspacePath()}`);

    // ═══════════════════════════════════════════════════════════
    // 3. 🔌 注册组件到协调中心
    // ═══════════════════════════════════════════════════════════

    console.log('\n🔌 Registering components with InteractionHub...');
    
    // 注册Agent
    await hub.registerAgent(codingAgent);
    console.log('✅ CodingAgent registered with hub');

    // 可以在这里注册更多的InteractiveLayer
    // hub.registerInteractiveLayer(cliLayer);
    // hub.registerInteractiveLayer(webUILayer);

    // ═══════════════════════════════════════════════════════════
    // 4. 🚀 启动系统
    // ═══════════════════════════════════════════════════════════

    console.log('\n🚀 Starting the system...');
    
    try {
        await hub.start();
        console.log('✅ InteractionHub started successfully');

        // 设置Agent
        await codingAgent.setup();
        console.log('✅ CodingAgent setup completed');

        // ═══════════════════════════════════════════════════════════
        // 5. 📊 系统状态监控
        // ═══════════════════════════════════════════════════════════

        console.log('\n📊 System Status:');
        const systemStatus = hub.getSystemStatus();
        console.log(`   🤖 Agents: ${systemStatus.agents.length}`);
        console.log(`   🖥️  Interactive Layers: ${systemStatus.interactiveLayers.length}`);
        console.log(`   📈 EventBus Stats:`, systemStatus.eventBusStatus);

        const healthCheck = hub.checkHealth();
        console.log(`   🏥 System Health: ${healthCheck.status}`);
        console.log(`   ℹ️  Details:`, healthCheck.details);

        // ═══════════════════════════════════════════════════════════
        // 6. 🔄 演示事件驱动通信
        // ═══════════════════════════════════════════════════════════

        console.log('\n🔄 Demonstrating event-driven communication...');

        // 设置事件监听
        const eventCounts = {
            thinking: 0,
            codeChange: 0,
            workspaceChange: 0,
            projectInit: 0
        };

        globalEventBus.subscribe('agent_thinking', async (event) => {
            eventCounts.thinking++;
            console.log(`🧠 Thinking event #${eventCounts.thinking}: Step ${event.payload.stepNumber}`);
        });

        globalEventBus.subscribe('code_change', async (event) => {
            eventCounts.codeChange++;
            console.log(`📝 Code change event #${eventCounts.codeChange}: ${event.payload.toolName}`);
        });

        globalEventBus.subscribe('workspace_change', async (event) => {
            eventCounts.workspaceChange++;
            console.log(`📁 Workspace change event #${eventCounts.workspaceChange}`);
        });

        globalEventBus.subscribe('project_initialized', async (event) => {
            eventCounts.projectInit++;
            console.log(`🎉 Project initialized event #${eventCounts.projectInit}: ${event.payload.projectType}`);
        });

        // ═══════════════════════════════════════════════════════════
        // 7. 🚀 执行编程任务
        // ═══════════════════════════════════════════════════════════

        console.log('\n🚀 Executing coding task...');

        const task = `Create a complete TypeScript project for a simple task management CLI tool with the following features:

1. **Project Setup**: Initialize a TypeScript project with proper configuration
2. **Core Classes**: Create Task, TaskManager, and CLI interface classes
3. **Features**: Add, list, complete, and delete tasks functionality
4. **Data Storage**: Use JSON file for persistence
5. **CLI Interface**: Command-line argument parsing and user-friendly output
6. **Testing**: Include unit tests for core functionality
7. **Documentation**: Create README with usage examples

Please implement this step by step with proper TypeScript types and error handling.`;

        // 启动任务处理
        const startTime = Date.now();
        
        await codingAgent.startWithUserInput(task, 15, {
            savePromptPerStep: true,
            promptSaveDir: './architecture-demo-prompts',
            promptSaveFormat: 'both'
        });

        const endTime = Date.now();
        const executionTime = (endTime - startTime) / 1000;

        // ═══════════════════════════════════════════════════════════
        // 8. 📈 结果分析
        // ═══════════════════════════════════════════════════════════

        console.log('\n📈 Execution Results:');
        console.log(`   ⏱️  Execution Time: ${executionTime.toFixed(2)} seconds`);
        console.log(`   🧠 Thinking Events: ${eventCounts.thinking}`);
        console.log(`   📝 Code Changes: ${eventCounts.codeChange}`);
        console.log(`   📁 Workspace Changes: ${eventCounts.workspaceChange}`);
        console.log(`   🎉 Project Initializations: ${eventCounts.projectInit}`);

        // Agent统计
        const thinkingStats = codingAgent.getThinkingStats();
        if (thinkingStats && !thinkingStats.error) {
            console.log('\n🧠 Thinking System Performance:');
            console.log(`   📊 Total Steps: ${thinkingStats.execution?.totalSteps || 0}`);
            console.log(`   💬 Conversation Messages: ${thinkingStats.conversation?.totalMessages || 0}`);
        }

        // 工作空间分析
        console.log('\n📂 Workspace Analysis:');
        try {
            const files = fs.readdirSync(workspacePath);
            console.log(`   📄 Files Created: ${files.length}`);
            
            const projectStructure = analyzeProjectStructure(workspacePath);
            console.log('   🏗️  Project Structure:');
            console.log(projectStructure);
            
        } catch (error) {
            console.log(`   ⚠️  Error analyzing workspace: ${error}`);
        }

        // ═══════════════════════════════════════════════════════════
        // 9. 🎯 架构优势展示
        // ═══════════════════════════════════════════════════════════

        console.log('\n🎯 Architecture Benefits Demonstrated:');
        console.log('   ✅ Separation of Concerns: BaseAgent vs CodingAgent');
        console.log('   ✅ Event-Driven Communication: Decoupled components');
        console.log('   ✅ Centralized Coordination: InteractionHub management');
        console.log('   ✅ Specialized Functionality: Coding-specific features');
        console.log('   ✅ Standardized Interfaces: IAgent, IInteractionHub');
        console.log('   ✅ Real-time Monitoring: System health and events');
        console.log('   ✅ Extensible Design: Easy to add new agent types');

        // ═══════════════════════════════════════════════════════════
        // 10. 🧹 清理资源
        // ═══════════════════════════════════════════════════════════

        console.log('\n🧹 Cleaning up...');
        await hub.stop();
        console.log('✅ System shutdown completed');

    } catch (error) {
        console.error('❌ Error during demonstration:', error);
        await hub.stop();
    }
}

/**
 * 分析项目结构
 */
function analyzeProjectStructure(dir: string, prefix: string = '', maxDepth: number = 3): string {
    if (maxDepth <= 0) return '';
    
    try {
        const files = fs.readdirSync(dir).sort();
        let result = '';
        
        files.forEach((file, index) => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            const isLast = index === files.length - 1;
            const connector = isLast ? '└──' : '├──';
            
            if (stats.isDirectory()) {
                result += `${prefix}${connector} 📁 ${file}/\n`;
                const newPrefix = prefix + (isLast ? '    ' : '│   ');
                result += analyzeProjectStructure(filePath, newPrefix, maxDepth - 1);
            } else {
                const sizeKB = (stats.size / 1024).toFixed(1);
                let icon = '📄';
                const ext = path.extname(file);
                
                if (ext === '.ts') icon = '📘';
                else if (ext === '.js') icon = '📙';
                else if (ext === '.json') icon = '⚙️';
                else if (ext === '.md') icon = '📖';
                
                result += `${prefix}${connector} ${icon} ${file} (${sizeKB} KB)\n`;
            }
        });
        
        return result;
    } catch (error) {
        return `${prefix}❌ Error reading directory\n`;
    }
}

// 运行演示
if (require.main === module) {
    demonstrateNewArchitecture()
        .then(() => {
            console.log('\n🎉 Architecture demonstration completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Demonstration failed:', error);
            process.exit(1);
        });
}

export { demonstrateNewArchitecture }; 