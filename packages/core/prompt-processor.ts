import { 
    BasePromptProcessor, 
    IPromptProcessor, 
    StandardExtractorResult, 
    ChatMessage, 
    AgentStep, 
    ToolExecutionResult,
    PromptCtx,
    IContextManager
} from "./interfaces";
import { XmlExtractor } from "./utils/xml-extractor";
import { logger } from "./utils/logger";

/**
 * 生产环境的 PromptProcessor 实现
 * 集成了 ContextManager 和动态 prompt 生成
 */
export class ProductionPromptProcessor extends BasePromptProcessor<StandardExtractorResult> {
    private xmlExtractor: XmlExtractor;

    stepPrompts: string[] = [];

    constructor(
        systemPrompt: string,
        private contextManager: IContextManager
    ) {
        super();
        this.systemPrompt = systemPrompt;
        this.xmlExtractor = new XmlExtractor({
            caseSensitive: false,
            preserveWhitespace: false,
            allowEmptyContent: true,
            fallbackToRegex: true
        });
    }

    textExtractor(responseText: string): StandardExtractorResult {
        const thinking = this.extractThinking(responseText);
        const finalAnswer = this.extractFinalAnswer(responseText);
        logger.info('[PromptProcessor] Text extractor result', { thinking, finalAnswer });
        return { 
            thinking: thinking, 
            finalAnswer: finalAnswer 
        };
    }

    private extractThinking(text: string): string | undefined {
        // 使用 XmlExtractor 提取思考内容
        const thinkResult = this.xmlExtractor.extract(text, 'think');
        if (thinkResult.success && thinkResult.content) {
            return thinkResult.content;
        }

        const thinkingResult = this.xmlExtractor.extract(text, 'thinking');
        if (thinkingResult.success && thinkingResult.content) {
            return thinkingResult.content;
        }

        return undefined;
    }

    private extractFinalAnswer(text: string): string | undefined {
        // 使用 XmlExtractor 提取最终答案
        const finalAnswerResult = this.xmlExtractor.extract(text, 'final_answer');
        if (finalAnswerResult.success && finalAnswerResult.content) {
            return finalAnswerResult.content;
        }

        // 也尝试提取 response 标签
        const responseResult = this.xmlExtractor.extract(text, 'response');
        if (responseResult.success && responseResult.content) {
            return responseResult.content;
        }

        return undefined;
    }

    renderChatMessageToPrompt(messages: ChatMessage[]): void {
        this.chatMessagesHistory.push(...messages);
    }

    renderExtractorResultToPrompt(
        extractorResult: StandardExtractorResult, 
        stepIndex: number
    ): void {
        if (extractorResult.thinking) {
            this.chatMessagesHistory.push({
                role: 'agent',
                step: stepIndex,
                content: `<think>${extractorResult.thinking}</think>`,
                timestamp: new Date().toISOString()
            });
        }
        if (extractorResult.finalAnswer) {
            this.chatMessagesHistory.push({
                role: 'agent',
                step: stepIndex,
                content: `<final_answer>${extractorResult.finalAnswer}</final_answer>`,
                timestamp: new Date().toISOString()
            });
            this.setFinalAnswer(extractorResult.finalAnswer);
        }
    }

    renderToolCallToPrompt(toolResults: AgentStep['toolCallResults'], stepIndex: number): void {
        if (!toolResults || toolResults.length === 0) return;
        
        const toolResultsText = toolResults.map(result => 
            `<tool_call_result name="${result.name}" call_id="${result.call_id}">
params=${JSON.stringify(result.params)} 
result=${JSON.stringify(result.result)} 
status=${result.status} 
message=${result.message || ''}
</tool_call_result>`
        ).join('\n');

        this.chatMessagesHistory.push({
            role: 'agent',
            step: stepIndex,
            content: toolResultsText,
            timestamp: new Date().toISOString()
        });
    }

    async formatPrompt(stepIndex: number): Promise<string> {
        let prompt = '';
        
        // 1. 使用强化的系统 Prompt（包含格式要求）
        prompt += this.systemPrompt + '\n\n';
        
        // 2. 添加动态Context信息（使用简化的ContextManager）
        try {
            if (this.contextManager.renderStructuredPrompt) {
                const structuredPrompt = await this.contextManager.renderStructuredPrompt();
                prompt += this.formatStructuredPrompt(structuredPrompt);
            } else {
                // Fallback到基础context渲染
                const contextPrompt = await this.contextManager.renderPrompt();
                prompt += contextPrompt + '\n\n';
            }
        } catch (error) {
            logger.error('Failed to render context prompt:', error);
        }
        
        // 3. ExecutionHistory（ChatHistory List）
        if (this.chatMessagesHistory.length > 0) {
            prompt += '\n## Chat History List\n';
            this.chatMessagesHistory.forEach(message => {
                prompt += `
<chat_history>
step: ${message.step}
timestamp: ${message.timestamp}
${message.role}: ${message.content}
</chat_history>
`;
            });
        }
        
        this.stepPrompts.push(prompt);
        this.currentPrompt = prompt;
        return prompt;
    }

