import { AsyncAgent } from '../packages/core/async-agent';
import { createStandardPromptProcessor } from '../packages/core/prompts/prompt-processor-factory';
import { OPENAI_MODELS } from '../packages/core/models';
import { z } from 'zod';
import { createTool } from '../packages/core/utils';
import { EventBus } from '../packages/core/event-bus';

// 简单的天气工具 - 返回随机温度
const WeatherTool = createTool({
    name: 'get_weather',
    description: 'Get current weather temperature for a city (returns random temperature for testing)',
    inputSchema: z.object({
        city: z.string().describe('The city name to get weather for'),
    }),
    outputSchema: z.object({
        success: z.boolean(),
        result: z.object({
            city: z.string(),
            temperature: z.number(),
            unit: z.string(),
            description: z.string()
        }).optional(),
        error: z.string().optional()
    }),
    async: true,
    execute: async ({ city }: { city: string }) => {
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
            result: {
                city,
                temperature,
                unit: 'celsius',
                description: `${city}今天气温为${temperature}度`
            }
        };
    }
});

// 简单的计算工具
const CalculationTool = createTool({
    name: 'calculate',
    description: 'Perform basic mathematical calculations',
    inputSchema: z.object({
        expression: z.string().describe('Mathematical expression to calculate (e.g., "25 - 18")'),
        description: z.string().optional().describe('Description of what is being calculated')
    }),
    outputSchema: z.object({
        success: z.boolean(),
        result: z.object({
            expression: z.string(),
            result: z.number(),
            description: z.string()
        }).optional(),
        error: z.string().optional()
    }),
    async: true,
    execute: async ({ expression, description }: { expression: string; description?: string }) => {
        try {
            // 简单的数学表达式计算（只支持基本运算）
            const result = eval(expression.replace(/[^0-9+\-*/().\s]/g, ''));
            
            console.log(`🧮 计算 "${expression}" = ${result} ${description ? `(${description})` : ''}`);
            
            return {
                success: true,
                result: {
                    expression,
                    result,
                    description: description || `计算结果: ${expression} = ${result}`
                }
            };
        } catch (error) {
            console.error(`❌ 计算错误: ${expression}`, error);
            return {
                success: false,
                error: `无法计算表达式: ${expression}`
            };
        }
    }
});

