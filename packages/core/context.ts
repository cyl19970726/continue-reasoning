import { IContext, IContextManager, IRAGEnabledContext, PromptCtx, PromptAssemblyStrategy } from "./interfaces/index.js";
import { z } from "zod";
import { getLogger, LogLevel } from "./utils/logger.js";
import { logger } from "./utils/logger.js";
import { IAgent } from "./interfaces/index.js";


export class ContextManager implements IContextManager {
    id: string;
    name: string;
    contexts: IRAGEnabledContext<any>[];
    promptOptimization?: {
        mode: 'minimal' | 'standard' | 'detailed' | 'custom';
        customSystemPrompt?: string;
        maxTokens?: number;
    };
    
    // 添加私有属性存储当前的拼接策略
    private currentAssemblyStrategy: PromptAssemblyStrategy = 'grouped';

    constructor(id: string, name: string, promptOptimization?: {
        mode: 'minimal' | 'standard' | 'detailed' | 'custom';
        customSystemPrompt?: string;
        maxTokens?: number;
    }) {
        this.id = id;
        this.name = name;
        this.contexts = [];
        this.promptOptimization = promptOptimization || { mode: 'standard'};
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
        throw new Error('Not implemented');
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

    /**
     * 渲染结构化的 PromptCtx
     * 收集所有 Context 的 PromptCtx 并按照指定策略进行拼接
     * 
     * @param strategy 拼接策略，如果不提供则使用当前策略
     * @returns 拼接后的结构化提示内容
     */
    async renderStructuredPrompt(strategy?: PromptAssemblyStrategy): Promise<PromptCtx> {
        const effectiveStrategy = strategy || this.currentAssemblyStrategy;
        logger.info(`Rendering structured prompt with strategy: ${effectiveStrategy}`);

        // 收集所有 Context 的 PromptCtx
        const contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }> = [];
        
        for (const context of this.contexts) {
            try {
                logger.debug(`Collecting PromptCtx from context: ${context.id}`);
                
                // 调用 context 的 renderPrompt 方法
                const result = await context.renderPrompt();
                
                // 检查返回结果是 PromptCtx 还是 string
                let promptCtx: PromptCtx;
                
                if (typeof result === 'string') {
                    // 如果是 string，创建简单的 PromptCtx 结构
                    promptCtx = {
                        workflow: '',
                        status: result,
                        guideline: '',
                        examples: ''
                    };
                    logger.warn(`Context ${context.id} returned string, putting content in status`);
                } else {
                    // 如果是 PromptCtx，直接使用
                    promptCtx = result;
                    logger.debug(`Using dynamic PromptCtx for context: ${context.id}`);
                }
                
                contextPrompts.push({
                    contextId: context.id,
                    promptCtx
                });
                
            } catch (error) {
                logger.error(`Error collecting PromptCtx from context ${context.id}:`, error);
                
                // 对于错误的 context，创建一个错误信息的 PromptCtx
                contextPrompts.push({
                    contextId: context.id,
                    promptCtx: {
                        workflow: '',
                        status: `Error rendering context ${context.id}: ${error instanceof Error ? error.message : String(error)}`,
                        guideline: '',
                        examples: ''
                    }
                });
            }
        }

        // 根据策略拼接 PromptCtx
        return this.assemblePromptCtx(contextPrompts, effectiveStrategy);
    }

    /**
     * 设置 prompt 拼接策略
     * 
     * @param strategy 新的拼接策略
     */
    setPromptAssemblyStrategy(strategy: PromptAssemblyStrategy): void {
        logger.info(`Changing prompt assembly strategy from ${this.currentAssemblyStrategy} to ${strategy}`);
        this.currentAssemblyStrategy = strategy;
    }

    /**
     * 获取当前的 prompt 拼接策略
     */
    getPromptAssemblyStrategy(): PromptAssemblyStrategy {
        return this.currentAssemblyStrategy;
    }

