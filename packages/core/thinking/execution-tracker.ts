import { ParsedThinking } from './thinking-extractor';
import { ParsedResponse } from './response-extractor';
import { ToolCallParams } from '../interfaces';

export interface ExecutionStep {
  stepNumber: number;
  timestamp: Date;
  thinking: ParsedThinking | null;
  response: ParsedResponse | null;
  toolCalls: ToolCallParams[];
  toolResults: any[];
  completed: boolean;
  prompt?: string;
}

export interface ExecutionHistoryRenderOptions {
  includeThinking?: boolean;
  includeResponse?: boolean;
  includeToolCalls?: boolean;
  includeToolResults?: boolean;
  includePrompt?: boolean;
  maxSteps?: number;
  promptSummaryLength?: number;
}

export class ExecutionTracker {
  private steps: ExecutionStep[] = [];
  private currentStep: number = 1;
  private maxSteps: number = 50; // 防止内存泄漏
  private maxStepsHistory: number = 5; // 历史步骤数量
  private defaultRenderOptions: ExecutionHistoryRenderOptions = {
    includeThinking: true,
    includeResponse: true,
    includeToolCalls: true,
    includeToolResults: true,
    includePrompt: false,  // 默认不包含prompt避免输出过长
    maxSteps: 5,
    promptSummaryLength: 200
  };

  constructor(renderOptions?: Partial<ExecutionHistoryRenderOptions>) {
    if (renderOptions) {
      this.defaultRenderOptions = { ...this.defaultRenderOptions, ...renderOptions };
    }
  }

  /**
   * 设置默认渲染选项
   */
  setDefaultRenderOptions(options: Partial<ExecutionHistoryRenderOptions>): void {
    this.defaultRenderOptions = { ...this.defaultRenderOptions, ...options };
  }

  /**
   * 获取当前默认渲染选项
   */
  getDefaultRenderOptions(): ExecutionHistoryRenderOptions {
    return { ...this.defaultRenderOptions };
  }

  /**
   * 添加新的执行步骤
   */
  addStep(thinking: ParsedThinking | null, response: ParsedResponse | null, toolCalls: ToolCallParams[], prompt?: string): void {
    const step: ExecutionStep = {
      stepNumber: this.currentStep,
      timestamp: new Date(),
      thinking,
      response,
      toolCalls,
      toolResults: [],
      completed: false,
      prompt
    };
    
    this.steps.push(step);
    this.currentStep++;

    // 限制步骤数量，移除最旧的记录
    if (this.steps.length > this.maxSteps) {
      this.steps.shift();
    }
  }

  /**
   * 添加工具执行结果
   */
  addToolResults(stepNumber: number, results: any[]): void {
    const step = this.steps.find(s => s.stepNumber === stepNumber);
    if (step) {
      step.toolResults = results;
      step.completed = true;
    }
  }

  /**
   * 为下一轮生成执行历史 prompt
   */
  buildExecutionHistory(options?: ExecutionHistoryRenderOptions): string {
    if (this.steps.length === 0) return '';
    
    const renderOptions = { ...this.defaultRenderOptions, ...options };
    const maxSteps = renderOptions.maxSteps || this.maxStepsHistory;
    
    let history = '\n## Execution History\n\n';
    
    // 只显示最近的指定步数
    const recentSteps = this.steps.slice(-maxSteps);
    
    for (const step of recentSteps) {
      history += `### Step ${step.stepNumber} (${this.formatTimestamp(step.timestamp)})\n\n`;
      
      // 思考摘要
      if (renderOptions.includeThinking && step.thinking) {
        history += `**Thinking:**\n`;
        history += `- Analysis: ${step.thinking.analysis}\n`;
        history += `- Plan: ${step.thinking.plan}\n`;
        if (step.thinking.reasoning) {
          history += `- Reasoning: ${step.thinking.reasoning}\n`;
        }
        if (step.thinking.nextAction) {
          history += `- Next Action: ${step.thinking.nextAction}\n`;
        }
      }
      
      // 用户消息 (可选)
      if (renderOptions.includeResponse && step.response) {
        history += `**Response:** ${step.response?.message || 'No response'}\n`;
      }
      
      // 工具调用省略了Param
      if (renderOptions.includeToolCalls && step.toolCalls.length > 0) {
        history += `**Tool Calls:** ${step.toolCalls.map(tc => `tool: ${tc.name}, call_id: ${tc.call_id}`).join(', ')}\n`;
      }
      
      // Prompt内容（可选，用于调试）
      if (renderOptions.includePrompt && step.prompt) {
        const promptSummary = this.truncatePrompt(step.prompt, renderOptions.promptSummaryLength || 200);
        history += `**Prompt Summary:** ${promptSummary}\n`;
      }
      
      // 结果状态
      history += `**Status:** ${step.completed ? 'Completed' : 'In Progress'}\n`;
      
      // 工具执行结果
      if (renderOptions.includeToolResults && step.toolResults.length > 0) {
        history += `**Tool Results:** ${this.formatResultsFull(step.toolResults)}\n`;
      }
      
      history += '\n---\n\n';
    }
    
    return history;
  }