// 测试 NoStreamAgent (非流式)
async function testNoStreamAgent() {
    console.log('🧪 测试 NoStreamAgent (非流式) ...\n');
    let eventBus = new EventBus(100);
    // 创建 NoStreamAgent 实例
    const promptProcessor = createStandardPromptProcessor('');
    const agent = new AsyncAgent(
        'no-stream-test-agent',
        'No Stream Test Agent',
        'Testing non-streaming agent with tool execution',
        3,
        promptProcessor,
        2, // LogLevel.INFO  
        {
            model: OPENAI_MODELS.GPT_4O_MINI,
            enableParallelToolExecution: true,
            toolExecutionPriority: 8,
            taskConcurency: 4,
            executionMode: 'auto'
        },
        eventBus,

    );

    // 添加测试工具
    const testToolSet = {
        name: 'test-tools',
        description: 'Test tools for no-stream agent',
        version: '1.0.0',
        tools: [WeatherTool, CalculationTool],
        active: true
    };
    
    agent.addToolSet(testToolSet);

    // 设置事件监听器
    const events: any[] = [];
    let finalStep: any = null;
    
    // 监听工具执行相关事件
    agent.eventBus.subscribe('tool.execution.started', (event) => {
        const toolCall = (event as any).data?.toolCall;
        events.push({ 
            type: 'tool_execution_start', 
            toolName: toolCall?.name,
            toolCall: toolCall,
            timestamp: Date.now() 
        });
        console.log(`🔧 工具执行开始: ${toolCall?.name}`);
        console.log(`🔧 工具调用详情: ${JSON.stringify(toolCall, null, 2)}`);
    });
    
    agent.eventBus.subscribe('tool.execution.completed', (event) => {
        const result = (event as any).data?.result;
        events.push({ 
            type: 'tool_execution_end', 
            toolName: result?.name,
            status: result?.status,
            executionTime: result?.executionTime,
            timestamp: Date.now() 
        });
        console.log(`🔧 工具执行完成: ${result?.name} (${result?.status}) - ${result?.executionTime}ms`);
        if (result?.result) {
            console.log(`   结果: ${JSON.stringify(result.result, null, 2)}`);
        }
    });
    
    agent.eventBus.subscribe('llm.text.completed', (event) => {
        const text = (event as any).data?.text;
        events.push({ 
            type: 'llm_text_done', 
            stepIndex: event.stepIndex,
            textLength: text?.length || 0,
            timestamp: Date.now() 
        });
        console.log(`📝 LLM 文本完成 (步骤 ${event.stepIndex}): ${text?.length || 0} 字符`);
    });
    
    agent.eventBus.subscribe('agent.step.completed', (event) => {
        const step = (event as any).data?.step;
        finalStep = step;
        events.push({ 
            type: 'agent_step_complete', 
            stepIndex: step?.stepIndex,
            textLength: step?.rawText?.length || 0,
            toolCallsCount: step?.toolCalls?.length || 0,
            toolExecutionResultsCount: step?.toolExecutionResults?.length || 0,
            timestamp: Date.now() 
        });
        console.log(`🔄 Agent 步骤 ${step?.stepIndex} 完成:`);
        console.log(`  - 响应文本: ${step?.rawText?.length || 0} 字符`);
        console.log(`  - 工具调用: ${step?.toolCalls?.length || 0} 个`);
        console.log(`  - 工具执行结果: ${step?.toolExecutionResults?.length || 0} 个`);
    });
    
    agent.eventBus.subscribe('error', (event) => {
        console.error('❌ Agent 错误:', (event as any).data);
        events.push({ type: 'error', error: (event as any).data?.message, timestamp: Date.now() });
    });

    // 设置 Agent
    await agent.setup();

    console.log('📊 Agent 配置:');
    console.log(`- Agent 类型: NoStreamAgent (非流式)`);
    console.log(`- 并行工具执行: ${agent.enableParallelToolExecution}`);
    console.log(`- 活跃工具数量: ${agent.getActiveTools().length}`);
    console.log(`- 工具列表: ${agent.getActiveTools().map(t => t.name).join(', ')}`);

    console.log('\n=== 开始测试 NoStreamAgent ===');
    const startTime = Date.now();

    try {
        // 使用需要工具调用的任务
        await agent.startWithUserInput(
            '请计算北京和上海今天的温差是多少度？先获取两个城市的天气，然后计算温度差。',
            2,
            'no-stream-test-' + Date.now()
        );

        const endTime = Date.now();
        console.log(`\n⏱️  总执行时间: ${endTime - startTime}ms`);

        // 分析事件流
        console.log('\n📊 事件分析:');
        const llmTextDeltas = events.filter(e => e.type === 'llm_text_delta');
        const llmTextDone = events.filter(e => e.type === 'llm_text_done');
        const stepTextDone = events.filter(e => e.type === 'step_text_done');
        const toolExecutionStarts = events.filter(e => e.type === 'tool_execution_start');
        const toolExecutionEnds = events.filter(e => e.type === 'tool_execution_end');
        const stepCompletes = events.filter(e => e.type === 'agent_step_complete');

        console.log(`- LLM 文本增量事件: ${llmTextDeltas.length} (应该为0)`);
        console.log(`- LLM 文本完成事件: ${llmTextDone.length}`);
        console.log(`- 步骤文本完成事件: ${stepTextDone.length}`);
        console.log(`- 工具执行开始事件: ${toolExecutionStarts.length}`);
        console.log(`- 工具执行结束事件: ${toolExecutionEnds.length}`);
        console.log(`- 步骤完成事件: ${stepCompletes.length}`);

        // 验证 NoStreamAgent 特性
        console.log('\n🔍 NoStreamAgent 特性验证:');
        
        // 1. 不应该有流式文本事件
        const hasNoStreamingEvents = llmTextDeltas.length === 0;
        console.log(`- 无流式文本事件: ${hasNoStreamingEvents ? '✅ 正确' : '❌ 错误'}`);

        // 2. 应该有完整的文本事件
        const hasCompleteTextEvents = llmTextDone.length > 0 && stepTextDone.length > 0;
        console.log(`- 有完整文本事件: ${hasCompleteTextEvents ? '✅ 正确' : '❌ 错误'}`);

        // 3. 工具执行验证
        const hasToolExecution = toolExecutionStarts.length > 0 && toolExecutionEnds.length === toolExecutionStarts.length;
        console.log(`- 工具执行配对: ${hasToolExecution ? '✅ 正确' : '❌ 错误'} (开始: ${toolExecutionStarts.length}, 结束: ${toolExecutionEnds.length})`);

        // 4. 最终结果验证
        if (finalStep && finalStep.rawText) {
            console.log('\n📝 最终响应:');
            console.log(finalStep.rawText);
            
            // 检查是否包含温差计算结果
            const hasTemperatureDiff = finalStep.rawText.includes('7') || finalStep.rawText.includes('温差');
            console.log(`\n- 包含温差计算: ${hasTemperatureDiff ? '✅ 正确' : '❌ 错误'}`);
        }

        console.log('\n✅ NoStreamAgent 测试完成!');

    } catch (error) {
        console.error('❌ 测试执行失败:', error);
    }
}

// 运行测试
testNoStreamAgent().catch(console.error);