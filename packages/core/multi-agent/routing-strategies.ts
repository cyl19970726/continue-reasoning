import { 
    IMultiAgent, 
    Task, 
    RoutingStrategy, 
    RoutingConfig 
} from '../interfaces/multi-agent';
import { logger } from '../utils/logger';
import { ILLM } from '../interfaces/agent';
import { OpenAIWrapper } from '../models/openai';
import { AnthropicWrapper } from '../models/anthropic';
import { GeminiWrapper } from '../models/gemini';
import { OpenAIChatWrapper } from '../models/openai-chat';

/**
 * 🎯 智能体路由策略接口
 */
export interface IRoutingStrategy {
    selectAgent(
        task: Task, 
        availableAgents: IMultiAgent[], 
        requiredCapability?: string
    ): Promise<IMultiAgent | null>;
}

/**
 * 🎯 关键词匹配策略 (原有实现)
 */
export class KeywordRoutingStrategy implements IRoutingStrategy {
    constructor(private config: RoutingConfig) {}

    async selectAgent(
        task: Task, 
        availableAgents: IMultiAgent[], 
        requiredCapability?: string
    ): Promise<IMultiAgent | null> {
        let candidates = [...availableAgents];
        
        // 过滤可用的智能体
        candidates = candidates.filter(agent => agent.isAvailable());
        
        if (candidates.length === 0) {
            return null;
        }
        
        // 如果指定了特定能力，进行能力匹配
        if (requiredCapability) {
            const capableAgents = candidates.filter(agent => 
                agent.capabilities.includes(requiredCapability)
            );
            if (capableAgents.length > 0) {
                candidates = capableAgents;
            }
        }
        
        // 过滤能处理该任务的智能体
        const suitableAgents = candidates.filter(agent => agent.canHandleTask(task));
        
        if (suitableAgents.length === 0) {
            return null;
        }
        
        // 选择当前任务数最少的智能体
        return suitableAgents.reduce((best, current) => {
            const bestLoad = best.getAgentStatus().currentTaskCount;
            const currentLoad = current.getAgentStatus().currentTaskCount;
            return currentLoad < bestLoad ? current : best;
        });
    }
}

/**
 * 🎯 LLM决策策略
 */
export class LLMRoutingStrategy implements IRoutingStrategy {
    private llm: ILLM;
    
    constructor(private config: RoutingConfig, llm?: ILLM) {
        if (llm) {
            this.llm = llm;
        } else {
            // 默认使用配置创建LLM实例
            this.llm = this.createDefaultLLM(config);
        }
    }
    
    private createDefaultLLM(config: RoutingConfig): ILLM {
        const llmConfig = config.llmConfig || {};
        const provider = llmConfig.provider || 'openai';
        const model = llmConfig.model || 'gpt-4o';
        const temperature = llmConfig.temperature || 0.1;
        const maxTokens = llmConfig.maxTokens || 200;
        
        switch (provider.toLowerCase()) {
            case 'anthropic':
                return new AnthropicWrapper(model as any, false, temperature, maxTokens);
            case 'gemini':
                return new GeminiWrapper(model as any, false, temperature, maxTokens);
            case 'openai-chat':
                return new OpenAIChatWrapper(model as any, false, temperature, maxTokens);
            case 'openai':
            default:
                return new OpenAIWrapper(model as any, false, temperature, maxTokens);
        }
    }

