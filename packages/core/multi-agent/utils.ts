import { Task, TaskResult, IMultiAgent, AgentStatus } from '../interfaces/multi-agent';
import { logger } from '../utils/logger';

/**
 * 🎯 多智能体系统工具函数
 */

/**
 * 验证智能体ID是否有效
 */
export function validateAgentId(agentId: string): boolean {
    return typeof agentId === 'string' && agentId.length > 0 && agentId.trim() === agentId;
}

/**
 * 验证任务描述是否有效
 */
export function validateTaskDescription(description: string): boolean {
    return typeof description === 'string' && description.trim().length > 0;
}

/**
 * 创建任务摘要
 */
export function createTaskSummary(task: Task): string {
    const statusEmoji = {
        'pending': '⏳',
        'running': '🏃',
        'completed': '✅',
        'failed': '❌',
        'cancelled': '🚫'
    };
    
    return `${statusEmoji[task.status]} ${task.id.slice(0, 8)} - ${task.description.slice(0, 50)}${task.description.length > 50 ? '...' : ''}`;
}

/**
 * 创建智能体状态摘要
 */
export function createAgentStatusSummary(agent: IMultiAgent): string {
    const status = agent.getAgentStatus();
    const availability = status.isAvailable ? '🟢' : '🔴';
    const load = `${status.currentTaskCount}/${status.maxConcurrentTasks}`;
    const capabilities = agent.capabilities.slice(0, 3).join(', ');
    
    return `${availability} ${agent.name} (${load}) [${capabilities}${agent.capabilities.length > 3 ? '...' : ''}]`;
}

/**
 * 格式化执行时间
 */