    getPrompt(stepIndex: number): string | Promise<string> {
        if (stepIndex < 0 || stepIndex >= this.stepPrompts.length) {
            throw new Error(`Step index ${stepIndex} is out of range (available: 0-${this.stepPrompts.length - 1})`);
        }
        return this.stepPrompts[stepIndex];
    }

    getStepPrompts(stepRange?: { start: number; end: number }): string[] {
        if (!stepRange) {
            return [...this.stepPrompts];
        }

        const { start, end } = stepRange;
        
        if (start < 0 || end < 0) {
            throw new Error('Step range start and end must be non-negative');
        }
        if (start > end) {
            throw new Error('Step range start must be less than or equal to end');
        }
        if (start >= this.stepPrompts.length) {
            throw new Error(`Step range start ${start} is out of range (available: 0-${this.stepPrompts.length - 1})`);
        }

        const adjustedEnd = Math.min(end, this.stepPrompts.length - 1);
        
        return this.stepPrompts.slice(start, adjustedEnd + 1);
    }

    private formatStructuredPrompt(promptCtx: PromptCtx): string {
        // 将 PromptCtx 转换为字符串格式
        let formatted = '';
        
        if (promptCtx.workflow) {
            formatted += '## Workflow\n' + promptCtx.workflow + '\n\n';
        }
        
        if (promptCtx.status) {
            formatted += '## Current Status\n' + promptCtx.status + '\n\n';
        }
        
        if (promptCtx.guideline) {
            formatted += '## Guidelines\n' + promptCtx.guideline + '\n\n';
        }
        
        if (promptCtx.examples) {
            formatted += '## Examples\n' + promptCtx.examples + '\n\n';
        }
        
        return formatted;
    }

    // 获取当前prompt
    getCurrentPrompt(): string {
        return this.currentPrompt;
    }

    // 批量保存每个步骤的prompt到单独文件
    async saveAllStepPrompts(outputDir: string, options: {
        formatType: 'markdown' | 'json' | 'both';
        includeMetadata?: boolean;
    }): Promise<void> {
        const fs = await import('fs');
        const path = await import('path');
        
        try {
            // 确保输出目录存在
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // 保存每个步骤的prompt
            for (let stepIndex = 0; stepIndex < this.stepPrompts.length; stepIndex++) {
                const stepPrompt = this.stepPrompts[stepIndex];
                
                if (options.formatType === 'markdown' || options.formatType === 'both') {
                    const markdownFile = path.join(outputDir, `step-${stepIndex}.md`);
                    const markdownContent = this.formatStepPromptAsMarkdown(stepIndex, stepPrompt, options.includeMetadata);
                    fs.writeFileSync(markdownFile, markdownContent, 'utf-8');
                }
                
                if (options.formatType === 'json' || options.formatType === 'both') {
                    const jsonFile = path.join(outputDir, `step-${stepIndex}.json`);
                    const jsonContent = this.formatStepPromptAsJSON(stepIndex, stepPrompt, options.includeMetadata);
                    fs.writeFileSync(jsonFile, JSON.stringify(jsonContent, null, 2), 'utf-8');
                }
            }

            // 保存汇总信息
            if (options.formatType === 'markdown' || options.formatType === 'both') {
                const summaryFile = path.join(outputDir, 'summary.md');
                const summaryContent = this.formatPromptSummaryAsMarkdown(options.includeMetadata);
                fs.writeFileSync(summaryFile, summaryContent, 'utf-8');
            }
            
            if (options.formatType === 'json' || options.formatType === 'both') {
                const summaryFile = path.join(outputDir, 'summary.json');
                const summaryContent = this.formatPromptSummaryAsJSON(options.includeMetadata);
                fs.writeFileSync(summaryFile, JSON.stringify(summaryContent, null, 2), 'utf-8');
            }

            logger.info(`Saved ${this.stepPrompts.length} step prompts to ${outputDir}`);
        } catch (error) {
            logger.error('Failed to save step prompts:', error);
            throw error;
        }
    }