    async selectAgent(
        task: Task, 
        availableAgents: IMultiAgent[], 
        requiredCapability?: string
    ): Promise<IMultiAgent | null> {
        // 过滤可用的智能体
        const candidates = availableAgents.filter(agent => agent.isAvailable());
        
        if (candidates.length === 0) {
            return null;
        }
        
        if (candidates.length === 1) {
            return candidates[0];
        }
        
        try {
            // 构建LLM提示
            const agentDescriptions = candidates.map(agent => {
                const status = agent.getAgentStatus();
                return {
                    id: agent.id,
                    name: agent.name,
                    description: agent.description,
                    capabilities: agent.capabilities,
                    currentLoad: status.currentTaskCount,
                    maxLoad: status.maxConcurrentTasks,
                    availability: status.isAvailable ? 'available' : 'busy'
                };
            });
            
            const prompt = this.buildSelectionPrompt(task, agentDescriptions, requiredCapability);
            
            // 使用 LLM 的 call 方法 (不使用工具)
            if (!this.llm) {
                throw new Error('LLM not initialized');
            }
            const llm = this.llm; // TypeScript needs this to understand it's not undefined
            
            // Handle the case where call method might be undefined
            const response = llm.call 
                ? await llm.call(prompt, [])
                : await llm.callAsync(prompt, []);
            const selectedAgentId = this.parseAgentSelection(response?.text || '');
            
            const selectedAgent = candidates.find(agent => agent.id === selectedAgentId);
            
            if (selectedAgent) {
                logger.info(`LLM选择智能体: ${selectedAgentId} 执行任务: "${task.description}"`);
                return selectedAgent;
            } else {
                logger.warn(`LLM返回的智能体ID ${selectedAgentId} 不在候选列表中，回退到第一个可用智能体`);
                return candidates[0];
            }
            
        } catch (error) {
            logger.error('LLM路由策略失败，回退到简单策略:', error);
            // 回退到简单的负载均衡
            return candidates.reduce((best, current) => {
                const bestLoad = best.getAgentStatus().currentTaskCount;
                const currentLoad = current.getAgentStatus().currentTaskCount;
                return currentLoad < bestLoad ? current : best;
            });
        }
    }
    
    private buildSelectionPrompt(
        task: Task, 
        agents: any[], 
        requiredCapability?: string
    ): string {
        const capabilityRequirement = requiredCapability 
            ? `\n特定能力要求: ${requiredCapability}` 
            : '';
            
        return `# 智能体选择任务

你需要为以下任务选择最合适的智能体：

## 任务信息
- 描述: ${task.description}
- 优先级: ${task.priority}${capabilityRequirement}

## 可用智能体
${agents.map(agent => `
### ${agent.id}
- 名称: ${agent.name}
- 描述: ${agent.description}
- 能力: ${agent.capabilities.join(', ')}
- 当前负载: ${agent.currentLoad}/${agent.maxLoad}
- 状态: ${agent.availability}
`).join('')}

## 选择标准
1. 能力匹配度 (最重要)
2. 当前负载情况
3. 智能体专业程度
4. 任务优先级考虑

请分析每个智能体的适合程度，然后只返回最合适的智能体ID (不要包含其他文字)。

选择的智能体ID:`;
    }
    
    private parseAgentSelection(response: string): string {
        // 提取智能体ID，移除多余的文字
        const cleaned = response.trim().toLowerCase();
        
        // 尝试匹配常见的智能体ID模式
        const patterns = [
            /(?:agent[_-]?)?(\w+(?:[_-]\w+)*)/,
            /^(\w+(?:[_-]\w+)*)$/,
            /选择[：:]?\s*(\w+(?:[_-]\w+)*)/,
            /id[：:]?\s*(\w+(?:[_-]\w+)*)/
        ];
        
        for (const pattern of patterns) {
            const match = cleaned.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // 如果没有匹配到，返回整个清理后的字符串
        return cleaned;
    }
}

/**
 * 🎯 向量距离计算策略
 */
export class VectorRoutingStrategy implements IRoutingStrategy {
    private embeddingCache = new Map<string, number[]>();
    
    constructor(private config: RoutingConfig) {}

