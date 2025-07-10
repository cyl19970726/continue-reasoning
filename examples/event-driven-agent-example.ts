import { 
    AgentFactory, 
    AgentMode, 
    type AgentFactoryConfig,
    StreamAgent,
    AsyncAgent,
    SessionManager,
    EventBus,
    LogLevel
} from '../packages/core/index.js';
import { StandardPromptProcessor } from '../packages/core/prompts/index.js';

/**
 * 事件驱动架构使用示例
 * 展示如何使用AgentFactory创建和管理事件驱动的Agent
 */
async function demonstrateEventDrivenArchitecture() {
    console.log('🚀 Event-Driven Architecture Demo');
    
    // 1. 创建事件总线
    const eventBus = new EventBus();
    console.log('✅ Created EventBus');
    
    // 2. 设置事件监听（演示事件系统）
    setupEventListeners(eventBus);
    
    // 3. 模拟LLM（支持两种调用模式）
    const mockLLM = createMockLLM();
    
    // 4. 检查LLM能力
    const capabilities = AgentFactory.checkLLMCapabilities(mockLLM);
    console.log('🔍 LLM Capabilities:', capabilities);
    
    // 5. 创建PromptProcessor
    const promptProcessor = new StandardPromptProcessor('coding-assistant');
    
    // 6. 创建Agent配置
    const agentConfig: AgentFactoryConfig = {
        id: 'demo-agent-v2',
        name: 'Demo Agent V2',
        description: 'Event-driven demo agent',
        maxSteps: 3,
        promptProcessor,
        logLevel: LogLevel.INFO,
        agentOptions: {
            model: 'gpt-4o' as any,
            enableParallelToolCalls: true,
            temperature: 0.7
        },
        contexts: [],
        llm: mockLLM,
        eventBus
    };
    
    // 7. 演示不同的Agent创建方式
    await demonstrateAgentCreation(agentConfig);
    
    // 8. 演示SessionManager V2
    await demonstrateSessionManagerV2(agentConfig, eventBus);
    
    console.log('✨ V2 Architecture Demo Complete!');
}

/**
 * 设置事件监听器
 */
function setupEventListeners(eventBus: EventBus) {
    console.log('📡 Setting up event listeners...');
    
    // 监听会话事件
    eventBus.subscribe(['session.started', 'session.ended'], (event) => {
        console.log(`🔄 Session Event: ${event.type} - ${event.sessionId}`);
    });
    
    // 监听Agent步骤事件
    eventBus.subscribe(['agent.step.started', 'agent.step.completed', 'agent.step.failed'], (event) => {
        console.log(`🤖 Agent Event: ${event.type} - Step ${event.stepIndex}`);
    });
    
    // 监听LLM事件
    eventBus.subscribe([
        'llm.call.started', 
        'llm.call.completed', 
        'llm.text.delta', 
        'llm.text.completed'
    ], (event) => {
        console.log(`🧠 LLM Event: ${event.type} - Step ${event.stepIndex}`);
    });
    
    // 监听工具执行事件
    eventBus.subscribe([
        'tool.execution.started', 
        'tool.execution.completed', 
        'tool.execution.failed'
    ], (event) => {
        console.log(`🔧 Tool Event: ${event.type} - Step ${event.stepIndex}`);
    });
    
    // 监听错误事件
    eventBus.subscribe('error.occurred', (event) => {
        if (event.data && 'error' in event.data) {
            console.log(`❌ Error Event: ${event.data.error}`);
        }
    });
}

/**
 * 演示Agent创建的不同方式
 */
async function demonstrateAgentCreation(config: AgentFactoryConfig) {
    console.log('\n📦 Demonstrating Agent Creation...');
    
    try {
        // 1. 自动模式（推荐）
        console.log('1️⃣ Creating Auto Agent...');
        const autoAgent = AgentFactory.createAutoAgent(config);
        console.log(`✅ Auto Agent Created: ${autoAgent.constructor.name}`);
        
        // 2. 指定流式模式
        console.log('2️⃣ Creating Stream Agent...');
        const streamAgent = AgentFactory.createStreamAgent(config);
        console.log(`✅ Stream Agent Created: ${streamAgent.constructor.name}`);
        
        // 3. 指定异步模式
        console.log('3️⃣ Creating Async Agent...');
        const asyncAgent = AgentFactory.createAsyncAgent(config);
        console.log(`✅ Async Agent Created: ${asyncAgent.constructor.name}`);
        
        // 4. 通过工厂方法指定模式
        console.log('4️⃣ Creating Agent with explicit mode...');
        const explicitAgent = AgentFactory.createAgent({
            ...config,
            mode: AgentMode.STREAMING
        });
        console.log(`✅ Explicit Agent Created: ${explicitAgent.constructor.name}`);
        
    } catch (error) {
        console.error('❌ Agent Creation Error:', error);
    }
}

