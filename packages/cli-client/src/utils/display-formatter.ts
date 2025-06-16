import chalk from 'chalk';

/**
 * 格式化 Agent 思考内容的显示
 */
export function formatThinking(thinking: string): string {
  const stars = '✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻ ✻';
  const lines = [
    chalk.yellow(stars),
    chalk.yellow('✻ Thinking…'),
    chalk.yellow(`✻ ${thinking}`),
    chalk.yellow(stars)
  ];
  return lines.join('\n');
}

/**
 * 格式化 Agent 最终回复的显示
 */
export function formatFinalAnswer(content: string): string {
  const separator = '━'.repeat(50);
  const lines = [
    chalk.cyan(separator),
    chalk.green('↩️  agent:'),
    content,
    chalk.cyan(separator)
  ];
  return lines.join('\n');
}

/**
 * 格式化工具调用开始的显示
 */
export function formatToolCallStart(toolName: string, params: any): string {
  const paramsStr = formatToolParams(params);
  return chalk.blue(`🔧 ${toolName}(${paramsStr})`);
}

/**
 * 格式化工具调用结果的显示
 */
export function formatToolCallResult(result: any, success: boolean = true): string {
  const resultStr = formatToolResult(result);
  const color = success ? chalk.green : chalk.red;
  return color(`  ⎿ (${resultStr})`);
}

/**
 * 格式化完整的工具调用显示（开始+结果）
 */
export function formatCompleteToolCall(
  toolName: string, 
  params: any, 
  result: any, 
  success: boolean = true
): string {
  const separator = '━'.repeat(50);
  const startLine = formatToolCallStart(toolName, params);
  const resultLine = formatToolCallResult(result, success);
  
  return [
    chalk.cyan(separator),
    startLine,
    resultLine,
    chalk.cyan(separator)
  ].join('\n');
}

/**
 * 格式化工具参数为字符串
 */
function formatToolParams(params: any): string {
  if (!params || Object.keys(params).length === 0) {
    return '';
  }
  
  // 对于简单参数，直接显示值
  if (typeof params === 'string') {
    return params;
  }
  
  // 对于对象参数，显示关键字段
  if (typeof params === 'object') {
    const entries = Object.entries(params);
    if (entries.length === 1) {
      const [key, value] = entries[0];
      return String(value);
    }
    
    // 多个参数时，只显示前几个关键字段
    const keyFields = entries.slice(0, 2).map(([key, value]) => {
      if (typeof value === 'string' && value.length > 50) {
        return `${key}: ${value.substring(0, 47)}...`;
      }
      return `${key}: ${value}`;
    });
    
    return keyFields.join(', ');
  }
  
  return String(params);
}

/**
 * 格式化工具结果为字符串
 */
function formatToolResult(result: any): string {
  if (result === null || result === undefined) {
    return 'No content';
  }
  
  if (typeof result === 'string') {
    if (result.trim() === '') {
      return 'No content';
    }
    // 限制结果显示长度
    return result.length > 100 ? `${result.substring(0, 97)}...` : result;
  }
  
  if (typeof result === 'object') {
    // 处理标准的工具执行结果
    if (result.stdout !== undefined) {
      return result.stdout.trim() || 'No content';
    }
    
    if (result.success !== undefined) {
      return result.success ? 'Success' : `Error: ${result.error || 'Unknown error'}`;
    }
    
    // 处理其他对象结果
    const str = JSON.stringify(result);
    return str.length > 100 ? `${str.substring(0, 97)}...` : str;
  }
  
  return String(result);
}

/**
 * 格式化错误信息
 */
export function formatError(error: string | Error): string {
  const errorStr = error instanceof Error ? error.message : error;
  return chalk.red(`❌ Error: ${errorStr}`);
}

/**
 * 格式化系统信息
 */
export function formatSystemInfo(message: string): string {
  return chalk.gray(`ℹ️  ${message}`);
} 