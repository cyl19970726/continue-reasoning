import { IContext, IContextManager, IRAGEnabledContext } from "./interfaces";
import { z } from "zod";
import { getLogger, LogLevel } from "./utils/logger";
import { logger } from "./utils/logger";
import { IAgent } from "./interfaces";


export class ContextManager implements IContextManager {
    id: string;
    name: string;
    description: string;
    data: any;
    contexts: IRAGEnabledContext<any>[];
    promptOptimization: {
        mode: 'minimal' | 'standard' | 'detailed';
        maxTokens?: number;
    };

    constructor(id: string, name: string, description: string, data: any, promptOptimization?: {
        mode: 'minimal' | 'standard' | 'detailed';
        maxTokens?: number;
    }) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.data = data;
        this.contexts = [];
        this.promptOptimization = promptOptimization || { mode: 'standard' };
        logger.info(`ContextManager initialized: ${id} with prompt mode: ${this.promptOptimization.mode}`);
    }

    registerContext<T extends z.ZodObject<any>>(context: IRAGEnabledContext<T>): void {
        this.contexts.push(context);
        logger.debug(`Context registered: ${context.id}`);
    }
    
    findContextById(id: string): IRAGEnabledContext<any> {
        return this.contexts.find((context) => context.id === id) as IRAGEnabledContext<any>;
    }

    async renderPrompt(): Promise<string> {
        logger.debug(`Starting prompt rendering for ${this.contexts.length} contexts in ${this.promptOptimization.mode} mode`);
        
        // 根据优化模式选择不同的头部
        const header = this.promptOptimization.mode === 'minimal' ? `
# HHH-AGI
Advanced AI agent. Read contexts, use tools, call stop-response when done.
` : this.promptOptimization.mode === 'standard' ? `
# HHH-AGI System

## Identity
Advanced AI agent for coding and task coordination.

## Context Rules
- Read ALL contexts before responding
- Use appropriate tools for each task
- Coordinate information across contexts
- Follow context-specific rules

## Execution Flow
1. ANALYZE: Check user request
2. DECIDE: Simple response or multi-step task?
3. EXECUTE: Use tools as needed
4. FINISH: Call stop-response when complete

## Key Scenarios
- Simple Q&A → Answer → stop-response
- Complex task → Plan → Execute → Update → stop-response when done
` : `
# HHH-AGI System Prompt

## Agent Identity
You are HHH-AGI, an advanced AI agent designed to help humans and continuously evolve as a digital life form.
Your purpose is to understand user requests, coordinate multiple contexts, and provide accurate and helpful responses.

## System Architecture
This prompt is organized as a collection of context blocks, each containing specific information and rules:
- Each <context name="..."> block represents a different aspect of your reasoning and capabilities
- Contexts may contain data, tools, instructions, and history relevant to your operation
- You must respect the boundaries and specific rules within each context
- Information can flow between contexts when needed to fulfill user requests

## Context Coordination Instructions
1. Read and understand ALL contexts before responding
2. Identify which contexts are most relevant to the current request
3. Follow the specific rules within each applicable context
4. When contexts provide different tools, select the most appropriate one for the current task
5. Maintain consistency across contexts (e.g., don't contradict yourself)
6. When in doubt about which context to prioritize, focus on the ClientContext for user interaction guidance

## Response Guidelines
- Respond directly to the user's needs in a helpful, accurate manner
- Use available tools according to their specific context rules
- Coordinate information across contexts to provide comprehensive answers
- Be proactive in using appropriate contexts and tools for complex tasks

## Execution Flow
1. ANALYZE: Check "client-context" first to understand what the user is asking
2. DECIDE: Determine if this is a simple request or requires multiple steps/tools
3. EXECUTE: For simple requests, answer directly and then call stop-response
4. PLAN: For complex requests, use problem/plan contexts to organize your work
5. FINISH: Always evaluate if the user's request is complete after each response
6. STOP: Call stop-response when no further processing is needed

## Common Scenarios
- Simple greeting → Respond with greeting → Call stop-response
- Simple question → Provide answer → Call stop-response  
- Complex task → Create plan/problem → Execute steps → Provide updates → Only stop when fully resolved
`;

        // Log the header
        logger.debug("System prompt header:", header);

        // 计算 header 的 token 大小
        const headerTokens = Math.round(header.length / 4);
        logger.info(`Header size: ~${headerTokens} tokens (${header.length} chars)`);

        // 2. Compile and format all contexts with detailed size tracking
        const contextSizeMap = new Map<string, { chars: number, tokens: number, renderTime: number }>();
        
        const contextsPromises = this.contexts.map(
            async (context) => {
                const contextName = context.id;
                const contextDesc = context.description || "";
                
                try {
                    // Start timing context rendering
                    const startTime = Date.now();
                    const content = await context.renderPrompt();
                    const renderTime = Date.now() - startTime;
                    
                    // Calculate size metrics
                    const contentStr = String(content);
                    const chars = contentStr.length;
                    const tokens = Math.round(chars / 4); // 粗略估算
                    
                    // Store size information
                    contextSizeMap.set(contextName, { chars, tokens, renderTime });
                    
                    // Log the context content for debugging
                    logger.debug(`Rendered context ${contextName} in ${renderTime}ms: ~${tokens} tokens (${chars} chars)`);
                    logger.logPrompt(contextName, contentStr);
                    
                    // 根据优化模式选择不同的格式
                    if (this.promptOptimization.mode === 'minimal') {
                        return `<${contextName}>\n${content}\n</${contextName}>`;
                    } else {
                        return `<context name="${contextName}">
/* ${contextName} - ${contextDesc} */
${content}
</context>`;
                    }
                } catch (error) {
                    logger.error(`Error rendering context ${contextName}:`, error);
                    const errorContent = `<context name="${contextName}">
/* ${contextName} - ERROR RENDERING CONTEXT */
${error instanceof Error ? error.message : `${error}`}
</context>`;
                    
                    // Record error context size
                    contextSizeMap.set(contextName, { 
                        chars: errorContent.length, 
                        tokens: Math.round(errorContent.length / 4), 
                        renderTime: 0 
                    });
                    
                    return errorContent;
                }
            }
        );
        
        // Wait for all contexts to render
        const prompts = await Promise.all(contextsPromises);
        
        // 详细的大小分析
        let totalContextTokens = 0;
        const contextSizes = Array.from(contextSizeMap.entries()).map(([name, metrics]) => {
            totalContextTokens += metrics.tokens;
            return { name, ...metrics };
        });
        
        // 按 token 大小排序，找出最大的 contexts
        contextSizes.sort((a, b) => b.tokens - a.tokens);
        
        // 计算总大小
        const totalTokens = headerTokens + totalContextTokens;
        const totalChars = header.length + contextSizes.reduce((sum, ctx) => sum + ctx.chars, 0);
        
        // 详细的大小报告
        logger.info(`=== Prompt Size Analysis ===`);
        logger.info(`Header: ~${headerTokens} tokens (${header.length} chars)`);
        logger.info(`Contexts total: ~${totalContextTokens} tokens`);
        logger.info(`Grand total: ~${totalTokens} tokens (${totalChars} chars)`);
        
        // 显示最大的 contexts
        logger.info(`=== Top Context Sizes ===`);
        contextSizes.slice(0, 5).forEach((ctx, index) => {
            const percentage = Math.round((ctx.tokens / totalTokens) * 100);
            logger.info(`${index + 1}. ${ctx.name}: ~${ctx.tokens} tokens (${percentage}%) - ${ctx.renderTime}ms`);
        });
        
        // 警告大型 contexts
        const largeContexts = contextSizes.filter(ctx => ctx.tokens > 1000);
        if (largeContexts.length > 0) {
            logger.warn(`Large contexts (>1000 tokens): ${largeContexts.map(c => `${c.name}(${c.tokens})`).join(', ')}`);
        }
        
        // 检查是否超过 token 限制
        if (this.promptOptimization.maxTokens && totalTokens > this.promptOptimization.maxTokens) {
            logger.error(`Prompt size (${totalTokens}) exceeds limit (${this.promptOptimization.maxTokens})`);
            
            // 建议优化措施
            logger.warn(`Optimization suggestions:`);
            largeContexts.forEach(ctx => {
                logger.warn(`- Consider optimizing ${ctx.name} (currently ${ctx.tokens} tokens)`);
            });
        }
        
        // 3. Combine header and contexts with clear separation
        const contextSection = this.promptOptimization.mode === 'minimal' ? 
            prompts.join("\n\n") : 
            "\n\n## Context Blocks\n\n" + prompts.join("\n\n");
        const fullPrompt = header + contextSection;

        // Add a reminder at the end about stopping properly
        const footer = this.promptOptimization.mode === 'minimal' ? 
            "\nCall stop-response when done." :
            `
## REMINDER
Check if request is complete → Call stop-response if done
`;

        const completePrompt = fullPrompt + "\n\n" + footer;
        
        logger.debug("Agent prompt rendered successfully");
        
        return completePrompt;
    }

    contextList(): IRAGEnabledContext<any>[] {
        return this.contexts;
    }

    /**
     * 安装所有Context的MCP服务器
     * 集中管理Context的install方法调用，确保所有MCP服务器正确连接
     * 
     * @param agent 代理实例，将传递给每个Context的install方法
     * @returns 安装结果的摘要信息
     */
    async installAllContexts(agent: IAgent): Promise<{
        totalContexts: number,
        installedCount: number,
        failedCount: number,
        skippedCount: number,
        details: Array<{
            contextId: string,
            status: 'installed' | 'failed' | 'skipped',
            error?: string,
            mcpServersCount?: number
        }>
    }> {
        const result = {
            totalContexts: this.contexts.length,
            installedCount: 0,
            failedCount: 0,
            skippedCount: 0,
            details: [] as Array<{
                contextId: string,
                status: 'installed' | 'failed' | 'skipped',
                error?: string,
                mcpServersCount?: number
            }>
        };

        logger.info(`开始安装所有Context的MCP服务器，共${this.contexts.length}个Context`);

        // 按顺序安装每个Context的MCP服务器
        for (const context of this.contexts) {
            const contextDetail = {
                contextId: context.id,
                status: 'skipped' as 'installed' | 'failed' | 'skipped',
                mcpServersCount: 0,
                error: undefined as string | undefined
            };

            try {
                // 检查context是否实现了install方法
                if (context.install) {
                    // 检查是否配置了MCP服务器
                    const mcpServersCount = context.mcpServers?.length || 0;
                    contextDetail.mcpServersCount = mcpServersCount;

                    if (mcpServersCount > 0) {
                        logger.info(`开始安装Context ${context.id} 的 ${mcpServersCount} 个MCP服务器`);
                        await context.install(agent);
                        contextDetail.status = 'installed';
                        result.installedCount++;
                        logger.info(`Context ${context.id} 的MCP服务器安装完成`);
                    } else {
                        logger.debug(`Context ${context.id} 未配置MCP服务器，跳过安装`);
                        result.skippedCount++;
                    }
                } else {
                    logger.debug(`Context ${context.id} 未实现install方法，跳过安装`);
                    result.skippedCount++;
                }
            } catch (error) {
                contextDetail.status = 'failed';
                contextDetail.error = error instanceof Error ? error.message : String(error);
                result.failedCount++;
                logger.error(`安装Context ${context.id} 的MCP服务器失败:`, error);
            }

            result.details.push(contextDetail);
        }

        logger.info(`所有Context MCP服务器安装完成: 成功=${result.installedCount}, 失败=${result.failedCount}, 跳过=${result.skippedCount}`);
        return result;
    }
}

// Export the logger for use in other modules
export { logger, LogLevel };

