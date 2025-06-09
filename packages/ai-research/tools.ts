import { ITool, ToolCallDefinition } from './interfaces';
import { z } from 'zod';

// Web 搜索工具（模拟实现）
export class WebSearchTool implements ITool {
  name = 'web_search';
  description = '在网络中搜索给定查询内容';
  params = z.object({ 
    query: z.string().describe('搜索关键词') 
  });

  async execute_func(params: { query: string }) {
    // 模拟搜索延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 模拟搜索结果
    const mockResults = [
      `搜索"${params.query}"的结果1：相关信息内容...`,
      `搜索"${params.query}"的结果2：更多相关信息...`,
      `搜索"${params.query}"的结果3：其他相关内容...`
    ];
    
    return {
      query: params.query,
      results: mockResults,
      total: mockResults.length
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

// 计算器工具
export class CalculatorTool implements ITool {
  name = 'calculator';
  description = '计算数学表达式';
  params = z.object({ 
    expression: z.string().describe('数学表达式，如 "2+3*4" 或 "Math.pow(25, 0.23)"') 
  });

  async execute_func(params: { expression: string }) {
    try {
      // 简单的表达式计算（实际应用中应该使用更安全的方法）
      // 这里只允许基本的数学操作和 Math 对象的方法
      const allowedExpression = params.expression
        .replace(/[^0-9+\-*/().,\s]/g, (match) => {
          // 只允许数字、基本运算符、括号、点号、逗号、空格
          if (['Math.pow', 'Math.sqrt', 'Math.abs', 'Math.round', 'Math.floor', 'Math.ceil'].some(fn => params.expression.includes(fn))) {
            return match;
          }
          return '';
        });

      const result = eval(allowedExpression);
      
      return {
        expression: params.expression,
        result: result,
        type: typeof result
      };
    } catch (error) {
      throw new Error(`计算错误: ${error instanceof Error ? error.message : String(error)}`);
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

// 时间工具
export class TimeTool implements ITool {
  name = 'get_time';
  description = '获取当前时间信息';
  params = z.object({ 
    format: z.string().optional().describe('时间格式，如 "iso", "local", "timestamp"') 
  });

  async execute_func(params: { format?: string }) {
    const now = new Date();
    
    switch (params.format) {
      case 'iso':
        return { time: now.toISOString(), format: 'ISO' };
      case 'timestamp':
        return { time: now.getTime(), format: 'timestamp' };
      case 'local':
      default:
        return { time: now.toLocaleString(), format: 'local' };
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

// 文件操作工具（模拟）
export class FileOperationTool implements ITool {
  name = 'file_operation';
  description = '执行文件操作（读取、写入、列表）';
  params = z.object({
    operation: z.enum(['read', 'write', 'list']).describe('操作类型'),
    path: z.string().describe('文件路径'),
    content: z.string().optional().describe('写入内容（仅write操作需要）')
  });

  async execute_func(params: { operation: 'read' | 'write' | 'list'; path: string; content?: string }) {
    // 模拟文件操作
    await new Promise(resolve => setTimeout(resolve, 200));
    
    switch (params.operation) {
      case 'read':
        return {
          operation: 'read',
          path: params.path,
          content: `模拟读取文件 ${params.path} 的内容...`,
          size: 1024
        };
        
      case 'write':
        return {
          operation: 'write',
          path: params.path,
          content: params.content || '',
          success: true,
          bytesWritten: params.content?.length || 0
        };
        
      case 'list':
        return {
          operation: 'list',
          path: params.path,
          files: [`${params.path}/file1.txt`, `${params.path}/file2.txt`, `${params.path}/dir1/`],
          count: 3
        };
        
      default:
        throw new Error(`不支持的操作: ${params.operation}`);
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

// 工具工厂函数
export function createBasicTools(): ITool[] {
  return [
    new WebSearchTool(),
    new CalculatorTool(),
    new TimeTool(),
    new FileOperationTool()
  ];
}

// 创建特定工具的便捷函数
export function createWebSearchTool(): WebSearchTool {
  return new WebSearchTool();
}

export function createCalculatorTool(): CalculatorTool {
  return new CalculatorTool();
}

export function createTimeTool(): TimeTool {
  return new TimeTool();
}

export function createFileOperationTool(): FileOperationTool {
  return new FileOperationTool();
} 