/**
 * 演示SessionManager V2
 */
async function demonstrateSessionManagerV2(config: AgentFactoryConfig, eventBus: EventBus) {
    console.log('\n📋 Demonstrating SessionManager V2...');
    
    try {
        // 创建Agent
        const agent = AgentFactory.createAutoAgent(config);
        
        // 创建模拟Client
        const mockClient = createMockClient();
        
        // 创建SessionManager
        const sessionManager = new SessionManager(mockClient, agent, eventBus);
        console.log('✅ SessionManager Created');
        
        // 创建会话
        const sessionId = sessionManager.createSession('user123', agent.id);
        console.log(`✅ Session Created: ${sessionId}`);
        
        // 模拟会话操作
        await sessionManager.switchSession(sessionId);
        console.log('✅ Session Switched');
        
        // 获取会话统计
        const stats = await sessionManager.getSessionStats();
        console.log('📊 Session Stats:', stats);
        
        // 清理
        sessionManager.dispose();
        console.log('✅ SessionManager Disposed');
        
    } catch (error) {
        console.error('❌ SessionManager Demo Error:', error);
    }
}

/**
 * 创建模拟LLM（支持两种调用模式）
 */
function createMockLLM() {
    return {
        // 流式调用支持
        async *callStream(prompt: string, toolDefs: any[], options?: any) {
            yield { type: 'step-start', stepIndex: options?.stepIndex || 0 };
            yield { type: 'text-delta', content: 'Hello ', chunkIndex: 0 };
            yield { type: 'text-delta', content: 'from ', chunkIndex: 1 };
            yield { type: 'text-delta', content: 'V2 ', chunkIndex: 2 };
            yield { type: 'text-delta', content: 'Architecture!', chunkIndex: 3 };
            yield { type: 'text-done', content: 'Hello from V2 Architecture!' };
            yield { type: 'step-complete', result: { text: 'Hello from V2 Architecture!' } };
        },
        
        // 异步调用支持
        async callAsync(prompt: string, toolDefs: any[], options?: any) {
            // 模拟异步延迟
            await new Promise(resolve => setTimeout(resolve, 100));
            return {
                text: 'Hello from V2 Architecture (Async)!',
                toolCalls: []
            };
        },
        
        // 其他必要属性
        modelName: 'mock-model',
        temperature: 0.7,
        maxTokens: 2048
    };
}

/**
 * 创建模拟Client
 */
function createMockClient() {
    return {
        name: 'MockClient',
        type: 'demo' as any,
        isConnected: true,
        
        sendMessage: async (message: string) => {
            console.log(`📤 Client sending: ${message}`);
        },
        
        onMessage: (callback: (message: string) => void) => {
            // 模拟客户端消息处理
        },
        
        disconnect: () => {
            console.log('📴 Client disconnected');
        },
        
        setSessionManager: (sessionManager: any) => {
            // 模拟设置session manager
        },
        
        newSession: async () => {
            return 'mock-session-id';
        },
        
        switchSession: async (sessionId: string) => {
            console.log(`🔄 Switching to session: ${sessionId}`);
        },
        
        endSession: async () => {
            console.log('🔚 Ending session');
        }
    } as any; // 使用类型断言简化mock实现
}

// 如果直接运行此文件，执行演示
if (import.meta.url === `file://${process.argv[1]}`) {
    demonstrateEventDrivenArchitecture()
        .then(() => {
            console.log('✅ Demo completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('❌ Demo failed:', error);
            process.exit(1);
        });
}

export { demonstrateEventDrivenArchitecture }; 