export function formatExecutionTime(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * 计算任务优先级权重
 */
export function getTaskPriorityWeight(priority: Task['priority']): number {
    const weights = {
        'low': 1,
        'medium': 2,
        'high': 3,
        'urgent': 4
    };
    return weights[priority];
}

/**
 * 检查智能体能力匹配度
 */
export function calculateCapabilityMatch(task: Task, agent: IMultiAgent): number {
    if (agent.capabilities.length === 0) {
        return 0.5; // 通用智能体基础分
    }
    
    const taskDescription = task.description.toLowerCase();
    let matchScore = 0;
    let totalScore = 0;
    
    for (const capability of agent.capabilities) {
        totalScore++;
        const keywords = getCapabilityKeywords(capability);
        
        if (keywords.some(keyword => taskDescription.includes(keyword.toLowerCase()))) {
            matchScore++;
        }
    }
    
    return totalScore > 0 ? matchScore / totalScore : 0;
}

/**
 * 获取能力关键词
 */
export function getCapabilityKeywords(capability: string): string[] {
    const keywordMap: Record<string, string[]> = {
        'code_generation': ['code', 'function', 'class', 'script', 'program', 'develop', 'implement'],
        'code_review': ['review', 'check', 'analyze', 'audit', 'inspect', 'examine'],
        'debugging': ['debug', 'fix', 'error', 'bug', 'issue', 'problem', 'troubleshoot'],
        'research': ['research', 'find', 'search', 'investigate', 'study', 'explore'],
        'analysis': ['analyze', 'examine', 'evaluate', 'assess', 'compare', 'study'],
        'writing': ['write', 'compose', 'draft', 'create', 'document', 'text'],
        'translation': ['translate', 'convert', 'transform', 'interpret', 'language'],
        'testing': ['test', 'validate', 'verify', 'check', 'quality', 'assurance'],
        'documentation': ['document', 'readme', 'guide', 'manual', 'instruction'],
        'web_development': ['web', 'html', 'css', 'javascript', 'frontend', 'backend'],
        'data_analysis': ['data', 'statistics', 'chart', 'graph', 'visualization', 'analysis'],
        'ai_ml': ['ai', 'machine learning', 'neural', 'model', 'training', 'prediction']
    };
    
    return keywordMap[capability] || [capability];
}

/**
 * 创建任务结果摘要
 */
export function createTaskResultSummary(result: TaskResult): string {
    const statusEmoji = {
        'success': '✅',
        'error': '❌',
        'timeout': '⏰',
        'cancelled': '🚫'
    };
    
    const time = formatExecutionTime(result.executionTime);
    const status = `${statusEmoji[result.status]} ${result.status.toUpperCase()}`;
    
    if (result.status === 'error' && result.error) {
        return `${status} in ${time}: ${result.error.slice(0, 100)}${result.error.length > 100 ? '...' : ''}`;
    }
    
    return `${status} in ${time}`;
}

/**
 * 检查智能体健康状态
 */
export function checkAgentHealth(agent: IMultiAgent): {
    healthy: boolean;
    issues: string[];
    score: number;
} {
    const issues: string[] = [];
    let score = 100;
    
    const status = agent.getAgentStatus();
    
    // 检查可用性
    if (!status.isAvailable) {
        issues.push('Agent is not available');
        score -= 30;
    }
    
    // 检查负载
    const loadRatio = status.currentTaskCount / status.maxConcurrentTasks;
    if (loadRatio > 0.8) {
        issues.push(`High load: ${status.currentTaskCount}/${status.maxConcurrentTasks} tasks`);
        score -= 20;
    }
    
    // 检查能力配置
    if (status.capabilities.length === 0) {
        issues.push('No capabilities defined');
        score -= 10;
    }
    
    // 检查最后活动时间
    const lastActivityAge = Date.now() - status.lastActivity;
    if (lastActivityAge > 5 * 60 * 1000) { // 5分钟
        issues.push('No recent activity');
        score -= 15;
    }
    
    return {
        healthy: issues.length === 0,
        issues,
        score: Math.max(0, score)
    };
}

/**
 * 生成简单的统计报告
 */
export function generateStatsReport(stats: any): string {
    const lines = [
        '📊 Multi-Agent System Statistics',
        '═══════════════════════════════',
        `🤖 Total Agents: ${stats.totalAgents}`,
        `🟢 Available Agents: ${stats.availableAgents}`,
        `📋 Active Tasks: ${stats.activeTasks}`,
        `✅ Completed Tasks: ${stats.completedTasks}`,
        `❌ Failed Tasks: ${stats.failedTasks}`,
        ''
    ];
    
    if (stats.totalTasksProcessed > 0) {
        const successRate = ((stats.completedTasks / stats.totalTasksProcessed) * 100).toFixed(1);
        lines.push(`📈 Success Rate: ${successRate}%`);
    }
    
    return lines.join('\n');
}

/**
 * 安全的JSON序列化
 */
export function safeJsonStringify(obj: any, maxDepth: number = 3): string {
    const seen = new WeakSet();
    
    function replacer(key: string, value: any, depth: number = 0): any {
        if (depth > maxDepth) {
            return '[Max Depth Reached]';
        }
        
        if (value === null) return null;
        if (typeof value !== 'object') return value;
        if (seen.has(value)) return '[Circular Reference]';
        
        seen.add(value);
        
        if (Array.isArray(value)) {
            return value.map(item => replacer('', item, depth + 1));
        }
        
        const result: any = {};
        for (const [k, v] of Object.entries(value)) {
            result[k] = replacer(k, v, depth + 1);
        }
        
        return result;
    }
    
    try {
        return JSON.stringify(replacer('', obj), null, 2);
    } catch (error) {
        logger.error('Failed to stringify object:', error);
        return '[Serialization Failed]';
    }
}

/**
 * 创建任务超时Promise
 */
export function createTimeoutPromise<T>(timeoutMs: number, errorMessage?: string): Promise<T> {
    return new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(errorMessage || `Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
}

/**
 * 延迟执行工具
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试执行
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            logger.warn(`Attempt ${attempt}/${maxRetries} failed:`, error);
            
            if (attempt < maxRetries) {
                await delay(delayMs * attempt); // 递增延迟
            }
        }
    }
    
    throw lastError!;
} 