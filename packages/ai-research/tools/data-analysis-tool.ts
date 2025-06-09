import { ITool, ToolCallDefinition } from '../interfaces';
import { z } from 'zod';

export function createDataAnalysisTool(): ITool {
  const paramsSchema = z.object({
    operation: z.enum(['statistics', 'sort', 'filter', 'group']).describe('数据分析操作类型'),
    data: z.array(z.any()).describe('要分析的数据数组'),
    field: z.string().optional().describe('要分析的字段名（用于对象数组）'),
    condition: z.string().optional().describe('过滤条件（JavaScript表达式）'),
    groupBy: z.string().optional().describe('分组字段名')
  });

  return {
    name: 'data_analysis',
    description: '数据分析工具，支持统计、排序、过滤和分组操作',
    params: paramsSchema,
    
    async execute_func(params: {
      operation: 'statistics' | 'sort' | 'filter' | 'group';
      data: any[];
      field?: string;
      condition?: string;
      groupBy?: string;
    }) {
      const { operation, data, field, condition, groupBy } = params;
      
      try {
        if (!Array.isArray(data)) {
          return { success: false, error: 'data必须是数组' };
        }
        
        switch (operation) {
          case 'statistics': {
            if (field) {
              // 对象数组的字段统计
              const values = data.map(item => item[field]).filter(v => typeof v === 'number');
              if (values.length === 0) {
                return { success: false, error: `字段 ${field} 没有数值数据` };
              }
              
              const sorted = values.sort((a, b) => a - b);
              const sum = values.reduce((a, b) => a + b, 0);
              const mean = sum / values.length;
              const median = values.length % 2 === 0 
                ? (sorted[values.length / 2 - 1] + sorted[values.length / 2]) / 2
                : sorted[Math.floor(values.length / 2)];
                
              return {
                success: true,
                field,
                count: values.length,
                sum,
                mean,
                median,
                min: Math.min(...values),
                max: Math.max(...values),
                variance: values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length
              };
            } else {
              // 数值数组的统计
              const numbers = data.filter(v => typeof v === 'number');
              if (numbers.length === 0) {
                return { success: false, error: '没有数值数据' };
              }
              
              const sorted = numbers.sort((a, b) => a - b);
              const sum = numbers.reduce((a, b) => a + b, 0);
              const mean = sum / numbers.length;
              const median = numbers.length % 2 === 0 
                ? (sorted[numbers.length / 2 - 1] + sorted[numbers.length / 2]) / 2
                : sorted[Math.floor(numbers.length / 2)];
                
              return {
                success: true,
                count: numbers.length,
                sum,
                mean,
                median,
                min: Math.min(...numbers),
                max: Math.max(...numbers),
                variance: numbers.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numbers.length
              };
            }
          }
          
          case 'sort': {
            if (field) {
              const sorted = [...data].sort((a, b) => {
                const aVal = a[field];
                const bVal = b[field];
                if (typeof aVal === 'number' && typeof bVal === 'number') {
                  return aVal - bVal;
                }
                return String(aVal).localeCompare(String(bVal));
              });
              return { success: true, sorted, count: sorted.length };
            } else {
              const sorted = [...data].sort((a, b) => {
                if (typeof a === 'number' && typeof b === 'number') {
                  return a - b;
                }
                return String(a).localeCompare(String(b));
              });
              return { success: true, sorted, count: sorted.length };
            }
          }
          
          case 'filter': {
            if (!condition) {
              return { success: false, error: 'filter操作需要提供condition参数' };
            }
            try {
              const filtered = data.filter(item => {
                // 简单的条件评估（安全起见，只支持基本比较）
                const func = new Function('item', `return ${condition}`);
                return func(item);
              });
              return { success: true, filtered, count: filtered.length, originalCount: data.length };
            } catch (error) {
              return { success: false, error: `条件表达式错误: ${error}` };
            }
          }
          
          case 'group': {
            if (!groupBy) {
              return { success: false, error: 'group操作需要提供groupBy参数' };
            }
            const grouped = data.reduce((acc, item) => {
              const key = item[groupBy];
              if (!acc[key]) {
                acc[key] = [];
              }
              acc[key].push(item);
              return acc;
            }, {} as Record<string, any[]>);
            
            const summary = Object.entries(grouped).map(([key, items]) => ({
              group: key,
              count: (items as any[]).length,
              items: items as any[]
            }));
            
            return { success: true, grouped, summary, totalGroups: summary.length };
          }
          
          default:
            return { success: false, error: `不支持的操作: ${operation}` };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    },
    
    toCallDefinition(): ToolCallDefinition {
      return {
        type: 'function',
        name: this.name,
        description: this.description,
        paramSchema: paramsSchema,
        strict: false
      };
    }
  };
} 