    /**
     * 根据策略拼接 PromptCtx
     * 
     * @param contextPrompts 所有 Context 的 PromptCtx
     * @param strategy 拼接策略
     * @returns 拼接后的 PromptCtx
     */
    private assemblePromptCtx(
        contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }>,
        strategy: PromptAssemblyStrategy
    ): PromptCtx {
        switch (strategy) {
            case 'grouped':
                return this.assembleGroupedPromptCtx(contextPrompts);
            
            case 'priority':
                return this.assemblePriorityPromptCtx(contextPrompts);
            
            case 'context_first':
                return this.assembleContextFirstPromptCtx(contextPrompts);
            
            case 'minimal':
                return this.assembleMinimalPromptCtx(contextPrompts);
            
            case 'custom':
                return this.assembleCustomPromptCtx(contextPrompts);
            
            default:
                logger.warn(`Unknown strategy ${strategy}, falling back to grouped`);
                return this.assembleGroupedPromptCtx(contextPrompts);
        }
    }

    /**
     * Grouped 策略：按组件类型分组
     * 所有 workflow 放一起，所有 status 放一起，所有 guideline 放一起，所有 examples 放一起
     */
    private assembleGroupedPromptCtx(
        contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }>
    ): PromptCtx {
        logger.debug(`Assembling ${contextPrompts.length} contexts using grouped strategy`);

        const workflows: string[] = [];
        const statuses: string[] = [];
        const guidelines: string[] = [];
        const examples: string[] = [];

        // 收集各个组件
        for (const { contextId, promptCtx } of contextPrompts) {
            if (promptCtx.workflow && promptCtx.workflow.trim()) {
                workflows.push(`## ${contextId}\n${promptCtx.workflow.trim()}`);
            }
            
            if (promptCtx.status && promptCtx.status.trim()) {
                statuses.push(`## ${contextId}\n${promptCtx.status.trim()}`);
            }
            
            if (promptCtx.guideline && promptCtx.guideline.trim()) {
                guidelines.push(`## ${contextId}\n${promptCtx.guideline.trim()}`);
            }
            
            if (promptCtx.examples && promptCtx.examples.trim()) {
                examples.push(`## ${contextId}\n${promptCtx.examples.trim()}`);
            }
        }

        // 拼接各个组件
        const assembledPromptCtx: PromptCtx = {
            workflow: workflows.length > 0 ? 
                `# 🔄 WORKFLOWS\n\n${workflows.join('\n\n')}` : '',
            
            status: statuses.length > 0 ? 
                `# 📊 STATUS\n\n${statuses.join('\n\n')}` : '',
            
            guideline: guidelines.length > 0 ? 
                `# 📋 GUIDELINES\n\n${guidelines.join('\n\n')}` : '',
            
            examples: examples.length > 0 ? 
                `# 💡 EXAMPLES\n\n${examples.join('\n\n')}` : ''
        };

        logger.info(`Grouped assembly complete: ${workflows.length} workflows, ${statuses.length} statuses, ${guidelines.length} guidelines, ${examples.length} examples`);
        
        return assembledPromptCtx;
    }

    /**
     * Priority 策略：按优先级排序，完整保留每个 context 的结构
     * 注意：这里简化实现，实际可以根据 context 添加优先级属性
     */
    private assemblePriorityPromptCtx(
        contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }>
    ): PromptCtx {
        logger.debug(`Assembling ${contextPrompts.length} contexts using priority strategy`);

        // 定义优先级顺序（可以根据需要调整）
        const priorityOrder = ['coding-context', 'plan-context', 'interactive-context'];
        
        // 按优先级排序
        const sortedPrompts = contextPrompts.sort((a, b) => {
            const priorityA = priorityOrder.indexOf(a.contextId);
            const priorityB = priorityOrder.indexOf(b.contextId);
            
            // 如果在优先级列表中，使用优先级；否则放在最后
            const effectivePriorityA = priorityA >= 0 ? priorityA : 999;
            const effectivePriorityB = priorityB >= 0 ? priorityB : 999;
            
            return effectivePriorityA - effectivePriorityB;
        });

        const sections: string[] = [];
        
        for (const { contextId, promptCtx } of sortedPrompts) {
            const contextSection: string[] = [];
            
            if (promptCtx.workflow && promptCtx.workflow.trim()) {
                contextSection.push(`### Workflow\n${promptCtx.workflow.trim()}`);
            }
            
            if (promptCtx.status && promptCtx.status.trim()) {
                contextSection.push(`### Status\n${promptCtx.status.trim()}`);
            }
            
            if (promptCtx.guideline && promptCtx.guideline.trim()) {
                contextSection.push(`### Guidelines\n${promptCtx.guideline.trim()}`);
            }
            
            if (promptCtx.examples && promptCtx.examples.trim()) {
                contextSection.push(`### Examples\n${promptCtx.examples.trim()}`);
            }
            
            if (contextSection.length > 0) {
                sections.push(`## ${contextId}\n\n${contextSection.join('\n\n')}`);
            }
        }

        const assembledPromptCtx: PromptCtx = {
            workflow: `# 📋 CONTEXTS (Priority Order)\n\n${sections.join('\n\n')}`,
            status: '',
            guideline: '',
            examples: ''
        };

        logger.info(`Priority assembly complete: ${sections.length} context sections`);
        
        return assembledPromptCtx;
    }

    /**
     * Context First 策略：保持每个 context 的完整性，按 context 分组
     */
    private assembleContextFirstPromptCtx(
        contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }>
    ): PromptCtx {
        logger.debug(`Assembling ${contextPrompts.length} contexts using context_first strategy`);

        const contextSections: string[] = [];

        for (const { contextId, promptCtx } of contextPrompts) {
            const sections: string[] = [];
            
            if (promptCtx.workflow && promptCtx.workflow.trim()) {
                sections.push(promptCtx.workflow.trim());
            }
            
            if (promptCtx.status && promptCtx.status.trim()) {
                sections.push(promptCtx.status.trim());
            }
            
            if (promptCtx.guideline && promptCtx.guideline.trim()) {
                sections.push(promptCtx.guideline.trim());
            }
            
            if (promptCtx.examples && promptCtx.examples.trim()) {
                sections.push(promptCtx.examples.trim());
            }
            
            if (sections.length > 0) {
                contextSections.push(`# ${contextId}\n\n${sections.join('\n\n')}`);
            }
        }

        const assembledPromptCtx: PromptCtx = {
            workflow: contextSections.join('\n\n'),
            status: '',
            guideline: '',
            examples: ''
        };

        logger.info(`Context-first assembly complete: ${contextSections.length} context sections`);
        
        return assembledPromptCtx;
    }

    /**
     * Minimal 策略：只保留关键信息，精简输出
     */
    private assembleMinimalPromptCtx(
        contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }>
    ): PromptCtx {
        logger.debug(`Assembling ${contextPrompts.length} contexts using minimal strategy`);

        const workflows: string[] = [];
        const statuses: string[] = [];

        for (const { contextId, promptCtx } of contextPrompts) {
            // 只收集 workflow 和 status，忽略 guideline 和 examples
            if (promptCtx.workflow && promptCtx.workflow.trim()) {
                // 简化 workflow，只保留主要步骤
                const simplifiedWorkflow = this.simplifyContent(promptCtx.workflow.trim());
                workflows.push(`${contextId}: ${simplifiedWorkflow}`);
            }
            
            if (promptCtx.status && promptCtx.status.trim()) {
                // 简化 status，只保留关键状态信息
                const simplifiedStatus = this.simplifyContent(promptCtx.status.trim());
                statuses.push(`${contextId}: ${simplifiedStatus}`);
            }
        }

        const assembledPromptCtx: PromptCtx = {
            workflow: workflows.length > 0 ? workflows.join('\n') : '',
            status: statuses.length > 0 ? statuses.join('\n') : '',
            guideline: '',
            examples: ''
        };

        logger.info(`Minimal assembly complete: ${workflows.length} workflows, ${statuses.length} statuses`);
        
        return assembledPromptCtx;
    }

    /**
     * Custom 策略：自定义拼接逻辑（可以根据需要扩展）
     */
    private assembleCustomPromptCtx(
        contextPrompts: Array<{ contextId: string; promptCtx: PromptCtx }>
    ): PromptCtx {
        logger.debug(`Assembling ${contextPrompts.length} contexts using custom strategy`);

        // 这里可以实现自定义逻辑，目前先回退到 grouped 策略
        logger.warn('Custom strategy not implemented, falling back to grouped');
        return this.assembleGroupedPromptCtx(contextPrompts);
    }

    /**
     * 简化内容，用于 minimal 策略
     */
    private simplifyContent(content: string): string {
        // 移除 markdown 标记
        let simplified = content
            .replace(/^#+\s*/gm, '') // 移除标题标记
            .replace(/\*\*(.*?)\*\*/g, '$1') // 移除加粗标记
            .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
            .replace(/`([^`]+)`/g, '$1') // 移除代码标记
            .replace(/```[\s\S]*?```/g, '[code block]') // 替换代码块
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // 移除链接格式，保留文本

        // 移除多余的空行和空格
        simplified = simplified
            .replace(/\n\s*\n\s*\n/g, '\n\n') // 合并多个空行
            .replace(/^\s+|\s+$/gm, '') // 移除行首行尾空格
            .trim();

        // 如果内容太长，截取前 200 个字符
        if (simplified.length > 200) {
            simplified = simplified.substring(0, 200) + '...';
        }

        return simplified;
    }
}

// Export the logger for use in other modules
export { logger, LogLevel };

