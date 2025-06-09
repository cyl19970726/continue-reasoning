import { ITool, ToolCallDefinition } from '../interfaces';
import { z } from 'zod';

// 计算器工具
export class CalculatorTool implements ITool {
  name = 'calculator';
  description = '计算数学表达式';
  params = z.object({ 
    expression: z.string().describe('数学表达式，如 "2+3*4" 或 "Math.pow(25, 0.23)"')
  });

  async execute_func(params: { expression: string }) {
    try {
      // 使用 Function 构造函数安全地执行数学表达式
      const result = Function(`"use strict"; return (${params.expression})`)();
      return {
        expression: params.expression,
        result: result,
        type: typeof result
      };
    } catch (error) {
      throw new Error(`计算表达式失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  toCallDefinition(): ToolCallDefinition {
    return {
      type: 'function',
      name: this.name,
      description: this.description,
      paramSchema: this.params,
      strict: false
    };
  }
}

// 思考工具 - 帮助 function-call agent 进行显式推理
export class ThinkTool implements ITool {
  name = 'think';
  description = '用于记录思考过程和推理步骤，帮助分析问题和制定执行计划';
  params = z.object({ 
    thought: z.string().describe('当前的思考内容，包括问题分析、执行计划或推理过程')
  });

  async execute_func(params: { thought: string }) {
    // 思考工具不需要实际执行，只是记录思考过程
    return {
      thought: params.thought,
      timestamp: new Date().toISOString(),
      action: 'thinking_recorded'
    };
  }

  toCallDefinition(): ToolCallDefinition {
    return {
      type: 'function',
      name: this.name,
      description: this.description,
      paramSchema: this.params,
      strict: false
    };
  }
}

// 时间工具
export class TimeTool implements ITool {
  name = 'get_time';
  description = '获取当前时间';
  params = z.object({
    timezone: z.string().optional().describe('时区，如 "Asia/Shanghai"，默认为 UTC')
  });

  async execute_func(params: { timezone?: string }) {
    const now = new Date();
    return {
      timestamp: now.toISOString(),
      timezone: params.timezone || 'UTC',
      formatted: params.timezone 
        ? now.toLocaleString('zh-CN', { timeZone: params.timezone })
        : now.toUTCString()
    };
  }

  toCallDefinition(): ToolCallDefinition {
    return {
      type: 'function',
      name: this.name,
      description: this.description,
      paramSchema: this.params,
      strict: false
    };
  }
}

// 便捷函数
export function createCalculatorTool(): CalculatorTool {
  return new CalculatorTool();
}

export function createThinkTool(): ThinkTool {
  return new ThinkTool();
}

export function createTimeTool(): TimeTool {
  return new TimeTool();
}

export function createBasicTools(): [CalculatorTool, ThinkTool, TimeTool] {
  return [
    createCalculatorTool(),
    createThinkTool(), 
    createTimeTool()
  ];
} 