    async selectAgent(
        task: Task, 
        availableAgents: IMultiAgent[], 
        requiredCapability?: string
    ): Promise<IMultiAgent | null> {
        // 过滤可用的智能体
        const candidates = availableAgents.filter(agent => agent.isAvailable());
        
        if (candidates.length === 0) {
            return null;
        }
        
        if (candidates.length === 1) {
            return candidates[0];
        }
        
        try {
            // 获取任务描述的向量表示
            const taskEmbedding = await this.getEmbedding(task.description);
            
            // 计算每个智能体的相似度得分
            const agentScores = await Promise.all(
                candidates.map(async (agent) => {
                    const agentDescription = this.buildAgentDescription(agent);
                    const agentEmbedding = await this.getEmbedding(agentDescription);
                    const similarity = this.cosineSimilarity(taskEmbedding, agentEmbedding);
                    
                    // 考虑负载平衡
                    const status = agent.getAgentStatus();
                    const loadFactor = 1 - (status.currentTaskCount / status.maxConcurrentTasks);
                    const finalScore = similarity * 0.7 + loadFactor * 0.3;
                    
                    return {
                        agent,
                        similarity,
                        loadFactor,
                        finalScore
                    };
                })
            );
            
            // 过滤相似度阈值
            const threshold = this.config.vectorConfig?.similarityThreshold || 0.7;
            const suitableAgents = agentScores.filter(score => score.similarity >= threshold);
            
            if (suitableAgents.length === 0) {
                logger.warn(`没有智能体达到相似度阈值 ${threshold}，选择最高分智能体`);
                const bestScore = agentScores.reduce((best, current) => 
                    current.finalScore > best.finalScore ? current : best
                );
                return bestScore.agent;
            }
            
            // 选择综合得分最高的智能体
            const selectedScore = suitableAgents.reduce((best, current) => 
                current.finalScore > best.finalScore ? current : best
            );
            
            logger.info(`向量路由选择智能体: ${selectedScore.agent.id}, 相似度: ${selectedScore.similarity.toFixed(3)}, 综合得分: ${selectedScore.finalScore.toFixed(3)}`);
            
            return selectedScore.agent;
            
        } catch (error) {
            logger.error('向量路由策略失败，回退到关键词策略:', error);
            // 回退到关键词策略
            const keywordStrategy = new KeywordRoutingStrategy(this.config);
            return keywordStrategy.selectAgent(task, availableAgents, requiredCapability);
        }
    }
    
    private buildAgentDescription(agent: IMultiAgent): string {
        return `${agent.name}: ${agent.description}. Capabilities: ${agent.capabilities.join(', ')}.`;
    }
    
    private async getEmbedding(text: string): Promise<number[]> {
        // 检查缓存
        if (this.embeddingCache.has(text)) {
            return this.embeddingCache.get(text)!;
        }
        
        try {
            // 这里应该调用实际的嵌入API (如OpenAI Embeddings)
            // 为了演示，我们使用简单的文本特征提取
            const embedding = await this.generateSimpleEmbedding(text);
            
            // 缓存结果
            this.embeddingCache.set(text, embedding);
            
            return embedding;
        } catch (error) {
            logger.error('生成嵌入向量失败:', error);
            // 返回随机向量作为后备
            const dimensions = this.config.vectorConfig?.dimensions || 1536;
            return Array.from({ length: dimensions }, () => Math.random());
        }
    }
    
    private async generateSimpleEmbedding(text: string): Promise<number[]> {
        // 简单的文本特征提取 (实际应用中应该使用真正的嵌入模型)
        const words = text.toLowerCase().split(/\s+/);
        const dimensions = this.config.vectorConfig?.dimensions || 1536;
        
        // 基于文本特征生成向量
        const embedding = new Array(dimensions).fill(0);
        
        words.forEach((word, index) => {
            // 简单的哈希函数映射单词到向量维度
            const hash = this.simpleHash(word);
            const dim = hash % dimensions;
            embedding[dim] += 1 / Math.sqrt(words.length);
        });
        
        // 归一化
        const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        return embedding.map(val => norm > 0 ? val / norm : 0);
    }
    
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }
    
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length) {
            throw new Error('向量维度不匹配');
        }
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        normA = Math.sqrt(normA);
        normB = Math.sqrt(normB);
        
        if (normA === 0 || normB === 0) {
            return 0;
        }
        
        return dotProduct / (normA * normB);
    }
}

