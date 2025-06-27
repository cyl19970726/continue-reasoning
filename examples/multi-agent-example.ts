/**
 * 🎯 多智能体系统示例
 * 
 * 本示例展示了如何使用 Continue Reasoning 的多智能体框架：
 * - 创建不同类型的智能体（编程、研究、写作）
 * - 为智能体注入特定的工具和上下文
 * - 注册智能体到 Hub
 * - 直接任务委托和智能任务委托
 * - 事件监听和系统状态监控
 */

import { 
    MultiAgentBase, 
    SimpleAgentHub, 
    DEFAULT_MULTI_AGENT_CONFIG,
    Task,
    TaskResult
} from '../packages/core/multi-agent';
import { EventBus } from '../packages/core/events/eventBus';
import { logger, LogLevel } from '../packages/core/utils/logger';
import { OPENAI_MODELS } from '../packages/core/models';
import { WebSearchContext, FireCrawlContext, DeepWikiContext } from '../packages/core/contexts';

async function multiAgentExample() {
    console.log('🚀 多智能体系统示例启动...\n');
    
    // ===== 1. 创建事件总线 =====
    
    const eventBus = new EventBus();
    await eventBus.start();
    
    // 订阅多智能体事件
    const subscriptionId = eventBus.subscribe(
        ['multi_agent_task_created', 'multi_agent_task_completed', 'multi_agent_agent_registered'],
        async (event) => {
            console.log(`📢 事件通知: ${event.type}`, event.payload);
        }
    );
    
    // ===== 2. 创建智能体中心 =====
    
    const hub = new SimpleAgentHub(eventBus, {
        ...DEFAULT_MULTI_AGENT_CONFIG,
        logLevel: 'info',
        routing: {
            strategy: 'keyword'
        }
    });
    
    // ===== 3. 创建不同类型的智能体 =====
    
    console.log('🤖 创建智能体（包含专用工具和上下文）...');
    
    // 编程智能体 - 使用基础工具集
    const codingAgent = new MultiAgentBase(
        'coding-agent',
        'AI 编程助手', 
        '专门负责代码生成、调试和代码审查的智能体',
        ['code_generation', 'debugging', 'code_review', 'programming'],
        10, // maxSteps
        {
            maxConcurrentTasks: 2,
            logLevel: LogLevel.INFO,
            agentOptions: {
                model: OPENAI_MODELS.GPT_4O,
                temperature: 0.3, // 较低温度保证代码准确性
                enableParallelToolCalls: true
            }
            // 使用默认的 contexts，包含基础编程工具
        }
    );
    
    // 研究智能体 - 注入网络搜索和信息收集工具
    const researchAgent = new MultiAgentBase(
        'research-agent',
        'AI 研究助手',
        '专门负责信息研究、数据分析和报告生成的智能体', 
        ['research', 'analysis', 'data_collection', 'investigation'],
        10, // maxSteps
        {
            maxConcurrentTasks: 3,
            logLevel: LogLevel.INFO,
            agentOptions: {
                model: OPENAI_MODELS.GPT_4O,
                temperature: 0.5,
                enableParallelToolCalls: true
            },
            contexts: [
                WebSearchContext,   // 🔍 网络搜索能力
                FireCrawlContext,   // 🕷️ 网页爬取能力  
                DeepWikiContext     // 📚 深度知识库查询
            ]
        }
    );
    
    // 写作智能体 - 轻量级配置，专注文本处理
    const writingAgent = new MultiAgentBase(
        'writing-agent', 
        'AI 写作助手',
        '专门负责内容创作、文档编写和文本编辑的智能体',
        ['writing', 'editing', 'content_creation', 'documentation'],
        10, // maxSteps
        {
            maxConcurrentTasks: 1,
            logLevel: LogLevel.INFO,
            agentOptions: {
                model: OPENAI_MODELS.GPT_4O,
                temperature: 0.7, // 🎨 更高的创造性
                enableParallelToolCalls: false
            }
            // 使用默认的基础 contexts，专注文本处理
        }
    );
    
    // ===== 4. 注册智能体 =====
    
    console.log('📝 注册智能体到中心...');
    await hub.registerAgent(codingAgent);
    await hub.registerAgent(researchAgent);
    await hub.registerAgent(writingAgent);
    
    console.log(`✅ 已注册 ${hub.getSystemStatus().totalAgents} 个智能体\n`);
    
    // ===== 5. 展示系统状态 =====
    
    console.log('📊 系统状态:');
    console.log(JSON.stringify(hub.getSystemStatus(), null, 2));
    console.log('\n📋 智能体状态:');
    console.log(JSON.stringify(hub.getAllAgentStatuses(), null, 2));
    console.log('');
    
    // ===== 6. 直接任务委托示例 =====
    
    console.log('🎯 示例 1: 直接任务委托');
    
    try {
        const codeTask = await hub.delegateTask(
            'coding-agent',
            '创建一个计算斐波那契数列的 Python 函数',
            {
                priority: 'high',
                timeout: 60000,
                context: { language: 'python', style: 'recursive' }
            }
        );
        
        console.log('✅ 编程任务完成:', codeTask.status);
        console.log('📝 结果摘要:', codeTask.result?.message);
        
    } catch (error) {
        console.error('❌ 编程任务失败:', error);
    }
    
    console.log('');
    
    // ===== 7. 智能任务委托示例 =====
    
    console.log('🧠 示例 2: 智能任务委托（自动选择最佳智能体）');
    
    const tasks = [
        '研究人工智能在医疗领域的最新应用',
        '编写一个处理JSON数据的JavaScript工具类',
        '撰写一篇关于可持续发展的博客文章',
        '分析当前加密货币市场的发展趋势',
        '创建一个简单的React组件用于显示用户列表'
    ];
    
    const results: TaskResult[] = [];
    
    for (const [index, taskDescription] of tasks.entries()) {
        try {
            console.log(`\n📋 任务 ${index + 1}: ${taskDescription}`);
            
            const result = await hub.smartDelegateTask(taskDescription, {
                priority: 'medium',
                timeout: 30000
            });
            
            results.push(result);
            console.log(`   ✅ 完成 (${result.executionTime}ms) - 智能体: ${result.agentId}`);
            
        } catch (error) {
            console.error(`   ❌ 失败: ${error}`);
        }
    }
    
    // ===== 8. 展示最终统计 =====
    
    console.log('\n📈 最终统计信息:');
    
    const finalStats = hub.getSystemStatus();
    console.log(`- 总智能体数: ${finalStats.totalAgents}`);
    console.log(`- 可用智能体: ${finalStats.availableAgents}`);  
    console.log(`- 已完成任务: ${finalStats.completedTasks}`);
    console.log(`- 失败任务: ${finalStats.failedTasks}`);
    console.log(`- 总处理任务: ${finalStats.totalTasksProcessed}`);
    
    console.log('\n📊 详细 Hub 统计:');
    console.log(JSON.stringify(hub.getHubStats(), null, 2));
    
    // ===== 9. 测试能力匹配 =====
    
    console.log('\n🔍 示例 3: 按能力查找智能体');
    
    const capabilities = ['research', 'code_generation', 'writing'];
    
    for (const capability of capabilities) {
        const agents = hub.findAgentsByCapability(capability);
        console.log(`- 具备 "${capability}" 能力的智能体: ${agents.map(a => a.id).join(', ')}`);
    }
    
    // ===== 10. 测试系统容错 =====
    
    console.log('\n🛡️ 示例 4: 错误处理测试');
    
    try {
        await hub.delegateTask('nonexistent-agent', '这个任务会失败');
    } catch (error) {
        console.log(`✅ 正确捕获错误: ${error}`);
    }
    
    try {
        await hub.smartDelegateTask('这是一个没有合适智能体的任务', { 
            priority: 'medium',
            requiredCapability: 'nonexistent_capability' 
        });
    } catch (error) {
        console.log(`✅ 正确捕获错误: ${error}`);
    }
    
    // ===== 11. 清理资源 =====
    
    console.log('\n🧹 清理资源...');
    
    // 取消事件订阅
    eventBus.unsubscribe(subscriptionId);
    
    // 停止事件总线
    await eventBus.stop();
    
    console.log('✅ 多智能体示例完成！');
}