  /**
   * 获取当前步骤号
   */
  getCurrentStepNumber(): number {
    return this.currentStep;
  }

  /**
   * 获取最近的步骤
   */
  getRecentSteps(count: number = 5): ExecutionStep[] {
    return this.steps.slice(-count);
  }

  /**
   * 获取特定步骤
   */
  getStep(stepNumber: number): ExecutionStep | undefined {
    return this.steps.find(s => s.stepNumber === stepNumber);
  }

  /**
   * 获取执行统计信息
   */
  getStats(): {
    totalSteps: number;
    completedSteps: number;
    pendingSteps: number;
    averageToolsPerStep: number;
  } {
    const totalSteps = this.steps.length;
    const completedSteps = this.steps.filter(s => s.completed).length;
    const pendingSteps = totalSteps - completedSteps;
    const totalTools = this.steps.reduce((sum, s) => sum + s.toolCalls.length, 0);
    const averageToolsPerStep = totalSteps > 0 ? totalTools / totalSteps : 0;

    return {
      totalSteps,
      completedSteps,
      pendingSteps,
      averageToolsPerStep: Math.round(averageToolsPerStep * 100) / 100
    };
  }

  /**
   * 查找包含特定工具的步骤
   */
  findStepsWithTool(toolName: string): ExecutionStep[] {
    return this.steps.filter(step => 
      step.toolCalls.some(tc => tc.name === toolName)
    );
  }

  /**
   * 获取最后一个成功的步骤
   */
  getLastCompletedStep(): ExecutionStep | undefined {
    for (let i = this.steps.length - 1; i >= 0; i--) {
      if (this.steps[i].completed && this.isSuccessfulStep(this.steps[i])) {
        return this.steps[i];
      }
    }
    return undefined;
  }

  /**
   * 重置执行历史
   */
  reset(): void {
    this.steps = [];
    this.currentStep = 1;
  }

  /**
   * 序列化执行历史（用于持久化）
   */
  serialize(): string {
    return JSON.stringify({
      steps: this.steps,
      currentStep: this.currentStep,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 反序列化执行历史
   */
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.steps = parsed.steps.map((step: any) => ({
        ...step,
        timestamp: new Date(step.timestamp)
      }));
      this.currentStep = parsed.currentStep;
    } catch (error) {
      console.error('Failed to deserialize execution history:', error);
    }
  }

  private formatTimestamp(timestamp: Date): string {
    return timestamp.toISOString().substring(11, 19); // HH:MM:SS
  }

  private truncate(text: string, maxLength: number): string {
    // 保留原方法以兼容其他地方的调用，但不再截断
    return text;
  }

  private formatToolCallFull(toolCall: ToolCallParams): string {
    const params = toolCall.parameters || {};
    
    if (Object.keys(params).length === 0) {
      return 'no parameters';
    }
    
    // 返回完整的参数信息，不截断
    return JSON.stringify(params, null, 2);
  }

  private formatResultsFull(results: any[]): string {
    return results.map((result, index) => {
      if (typeof result === 'object' && result !== null) {
        return `Result ${index + 1}: ${JSON.stringify(result, null, 2)}`;
      }
      return `Result ${index + 1}: ${String(result)}`;
    }).join('\n');
  }

  private isSuccessfulStep(step: ExecutionStep): boolean {
    if (step.toolResults.length === 0) return true; // 没有工具调用的步骤认为是成功的
    
    return step.toolResults.every(result => {
      if (typeof result === 'object' && result !== null) {
        return result.success !== false && !result.error;
      }
      return true;
    });
  }

  private truncatePrompt(prompt: string, maxLength: number): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '... [truncated]';
  }

