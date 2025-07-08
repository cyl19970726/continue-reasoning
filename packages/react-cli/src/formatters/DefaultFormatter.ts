import { ToolExecutionResult } from '@continue-reasoning/core';
import chalk from 'chalk';
import { IToolFormatter } from './ToolFormatterRegistry.js';
import { ExtendedToolExecutionResult } from './types.js';

/**
 * 默认工具格式化器
 */
export class DefaultFormatter implements IToolFormatter {
  name = 'DefaultFormatter';
  supportedTools = ['*']; // 支持所有工具

  format(result: ExtendedToolExecutionResult): string {
    const lines = [];
    const toolName = result.name || 'Tool';
    
    // 工具头部
    lines.push(chalk.gray('┌─ ') + chalk.bold(`${toolName.toUpperCase()}`));
    
    // 调用 ID
    if (result.call_id) {
      lines.push(chalk.gray('│ ') + chalk.bold('Call ID: ') + chalk.dim(result.call_id));
    }
    
    // 执行状态
    if (result.success !== undefined) {
      const status = result.success ? chalk.green('✓ Success') : chalk.red('✗ Failed');
      lines.push(chalk.gray('│ ') + chalk.bold('Status: ') + status);
    }
    
    // 执行时间
    if (result.metadata?.duration) {
      lines.push(chalk.gray('│ ') + chalk.bold('Duration: ') + chalk.yellow(`${result.metadata.duration}ms`));
    }
    
    // 主要内容
    lines.push(chalk.gray('├─ ') + chalk.bold('Result'));
    
    if (result.content) {
      this.formatContent(lines, result.content);
    } else if (result.stdout) {
      this.formatContent(lines, result.stdout);
    } else if (result.data) {
      this.formatData(lines, result.data);
    } else {
      lines.push(chalk.gray('│ ') + chalk.dim('(no content)'));
    }
    
    // 错误信息
    if (result.stderr) {
      lines.push(chalk.gray('├─ ') + chalk.red.bold('Error Output'));
      this.formatContent(lines, result.stderr, chalk.red);
    }
    
    if (result.error) {
      lines.push(chalk.gray('├─ ') + chalk.red.bold('Error'));
      lines.push(chalk.gray('│ ') + chalk.red(result.error));
    }
    
    // 元数据
    if (result.metadata && Object.keys(result.metadata).length > 0) {
      lines.push(chalk.gray('├─ ') + chalk.bold('Metadata'));
      this.formatMetadata(lines, result.metadata);
    }
    
    lines.push(chalk.gray('└─'));
    return lines.join('\n');
  }

  private formatContent(lines: string[], content: any, colorFn = chalk.white): void {
    let text = '';
    
    if (typeof content === 'string') {
      text = content;
    } else if (content && typeof content === 'object') {
      try {
        text = JSON.stringify(content, null, 2);
      } catch {
        text = content.toString();
      }
    } else {
      text = String(content);
    }
    
    // 限制显示行数
    const maxLines = 20;
    const contentLines = text.split('\n');
    const displayLines = contentLines.slice(0, maxLines);
    
    displayLines.forEach(line => {
      lines.push(chalk.gray('│ ') + colorFn(line));
    });
    
    if (contentLines.length > maxLines) {
      const remaining = contentLines.length - maxLines;
      lines.push(chalk.gray('│ ') + chalk.dim(`... (${remaining} more lines)`));
    }
  }

  private formatData(lines: string[], data: any): void {
    if (Array.isArray(data)) {
      lines.push(chalk.gray('│ ') + chalk.bold(`Array (${data.length} items)`));
      data.slice(0, 5).forEach((item, index) => {
        const preview = this.getPreview(item);
        lines.push(chalk.gray('│ ') + `  [${index}] ${preview}`);
      });
      
      if (data.length > 5) {
        lines.push(chalk.gray('│ ') + chalk.dim(`  ... and ${data.length - 5} more items`));
      }
    } else if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      lines.push(chalk.gray('│ ') + chalk.bold(`Object (${keys.length} properties)`));
      
      keys.slice(0, 5).forEach(key => {
        const preview = this.getPreview(data[key]);
        lines.push(chalk.gray('│ ') + `  ${chalk.cyan(key)}: ${preview}`);
      });
      
      if (keys.length > 5) {
        lines.push(chalk.gray('│ ') + chalk.dim(`  ... and ${keys.length - 5} more properties`));
      }
    } else {
      lines.push(chalk.gray('│ ') + String(data));
    }
  }

  private formatMetadata(lines: string[], metadata: any): void {
    const keys = Object.keys(metadata);
    keys.forEach(key => {
      const value = this.getPreview(metadata[key]);
      lines.push(chalk.gray('│ ') + `  ${chalk.blue(key)}: ${value}`);
    });
  }

  private getPreview(value: any): string {
    if (value === null) return chalk.dim('null');
    if (value === undefined) return chalk.dim('undefined');
    if (typeof value === 'boolean') return chalk.yellow(value.toString());
    if (typeof value === 'number') return chalk.yellow(value.toString());
    if (typeof value === 'string') {
      if (value.length > 50) {
        return chalk.green(`"${value.slice(0, 47)}..."`);
      }
      return chalk.green(`"${value}"`);
    }
    if (Array.isArray(value)) {
      return chalk.dim(`Array(${value.length})`);
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      return chalk.dim(`Object(${keys.length})`);
    }
    return chalk.dim(typeof value);
  }

  formatError(error: Error): string {
    return [
      chalk.red('┌─ ') + chalk.red.bold('Tool Error'),
      chalk.red('│ ') + chalk.red(error.message),
      ...(error.stack ? [
        chalk.red('├─ ') + chalk.red.bold('Stack Trace'),
        ...error.stack.split('\n').slice(1, 4).map(line => 
          chalk.red('│ ') + chalk.dim(line.trim())
        )
      ] : []),
      chalk.red('└─')
    ].join('\n');
  }
}