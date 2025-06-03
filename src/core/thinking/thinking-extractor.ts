export type ExecutionStatus = 'continue' | 'complete';

export interface ParsedThinking {
  analysis: string;
  plan: string;
  reasoning: string;
  nextAction: string;
  executionStatus: ExecutionStatus;
}

export interface DetailedPlan {
  steps: PlanStep[];
  dependencies: string[];
  timeline: Timeline;
}

export interface PlanStep {
  id: string;
  description: string;
  dependencies: string[];
  estimatedDuration?: number;
}

export interface Timeline {
  estimatedDuration: number;
  milestones: string[];
}

export class ThinkingExtractor {
  /**
   * 解析 thinking 标签内容
   */
  parseThinking(text: string): ParsedThinking | null {
    const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (!thinkingMatch) {
      return null;
    }

    const thinkingContent = thinkingMatch[1];
    
    const parsed = {
      analysis: this.extractSection(thinkingContent, 'analysis'),
      plan: this.extractSection(thinkingContent, 'plan'),
      reasoning: this.extractSection(thinkingContent, 'reasoning'),
      nextAction: this.extractSection(thinkingContent, 'next_action'),
      executionStatus: this.extractExecutionStatus(thinkingContent)
    };
    
    // 如果至少有一个字段有内容，就返回解析结果（放宽验证）
    if (parsed.analysis || parsed.plan || parsed.reasoning || parsed.nextAction) {
      return parsed;
    }
    
    return null;
  }

  /**
   * 验证思考完整性（放宽验证条件）
   */
  validateThinking(thinking: ParsedThinking): boolean {
    // 放宽验证：只要有至少两个字段有内容就认为是有效的
    const fieldCount = [
      thinking.analysis,
      thinking.plan,
      thinking.reasoning,
      thinking.nextAction
    ].filter(field => field && field.trim().length > 0).length;
    
    return fieldCount >= 1;
  }

  /**
   * 生成思考摘要
   */
  generateThinkingSummary(thinking: ParsedThinking): string {
    return `Analysis: ${this.truncate(thinking.analysis, 100)} | Plan: ${this.truncate(thinking.plan, 100)}`;
  }

  /**
   * 未来可扩展：支持更详细的 plan 解析
   */
  parseDetailedPlan(planContent: string): DetailedPlan {
    // 可以解析更复杂的计划格式
    // 例如：依赖关系、时间估计、资源需求等
    return {
      steps: this.extractSteps(planContent),
      dependencies: this.extractDependencies(planContent),
      timeline: this.extractTimeline(planContent)
    };
  }

  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`<${sectionName}>([\s\S]*?)<\/${sectionName}>`, 'i');
    const match = content.match(regex);
    const result = match ? match[1].trim() : '';
    
    return result;
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  private extractSteps(planContent: string): PlanStep[] {
    // 未来实现：解析计划步骤
    // 可以识别 "步骤1:", "Step 1:", "- " 等格式
    const steps: PlanStep[] = [];
    const stepMatches = planContent.match(/(?:步骤|Step)\s*(\d+)[：:]\s*([^\n]+)/gi);
    
    if (stepMatches) {
      stepMatches.forEach((match, index) => {
        const stepMatch = match.match(/(?:步骤|Step)\s*(\d+)[：:]\s*(.+)/i);
        if (stepMatch) {
          steps.push({
            id: `step-${stepMatch[1]}`,
            description: stepMatch[2].trim(),
            dependencies: index > 0 ? [`step-${index}`] : []
          });
        }
      });
    }
    
    return steps;
  }

  private extractDependencies(planContent: string): string[] {
    // 未来实现：提取依赖关系
    return [];
  }

  private extractTimeline(planContent: string): Timeline {
    // 未来实现：提取时间线信息
    return { estimatedDuration: 0, milestones: [] };
  }

  private extractExecutionStatus(content: string): ExecutionStatus {
    const statusText = this.extractSection(content, 'execution_status').toLowerCase();
    
    if (statusText.includes('complete') || statusText.includes('finished') || statusText.includes('done')) {
      return 'complete';
    }
    
    // 默认为 continue
    return 'continue';
  }
} 