  /**
   * 保存所有prompt到文件（用于prompt分析和优化）
   */
  async savePromptsToFile(filePath: string, options?: {
    includeMetadata?: boolean;
    formatType?: 'markdown' | 'json' | 'txt';
    stepRange?: { start?: number; end?: number };
  }): Promise<void> {
    try {
      const { includeMetadata = true, formatType = 'markdown', stepRange = {} } = options || {};
      
      let stepsToSave = this.steps.filter(step => step.prompt);
      
      // 应用步骤范围过滤
      if (stepRange.start !== undefined || stepRange.end !== undefined) {
        stepsToSave = stepsToSave.filter(step => {
          const stepNum = step.stepNumber;
          return (stepRange.start === undefined || stepNum >= stepRange.start) &&
                 (stepRange.end === undefined || stepNum <= stepRange.end);
        });
      }

      let content = '';
      
      if (formatType === 'markdown') {
        content = this.formatPromptsAsMarkdown(stepsToSave, includeMetadata);
      } else if (formatType === 'json') {
        content = this.formatPromptsAsJson(stepsToSave, includeMetadata);
      } else {
        content = this.formatPromptsAsText(stepsToSave, includeMetadata);
      }

      // 使用Node.js的fs模块写入文件
      const fs = await import('fs');
      const path = await import('path');
      
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`Prompts saved to: ${filePath}`);
      
    } catch (error) {
      console.error('Failed to save prompts to file:', error);
      throw error;
    }
  }

  /**
   * 获取prompt统计信息
   */
  getPromptStats(): {
    totalStepsWithPrompts: number;
    averagePromptLength: number;
    maxPromptLength: number;
    minPromptLength: number;
    promptLengthTrend: { stepNumber: number; length: number }[];
  } {
    const stepsWithPrompts = this.steps.filter(step => step.prompt);
    
    if (stepsWithPrompts.length === 0) {
      return {
        totalStepsWithPrompts: 0,
        averagePromptLength: 0,
        maxPromptLength: 0,
        minPromptLength: 0,
        promptLengthTrend: []
      };
    }

    const promptLengths = stepsWithPrompts.map(step => step.prompt!.length);
    const total = promptLengths.reduce((sum, len) => sum + len, 0);

    return {
      totalStepsWithPrompts: stepsWithPrompts.length,
      averagePromptLength: Math.round(total / stepsWithPrompts.length),
      maxPromptLength: Math.max(...promptLengths),
      minPromptLength: Math.min(...promptLengths),
      promptLengthTrend: stepsWithPrompts.map(step => ({
        stepNumber: step.stepNumber,
        length: step.prompt!.length
      }))
    };
  }

  /**
   * 分析prompt演化模式
   */
  analyzePromptEvolution(): {
    lengthGrowthPattern: 'increasing' | 'decreasing' | 'stable' | 'fluctuating';
    averageGrowthPerStep: number;
    significantChanges: { fromStep: number; toStep: number; changePercent: number }[];
  } {
    const stepsWithPrompts = this.steps.filter(step => step.prompt);
    
    if (stepsWithPrompts.length < 2) {
      return {
        lengthGrowthPattern: 'stable',
        averageGrowthPerStep: 0,
        significantChanges: []
      };
    }

    const lengths = stepsWithPrompts.map(step => step.prompt!.length);
    const changes = [];
    let totalChange = 0;

    for (let i = 1; i < lengths.length; i++) {
      const change = lengths[i] - lengths[i - 1];
      changes.push(change);
      totalChange += change;
    }

    const averageChange = totalChange / changes.length;
    
    // 判断增长模式
    let pattern: 'increasing' | 'decreasing' | 'stable' | 'fluctuating' = 'stable';
    const positiveChanges = changes.filter(c => c > 0).length;
    const negativeChanges = changes.filter(c => c < 0).length;
    
    if (positiveChanges > negativeChanges * 2) pattern = 'increasing';
    else if (negativeChanges > positiveChanges * 2) pattern = 'decreasing';
    else if (Math.abs(averageChange) < 50) pattern = 'stable';
    else pattern = 'fluctuating';

    // 找出显著变化（超过20%的变化）
    const significantChanges = [];
    for (let i = 1; i < lengths.length; i++) {
      const changePercent = ((lengths[i] - lengths[i - 1]) / lengths[i - 1]) * 100;
      if (Math.abs(changePercent) > 20) {
        significantChanges.push({
          fromStep: stepsWithPrompts[i - 1].stepNumber,
          toStep: stepsWithPrompts[i].stepNumber,
          changePercent: Math.round(changePercent * 100) / 100
        });
      }
    }

    return {
      lengthGrowthPattern: pattern,
      averageGrowthPerStep: Math.round(averageChange * 100) / 100,
      significantChanges
    };
  }

  private formatPromptsAsMarkdown(steps: ExecutionStep[], includeMetadata: boolean): string {
    let content = `# Prompt Execution History\n\n`;
    
    if (includeMetadata) {
      const stats = this.getPromptStats();
      const evolution = this.analyzePromptEvolution();
      
      content += `## Summary\n\n`;
      content += `- **Total Steps with Prompts**: ${stats.totalStepsWithPrompts}\n`;
      content += `- **Average Prompt Length**: ${stats.averagePromptLength} characters\n`;
      content += `- **Length Range**: ${stats.minPromptLength} - ${stats.maxPromptLength} characters\n`;
      content += `- **Growth Pattern**: ${evolution.lengthGrowthPattern}\n`;
      content += `- **Average Growth per Step**: ${evolution.averageGrowthPerStep} characters\n\n`;
      
      if (evolution.significantChanges.length > 0) {
        content += `### Significant Changes\n\n`;
        for (const change of evolution.significantChanges) {
          content += `- Step ${change.fromStep} → ${change.toStep}: ${change.changePercent > 0 ? '+' : ''}${change.changePercent}%\n`;
        }
        content += '\n';
      }
      
      content += `---\n\n`;
    }
    
    for (const step of steps) {
      content += `## Step ${step.stepNumber} - ${this.formatTimestamp(step.timestamp)}\n\n`;
      
      if (includeMetadata) {
        content += `**Metadata:**\n`;
        content += `- Prompt Length: ${step.prompt!.length} characters\n`;
        content += `- Tool Calls: ${step.toolCalls.length}\n`;
        content += `- Status: ${step.completed ? 'Completed' : 'In Progress'}\n\n`;
      }
      
      content += `**Prompt:**\n\`\`\`\n${step.prompt!}\n\`\`\`\n\n`;
      
      if (step.thinking) {
        content += `**Thinking Summary:**\n`;
        content += `- Analysis: ${step.thinking.analysis.substring(0, 100)}...\n`;
        content += `- Plan: ${step.thinking.plan.substring(0, 100)}...\n\n`;
      }
      
      content += `---\n\n`;
    }
    
    return content;
  }

  private formatPromptsAsJson(steps: ExecutionStep[], includeMetadata: boolean): string {
    const data = {
      metadata: includeMetadata ? {
        exportTime: new Date().toISOString(),
        stats: this.getPromptStats(),
        evolution: this.analyzePromptEvolution()
      } : undefined,
      steps: steps.map(step => ({
        stepNumber: step.stepNumber,
        timestamp: step.timestamp.toISOString(),
        promptLength: step.prompt!.length,
        prompt: step.prompt!,
        toolCallsCount: step.toolCalls.length,
        toolCalls: step.toolCalls.map(tc => ({ name: tc.name, call_id: tc.call_id })),
        completed: step.completed,
        thinking: step.thinking ? {
          analysis: step.thinking.analysis,
          plan: step.thinking.plan,
          reasoning: step.thinking.reasoning,
          nextAction: step.thinking.nextAction
        } : null
      }))
    };
    
    return JSON.stringify(data, null, 2);
  }

  private formatPromptsAsText(steps: ExecutionStep[], includeMetadata: boolean): string {
    let content = `PROMPT EXECUTION HISTORY\n`;
    content += `========================\n\n`;
    
    if (includeMetadata) {
      const stats = this.getPromptStats();
      content += `SUMMARY:\n`;
      content += `- Total Steps: ${stats.totalStepsWithPrompts}\n`;
      content += `- Avg Length: ${stats.averagePromptLength} chars\n`;
      content += `- Range: ${stats.minPromptLength} - ${stats.maxPromptLength} chars\n\n`;
    }
    
    for (const step of steps) {
      content += `STEP ${step.stepNumber} (${this.formatTimestamp(step.timestamp)})\n`;
      content += `${'='.repeat(50)}\n`;
      content += `Length: ${step.prompt!.length} characters\n`;
      content += `Tools: ${step.toolCalls.length}\n`;
      content += `Status: ${step.completed ? 'Completed' : 'In Progress'}\n\n`;
      content += `PROMPT:\n`;
      content += `${step.prompt!}\n\n`;
      content += `${'='.repeat(50)}\n\n`;
    }
    
    return content;
  }
} 