/**
 * 🎯 混合策略 (结合LLM和向量计算)
 */
export class HybridRoutingStrategy implements IRoutingStrategy {
    private llmStrategy: LLMRoutingStrategy;
    private vectorStrategy: VectorRoutingStrategy;
    private keywordStrategy: KeywordRoutingStrategy;
    
    constructor(private config: RoutingConfig) {
        this.llmStrategy = new LLMRoutingStrategy(config);
        this.vectorStrategy = new VectorRoutingStrategy(config);
        this.keywordStrategy = new KeywordRoutingStrategy(config);
    }

    async selectAgent(
        task: Task, 
        availableAgents: IMultiAgent[], 
        requiredCapability?: string
    ): Promise<IMultiAgent | null> {
        const candidates = availableAgents.filter(agent => agent.isAvailable());
        
        if (candidates.length === 0) {
            return null;
        }
        
        if (candidates.length === 1) {
            return candidates[0];
        }
        
        try {
            // 并行获取三种策略的结果
            const [llmResult, vectorResult, keywordResult] = await Promise.allSettled([
                this.llmStrategy.selectAgent(task, candidates, requiredCapability),
                this.vectorStrategy.selectAgent(task, candidates, requiredCapability),
                this.keywordStrategy.selectAgent(task, candidates, requiredCapability)
            ]);
            
            // 统计每个智能体的得票
            const votes = new Map<string, number>();
            const weights = this.config.hybridConfig || { 
                llmWeight: 0.4, 
                vectorWeight: 0.4, 
                keywordWeight: 0.2 
            };
            
            // LLM投票
            if (llmResult.status === 'fulfilled' && llmResult.value) {
                const agentId = llmResult.value.id;
                votes.set(agentId, (votes.get(agentId) || 0) + weights.llmWeight!);
            }
            
            // 向量投票
            if (vectorResult.status === 'fulfilled' && vectorResult.value) {
                const agentId = vectorResult.value.id;
                votes.set(agentId, (votes.get(agentId) || 0) + weights.vectorWeight!);
            }
            
            // 关键词投票
            if (keywordResult.status === 'fulfilled' && keywordResult.value) {
                const agentId = keywordResult.value.id;
                votes.set(agentId, (votes.get(agentId) || 0) + weights.keywordWeight!);
            }
            
            if (votes.size === 0) {
                return candidates[0]; // 后备选择
            }
            
            // 选择得票最高的智能体
            const winnerAgentId = Array.from(votes.entries())
                .reduce((best, current) => current[1] > best[1] ? current : best)[0];
            
            const selectedAgent = candidates.find(agent => agent.id === winnerAgentId);
            
            if (selectedAgent) {
                logger.info(`混合策略选择智能体: ${winnerAgentId}, 得分: ${votes.get(winnerAgentId)?.toFixed(3)}`);
                return selectedAgent;
            }
            
            return candidates[0];
            
        } catch (error) {
            logger.error('混合路由策略失败，回退到关键词策略:', error);
            return this.keywordStrategy.selectAgent(task, candidates, requiredCapability);
        }
    }
}

/**
 * 🎯 路由策略工厂
 */
export class RoutingStrategyFactory {
    static create(config: RoutingConfig): IRoutingStrategy {
        switch (config.strategy) {
            case 'llm':
                return new LLMRoutingStrategy(config);
            case 'vector':
                return new VectorRoutingStrategy(config);
            case 'hybrid':
                return new HybridRoutingStrategy(config);
            case 'keyword':
            default:
                return new KeywordRoutingStrategy(config);
        }
    }
} 