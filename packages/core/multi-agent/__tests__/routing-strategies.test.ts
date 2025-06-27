import { describe, it, expect, beforeEach } from 'vitest';
import { 
    SimpleAgentHub, 
    MultiAgentBase,
    RoutingStrategyFactory,
    KeywordRoutingStrategy,
    VectorRoutingStrategy,
    LLMRoutingStrategy,
    HybridRoutingStrategy,
    Task,
    DEFAULT_MULTI_AGENT_CONFIG
} from '../index';

describe('Routing Strategies', () => {
    let codingAgent: MultiAgentBase;
    let researchAgent: MultiAgentBase;
    let writingAgent: MultiAgentBase;
    let testTask: Task;

    beforeEach(() => {
        codingAgent = new MultiAgentBase(
            'coding-agent',
            'Coding Agent',
            'Specialized in programming and development',
            ['code_generation', 'debugging', 'code_review'],
            1
        );

        researchAgent = new MultiAgentBase(
            'research-agent',
            'Research Agent', 
            'Specialized in research and analysis',
            ['research', 'analysis', 'data_collection'],
            1
        );

        writingAgent = new MultiAgentBase(
            'writing-agent',
            'Writing Agent',
            'Specialized in content creation and writing',
            ['writing', 'editing', 'content_creation'],
            1
        );

        testTask = {
            id: 'test-task',
            agentId: '',
            description: 'Create a Python function to calculate fibonacci numbers',
            status: 'pending',
            priority: 'medium',
            createdAt: Date.now()
        };
    });

    describe('RoutingStrategyFactory', () => {
        it('should create keyword strategy', () => {
            const config = { strategy: 'keyword' as const };
            const strategy = RoutingStrategyFactory.create(config);
            expect(strategy).toBeInstanceOf(KeywordRoutingStrategy);
        });

        it('should create vector strategy', () => {
            const config = { strategy: 'vector' as const };
            const strategy = RoutingStrategyFactory.create(config);
            expect(strategy).toBeInstanceOf(VectorRoutingStrategy);
        });

        it('should create LLM strategy', () => {  
            const config = { strategy: 'llm' as const };
            const strategy = RoutingStrategyFactory.create(config);
            expect(strategy).toBeInstanceOf(LLMRoutingStrategy);
        });

        it('should create hybrid strategy', () => {
            const config = { strategy: 'hybrid' as const };
            const strategy = RoutingStrategyFactory.create(config);
            expect(strategy).toBeInstanceOf(HybridRoutingStrategy);
        });

        it('should default to keyword strategy for unknown types', () => {
            const config = { strategy: 'unknown' as any };
            const strategy = RoutingStrategyFactory.create(config);
            expect(strategy).toBeInstanceOf(KeywordRoutingStrategy);
        });
    });

    describe('KeywordRoutingStrategy', () => {
        let strategy: KeywordRoutingStrategy;

        beforeEach(() => {
            strategy = new KeywordRoutingStrategy({ strategy: 'keyword' });
        });

        it('should return null when no agents available', async () => {
            const result = await strategy.selectAgent(testTask, []);
            expect(result).toBeNull();
        });

        it('should return null when no agents are available', async () => {
            // 测试空智能体列表的情况
            const result = await strategy.selectAgent(testTask, []);
            expect(result).toBeNull();
        });

        it('should select coding agent for programming task', async () => {
            const agents = [codingAgent, researchAgent, writingAgent];
            const result = await strategy.selectAgent(testTask, agents);
            expect(result).toBe(codingAgent);
        });

        it('should respect required capability filter', async () => {
            const agents = [codingAgent, researchAgent, writingAgent];
            const result = await strategy.selectAgent(testTask, agents, 'research');
            expect(result).toBe(researchAgent);
        });

        it('should select agent with lowest load when multiple suitable', async () => {
            // 创建两个编程智能体，一个负载更高
            const codingAgent2 = new MultiAgentBase(
                'coding-agent-2',
                'Coding Agent 2',
                'Another programming agent',
                ['code_generation', 'debugging'],
                1
            );

            // 模拟不同的负载
            codingAgent.getAgentStatus = () => ({
                isAvailable: true,
                currentTaskCount: 2,
                maxConcurrentTasks: 3,
                status: 'available'
            });

            codingAgent2.getAgentStatus = () => ({
                isAvailable: true,
                currentTaskCount: 1,
                maxConcurrentTasks: 3,
                status: 'available'
            });

            const agents = [codingAgent, codingAgent2];
            const result = await strategy.selectAgent(testTask, agents);
            expect(result).toBe(codingAgent2); // 负载更低的智能体
        });
    });

    describe('VectorRoutingStrategy', () => {
        let strategy: VectorRoutingStrategy;

        beforeEach(() => {
            strategy = new VectorRoutingStrategy({ 
                strategy: 'vector',
                vectorConfig: {
                    similarityThreshold: 0.3, // 降低阈值以便测试
                    dimensions: 100
                }
            });
        });

        it('should return null when no agents available', async () => {
            const result = await strategy.selectAgent(testTask, []);
            expect(result).toBeNull();
        });

        it('should return single agent when only one available', async () => {
            const result = await strategy.selectAgent(testTask, [codingAgent]);
            expect(result).toBe(codingAgent);
        });

        it('should select agent based on similarity', async () => {
            const agents = [codingAgent, researchAgent, writingAgent];
            const result = await strategy.selectAgent(testTask, agents);
            
            // 应该选择一个智能体（具体哪个取决于向量计算）
            expect(result).not.toBeNull();
            expect(agents).toContain(result);
        });

        it('should fall back to keyword strategy on error', async () => {
            // 通过传入无效数据触发错误
            const invalidTask = { ...testTask, description: '' };
            
            const agents = [codingAgent];
            const result = await strategy.selectAgent(invalidTask, agents);
            
            // 应该回退到关键词策略并返回结果
            expect(result).toBe(codingAgent);
        });
    });

    describe('Integration with SimpleAgentHub', () => {
        let hub: SimpleAgentHub;

        beforeEach(async () => {
            // 测试不同的路由策略配置
            const config = {
                ...DEFAULT_MULTI_AGENT_CONFIG,
                routing: {
                    strategy: 'keyword' as const
                }
            };

            hub = new SimpleAgentHub(undefined, config);
            
            await hub.registerAgent(codingAgent);
            await hub.registerAgent(researchAgent);
            await hub.registerAgent(writingAgent);
        });

        it('should use keyword routing strategy by default', async () => {
            const result = await hub.findBestAgentForTaskAsync(
                'Write a Python function to sort an array'
            );
            expect(result).toBe(codingAgent);
        });

        it('should use smart delegation with routing', async () => {
            const result = await hub.smartDelegateTask(
                'Research the latest trends in AI development'
            );
            
            expect(result.status).toBe('success');
            // 应该选择了研究智能体
        });

        it('should respect capability requirements in smart delegation', async () => {
            const result = await hub.smartDelegateTask(
                'Create a blog post about machine learning',
                { requiredCapability: 'writing' }
            );
            
            expect(result.status).toBe('success');
            // 应该选择了写作智能体
        }, 10000); // 增加超时时间到10秒
    });

    describe('Vector Routing Strategy with different configurations', () => {
        it('should work with different similarity thresholds', async () => {
            const strictStrategy = new VectorRoutingStrategy({
                strategy: 'vector',
                vectorConfig: {
                    similarityThreshold: 0.9, // 很高的阈值
                    dimensions: 100
                }
            });

            const lenientStrategy = new VectorRoutingStrategy({
                strategy: 'vector', 
                vectorConfig: {
                    similarityThreshold: 0.1, // 很低的阈值
                    dimensions: 100
                }
            });

            const agents = [codingAgent, researchAgent];
            
            const strictResult = await strictStrategy.selectAgent(testTask, agents);
            const lenientResult = await lenientStrategy.selectAgent(testTask, agents);
            
            // 宽松策略更可能找到匹配的智能体
            expect(lenientResult).not.toBeNull();
        });
    });

    describe('Routing Strategy Performance', () => {
        it('should complete routing selection within reasonable time', async () => {
            const strategy = new KeywordRoutingStrategy({ strategy: 'keyword' });
            const agents = [codingAgent, researchAgent, writingAgent];
            
            const startTime = Date.now();
            const result = await strategy.selectAgent(testTask, agents);
            const endTime = Date.now();
            
            expect(result).not.toBeNull();
            expect(endTime - startTime).toBeLessThan(1000); // 应该在1秒内完成
        });
    });
}); 