import { StreamAgent } from '../packages/core/stream-agent.js';
import { createStandardPromptProcessor } from '../packages/core/prompts/prompt-processor-factory.js';
import { OPENAI_MODELS } from '../packages/core/models/index.js';
import { z } from 'zod';
import { createTool } from '../packages/core/utils.js';
import { EventBus } from '../packages/core/event-bus/index.js';
import { logger } from '../packages/core/utils/logger.js';

// 简单的天气工具 - 返回随机温度
const WeatherTool = createTool({
    name: 'get_weather',
    description: 'Get current weather temperature for a city (returns random temperature for testing)',
    inputSchema: z.object({
        city: z.string().describe('The city name to get weather for'),
    }),
    async: true,
    execute: async (params: any) => {
        const city = params.city;
        // 为测试设置固定的温度值
        const temperatures: { [key: string]: number } = {
            '北京': 15,
            '上海': 22,
            'Beijing': 15,
            'Shanghai': 22
        };
        
        const temperature = temperatures[city] || Math.floor(Math.random() * 26) + 10;
        
        console.log(`🌤️  获取 ${city} 天气: ${temperature}°C`);
        
        return {
            success: true,
            result: temperature,
        };
    }
});

// 简单的计算工具
const SubTool = createTool({
    name: 'sub',
    description: 'Perform subtraction mathematical calculations(a - b)',
    inputSchema: z.object({
        a: z.number().describe('第一个数字'),
        b: z.number().describe('第二个数字')
    }),
    async: true,
    execute: async (params: any) => {
        try {
          console.log(`🧮 计算工具接收原始参数:`, params);
          
          let result  = params.a - params.b;
          
         
          return {
            success: true,
            result: result,
          };
        } catch (error: any) {
            return {
                success: false,
                error: `计算错误: ${error.message}`
            };
        }
    }
});