// ===== 高级示例: 自定义智能体 =====

class CustomDataAnalystAgent extends MultiAgentBase {
    constructor() {
        super(
            'data-analyst',
            '数据分析专家',
            '专门处理数据分析、统计计算和数据可视化任务',
            ['data_analysis', 'statistics', 'visualization', 'sql'],
            10, // maxSteps
            {
                maxConcurrentTasks: 1,
                logLevel: LogLevel.INFO,
                agentOptions: {
                    model: OPENAI_MODELS.GPT_4O,
                    temperature: 0.4, // 平衡准确性和创造性
                    enableParallelToolCalls: true
                },
                contexts: [
                    WebSearchContext,   // 🔍 数据搜索能力
                    FireCrawlContext    // 🕷️ 数据采集能力
                ]
            }
        );
    }
    
    // 重写任务处理能力判断
    canHandleTask(task: Task): boolean {
        const description = task.description.toLowerCase();
        
        // 数据相关关键词
        const dataKeywords = ['数据', 'data', '分析', 'analysis', '统计', 'statistics', 
                             'sql', '图表', 'chart', '可视化', 'visualization'];
        
        const hasDataKeyword = dataKeywords.some(keyword => 
            description.includes(keyword)
        );
        
        return hasDataKeyword && super.canHandleTask(task);
    }
}

async function advancedExample() {
    console.log('\n🎯 高级示例: 自定义智能体');
    
    const eventBus = new EventBus();
    await eventBus.start();
    
    const hub = new SimpleAgentHub(eventBus);
    
    // 注册自定义智能体
    const dataAnalyst = new CustomDataAnalystAgent();
    await hub.registerAgent(dataAnalyst);
    
    // 测试自定义能力匹配
    const dataTasks = [
        '分析用户行为数据并生成报告',
        '创建销售数据的可视化图表',
        '编写Python爬虫程序', // 这个不应该被数据分析师处理
        '使用SQL查询数据库中的客户信息'
    ];
    
    for (const taskDesc of dataTasks) {
        try {
            const result = await hub.smartDelegateTask(taskDesc);
            console.log(`✅ "${taskDesc}" -> ${result.agentId}`);
        } catch (error) {
            console.log(`❌ "${taskDesc}" -> 无合适智能体`);
        }
    }
    
    await eventBus.stop();
}

// ===== 运行示例 =====

if (require.main === module) {
    multiAgentExample()
        .then(() => multiAgentExample())
        .catch(console.error);
}

export { multiAgentExample, advancedExample }; 