    // 格式化单个步骤的prompt为Markdown
    private formatStepPromptAsMarkdown(stepIndex: number, prompt: string, includeMetadata?: boolean): string {
        let content = `# Step ${stepIndex} Prompt\n\n`;
        
        if (includeMetadata) {
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Step Index:** ${stepIndex}\n`;
            content += `**Prompt Length:** ${prompt.length} characters\n`;
            content += `**Estimated Tokens:** ~${Math.round(prompt.length / 4)}\n\n`;
        }

        content += `## Complete Prompt\n\n`;
        content += `\`\`\`\n${prompt}\n\`\`\`\n\n`;

        // 添加相关的聊天消息
        const stepMessages = this.chatMessagesHistory.filter(msg => msg.step === stepIndex);
        if (stepMessages.length > 0) {
            content += `## Related Chat Messages\n\n`;
            stepMessages.forEach(msg => {
                content += `### ${msg.role} (${msg.timestamp})\n\n`;
                content += `\`\`\`\n${msg.content}\n\`\`\`\n\n`;
            });
        }

        return content;
    }

    // 格式化单个步骤的prompt为JSON
    private formatStepPromptAsJSON(stepIndex: number, prompt: string, includeMetadata?: boolean): any {
        const data: any = {
            stepIndex,
            prompt,
            promptLength: prompt.length,
            estimatedTokens: Math.round(prompt.length / 4)
        };

        if (includeMetadata) {
            data.metadata = {
                generated: new Date().toISOString(),
                totalSteps: this.stepPrompts.length,
                relatedMessages: this.chatMessagesHistory.filter(msg => msg.step === stepIndex)
            };
        }

        return data;
    }

    // 格式化汇总信息为Markdown
    private formatPromptSummaryAsMarkdown(includeMetadata?: boolean): string {
        let content = `# Prompt Processing Summary\n\n`;
        
        if (includeMetadata) {
            content += `**Generated:** ${new Date().toISOString()}\n`;
            content += `**Total Steps:** ${this.stepPrompts.length}\n`;
            content += `**Total Messages:** ${this.chatMessagesHistory.length}\n`;
            content += `**Has Final Answer:** ${!!this.getFinalAnswer()}\n\n`;
        }

        // 添加长度统计
        if (this.stepPrompts.length > 0) {
            const lengths = this.stepPrompts.map(p => p.length);
            const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
            const maxLength = Math.max(...lengths);
            const minLength = Math.min(...lengths);

            content += `## Prompt Length Statistics\n\n`;
            content += `- **Average Length:** ${Math.round(avgLength)} characters (~${Math.round(avgLength / 4)} tokens)\n`;
            content += `- **Max Length:** ${maxLength} characters (~${Math.round(maxLength / 4)} tokens)\n`;
            content += `- **Min Length:** ${minLength} characters (~${Math.round(minLength / 4)} tokens)\n\n`;

            content += `## Length Progression\n\n`;
            this.stepPrompts.forEach((prompt, index) => {
                const length = prompt.length;
                const tokens = Math.round(length / 4);
                content += `- **Step ${index}:** ${length} chars (${tokens} tokens)\n`;
            });
            content += `\n`;
        }

        // 添加最终答案
        if (this.getFinalAnswer()) {
            content += `## Final Answer\n\n`;
            content += `\`\`\`\n${this.getFinalAnswer()}\n\`\`\`\n\n`;
        }

        return content;
    }

    // 格式化汇总信息为JSON
    private formatPromptSummaryAsJSON(includeMetadata?: boolean): any {
        const data: any = {
            totalSteps: this.stepPrompts.length,
            totalMessages: this.chatMessagesHistory.length,
            hasFinalAnswer: !!this.getFinalAnswer(),
            promptLengths: this.stepPrompts.map(p => p.length),
            estimatedTokens: this.stepPrompts.map(p => Math.round(p.length / 4))
        };

        if (includeMetadata) {
            data.metadata = {
                generated: new Date().toISOString(),
                systemPromptLength: this.systemPrompt.length,
                averagePromptLength: this.stepPrompts.length > 0 
                    ? Math.round(this.stepPrompts.reduce((a, b) => a + b.length, 0) / this.stepPrompts.length) 
                    : 0
            };
        }

        if (this.getFinalAnswer()) {
            data.finalAnswer = this.getFinalAnswer();
        }

        return data;
    }

    // 获取XmlExtractor实例，以便外部使用
    getXmlExtractor(): XmlExtractor {
        return this.xmlExtractor;
    }

    // 设置XmlExtractor选项
    setXmlExtractorOptions(options: any): void {
        this.xmlExtractor.setOptions(options);
    }

    // 使用XmlExtractor提取复杂内容
    extractComplexContent(text: string, extractions: Record<string, string>): Record<string, string> {
        const results: Record<string, string> = {};
        
        for (const [key, tagPath] of Object.entries(extractions)) {
            const result = this.xmlExtractor.extract(text, tagPath);
            results[key] = result.success ? result.content : '';
        }
        
        return results;
    }
}

/**
 * 工厂函数：创建 ProductionPromptProcessor 实例
 */
export function createProductionPromptProcessor(
    systemPrompt: string,
    contextManager: IContextManager,
    options?: {
        enableToolCallsForFirstStep?: boolean;
        xmlExtractorOptions?: any;
    }
): ProductionPromptProcessor {
    const processor = new ProductionPromptProcessor(systemPrompt, contextManager);
    
    // 配置工具调用控制
    if (options?.enableToolCallsForFirstStep === false) {
        processor.setEnableToolCallsForStep((stepIndex) => stepIndex > 0);
    }

    // 配置 XML 提取器选项
    if (options?.xmlExtractorOptions) {
        processor.setXmlExtractorOptions(options.xmlExtractorOptions);
    }

    return processor;
}

/**
 * 导出 PromptProcessor 相关类型
 */
export type { 
    IPromptProcessor, 
    StandardExtractorResult, 
    ChatMessage, 
    AgentStep, 
    ToolExecutionResult 
} from "./interfaces"; 