import chalk from 'chalk';
import { BaseToolResultFormatter } from './base';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Default formatter for tools without specific formatters
 */
export class DefaultToolFormatter extends BaseToolResultFormatter {
  formatToolCall(toolCall: ToolCallParams): string {
    const params = toolCall.parameters;
    const paramCount = params ? Object.keys(params).length : 0;
    
    const items = [];
    
    // Show first few parameters
    if (params && typeof params === 'object') {
      const entries = Object.entries(params).slice(0, 3);
      for (const [key, value] of entries) {
        const displayValue = this.formatParamValue(value);
        items.push({ label: key, value: displayValue });
      }
      
      if (paramCount > 3) {
        items.push({ label: '...', value: `${paramCount - 3} more parameters` });
      }
    }
    
    return this.createTree(`🔧 ${toolCall.name}`, items);
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    const error = this.extractErrorMessage(result);
    if (error) {
      return this.formatError(result.name, error);
    }
    
    const data = result.result;
    const lines = [];
    
    // Success header
    lines.push(chalk.green(`✅ ${result.name} completed`));
    
    // Execution time if available
    if (result.executionTime !== undefined) {
      lines.push(chalk.gray(`└─ Duration: ${this.formatDuration(result.executionTime)}`));
    }
    
    // Format result based on type
    if (data === null || data === undefined) {
      lines.push(chalk.gray('\n(No result data)'));
    } else if (typeof data === 'string') {
      lines.push(chalk.cyan('\n📤 Result:'));
      lines.push(this.formatStringResult(data));
    } else if (typeof data === 'object') {
      lines.push(chalk.cyan('\n📤 Result:'));
      lines.push(this.formatObjectResult(data));
    } else {
      lines.push(chalk.cyan('\n📤 Result:'));
      lines.push(`  ${String(data)}`);
    }
    
    return lines.join('\n');
  }
  
  private formatParamValue(value: any): string {
    if (value === null || value === undefined) {
      return chalk.gray('null');
    }
    
    if (typeof value === 'string') {
      return value.length > 50 ? value.substring(0, 47) + '...' : value;
    }
    
    if (typeof value === 'boolean') {
      return chalk.yellow(String(value));
    }
    
    if (typeof value === 'number') {
      return chalk.cyan(String(value));
    }
    
    if (Array.isArray(value)) {
      return `[${value.length} items]`;
    }
    
    if (typeof value === 'object') {
      return `{${Object.keys(value).length} fields}`;
    }
    
    return String(value);
  }
  
  private formatStringResult(result: string): string {
    const lines = result.split('\n');
    const shouldTruncate = lines.length > 20;
    const linesToShow = shouldTruncate ? 19 : lines.length;
    
    const formatted = lines
      .slice(0, linesToShow)
      .map(line => '  ' + (line.length > 100 ? line.substring(0, 97) + '...' : line))
      .join('\n');
    
    if (shouldTruncate) {
      return formatted + '\n' + chalk.gray(`  ... (${lines.length - linesToShow} more lines)`);
    }
    
    return formatted;
  }
  
  private formatObjectResult(result: any): string {
    const lines = [];
    
    // Special handling for common patterns
    if ('success' in result && typeof result.success === 'boolean') {
      lines.push(`  Success: ${result.success ? chalk.green('true') : chalk.red('false')}`);
      if (result.message) {
        lines.push(`  Message: ${result.message}`);
      }
    }
    
    // Pretty print JSON with truncation
    try {
      const json = JSON.stringify(result, null, 2);
      const jsonLines = json.split('\n');
      const maxLines = 20;
      
      if (jsonLines.length <= maxLines) {
        lines.push(...jsonLines.map(line => '  ' + line));
      } else {
        lines.push(...jsonLines.slice(0, maxLines - 1).map(line => '  ' + line));
        lines.push(chalk.gray(`  ... (${jsonLines.length - maxLines + 1} more lines)`));
      }
    } catch (error) {
      // Fallback for circular references or other issues
      lines.push(`  ${String(result)}`);
    }
    
    return lines.join('\n');
  }
}