// 测试 StreamAgent (流式)
async function testStreamAgent() {
    console.log('🧪 测试 StreamAgent (流式) ...\n');
    
    const eventBus = new EventBus(1000);
    // 创建 StreamAgent 实例
    const promptProcessor = createStandardPromptProcessor('');
    const agent = new StreamAgent(
        'stream-test-agent',
        'Stream Test Agent',
        'Testing streaming agent with tool execution',
        20,
        promptProcessor,
        3, // LogLevel.INFO  
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolExecution: true,
            toolExecutionPriority: 8,
            taskConcurency: 4,
            executionMode: 'auto'
        },
        [], // contexts - 空数组
        eventBus
    );

    // 添加测试工具
    const testToolSet = {
        name: 'test-tools',
        description: 'Test tools for stream agent',
        version: '1.0.0',
        tools: [WeatherTool, SubTool],
        active: true
    };
    
    agent.addToolSet(testToolSet);

    // 检查工具定义
    const activeTools = agent.getActiveTools();
    console.log('\n🔧 活跃工具定义:');
    activeTools.forEach(tool => {
        console.log(`\n工具: ${tool.name}`);
        console.log('参数 schema:', JSON.stringify(tool.params, null, 2));
        console.log('调用参数:', JSON.stringify(tool.toCallParams(), null, 2));
    });
    console.log('\n');

    // 设置事件监控
    const events: any[] = [];
    const streamedTextChunks: string[] = [];
    let finalStep: any = null;
    
    // 订阅流式文本增量事件
    eventBus.subscribe('llm.text.delta', (event: any) => {
        const content = event.data?.content || event.data?.delta || '';
        const stepIndex = event.stepIndex || event.data?.stepIndex || 0;
        const chunkIndex = event.data?.chunkIndex || 0;
        
        streamedTextChunks.push(content);
        events.push({ 
            type: 'llm_text_delta', 
            stepIndex, 
            chunkIndex,
            deltaLength: content.length,
            timestamp: Date.now() 
        });
        // console.log(`📝 接收流式文本 (步骤 ${stepIndex}, chunk ${chunkIndex}): "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
    });
    
    // 订阅LLM文本完成事件
    eventBus.subscribe('llm.text.completed', (event: any) => {
        const content = event.data?.content || event.data?.text || '';
        const stepIndex = event.stepIndex || event.data?.stepIndex || 0;
        const chunkIndex = event.data?.chunkIndex || 0;
        
        events.push({ 
            type: 'llm_text_done', 
            stepIndex, 
            chunkIndex,
            textLength: content.length,
            timestamp: Date.now() 
        });
        console.log(`📝 LLM 文本完成 (步骤 ${stepIndex}): ${content.length} 字符 \n 内容：${content}`);
    });
    
    // 订阅工具执行开始事件
    eventBus.subscribe('tool.execution.started', (event: any) => {
        const toolCall = event.data?.toolCall;
        if (toolCall) {
            events.push({ 
                type: 'tool_execution_start', 
                toolName: toolCall.name,
                timestamp: Date.now() 
            });
            console.log(`🔧 工具执行开始: ${toolCall.name}`);
            console.log(`🔧 工具调用详情:`, JSON.stringify(toolCall, null, 2));
        }
    });
    
    // 订阅工具执行完成事件
    eventBus.subscribe('tool.execution.completed', (event: any) => {
        const result = event.data?.result;
        if (result) {
            events.push({ 
                type: 'tool_execution_end', 
                toolName: result.name,
                status: result.status,
                executionTime: result.executionTime,
                timestamp: Date.now() 
            });
            console.log(`🔧 工具执行完成: ${result.name} (${result.status}) - ${result.executionTime}ms`);
            if (result.result) {
                console.log(`   结果: ${JSON.stringify(result.result, null, 2)}`);
            }
        }
    });
    
    // 订阅Agent步骤完成事件
    eventBus.subscribe('agent.step.completed', (event: any) => {
        const step = event.data?.step;
        if (step) {
            finalStep = step;
            events.push({ 
                type: 'agent_step_complete', 
                stepIndex: step.stepIndex,
                textLength: step.rawText?.length || 0,
                toolCallsCount: step.toolCalls?.length || 0,
                toolExecutionResultsCount: step.toolExecutionResults?.length || 0,
                timestamp: Date.now() 
            });
            console.log(`🔄 Agent 步骤 ${step.stepIndex} 完成:`);
            console.log(`  - 响应文本: ${step.rawText?.length || 0} 字符`);
            console.log(`  - 工具调用: ${step.toolCalls?.length || 0} 个`);
            console.log(`  - 工具执行结果: ${step.toolExecutionResults?.length || 0} 个`);
        }
    });
    
    // 订阅错误事件
    eventBus.subscribe('error.occurred', (event: any) => {
        const error = event.data?.error;
        console.error('❌ Agent 错误:', error);
        events.push({ type: 'error', error: error?.message || error, timestamp: Date.now() });
    });

    // 设置 Agent
    await agent.setup();

    console.log('📊 Agent 配置:');
    console.log(`- Agent 类型: StreamAgent (流式)`);
    console.log(`- 并行工具执行: ${agent.enableParallelToolExecution}`);
    console.log(`- 活跃工具数量: ${agent.getActiveTools().length}`);
    console.log(`- 工具列表: ${agent.getActiveTools().map(t => t.name).join(', ')}`);

    console.log('\n=== 开始测试 StreamAgent ===');
    const startTime = Date.now();

    try {
        // 使用需要工具调用的任务
        await agent.startWithUserInput(
            '请计算北京和上海今天的温差是多少度？先获取两个城市的天气，然后计算温度差。最后请告诉我最终结果',
            5,
            'stream-test-' + Date.now()
        );

        const endTime = Date.now();
        console.log(`\n⏱️  总执行时间: ${endTime - startTime}ms`);

       
        console.log('\n✅ StreamAgent 测试完成!');

    } catch (error) {
        console.error('❌ 测试执行失败:', error);
    }
}

// 运行测试
testStreamAgent().catch(console.error);