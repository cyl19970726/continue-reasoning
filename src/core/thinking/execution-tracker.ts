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
}

export interface ExecutionHistoryRenderOptions {
  includeThinking?: boolean;
  includeResponse?: boolean;
  includeToolCalls?: boolean;
  includeToolResults?: boolean;
  maxSteps?: number;
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
    maxSteps: 5
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
  addStep(thinking: ParsedThinking | null, response: ParsedResponse | null, toolCalls: ToolCallParams[]): void {
    const step: ExecutionStep = {
      stepNumber: this.currentStep,
      timestamp: new Date(),
      thinking,
      response,
      toolCalls,
      toolResults: [],
      completed: false
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
} 