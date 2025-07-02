import chalk from 'chalk';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Interface for tool result formatters
 */
export interface IToolResultFormatter {
  /**
   * Format tool call parameters for display
   */
  formatToolCall(toolCall: ToolCallParams): string;
  
  /**
   * Format tool execution result for display
   */
  formatToolResult(result: ToolExecutionResult): string;
  
  /**
   * Check if content should be truncated
   */
  shouldTruncate(content: string): boolean;
  
  /**
   * Truncate content to specified line limit
   */
  truncateContent(content: string, maxLines: number): string;
}

/**
 * Base class for tool result formatters with common functionality
 */
export abstract class BaseToolResultFormatter implements IToolResultFormatter {
  protected maxLines: number = 100;
  protected maxLineLength: number = 120;
  
  constructor(maxLines: number = 100) {
    this.maxLines = maxLines;
  }
  
  /**
   * Format tool call - must be implemented by subclasses
   */
  abstract formatToolCall(toolCall: ToolCallParams): string;
  
  /**
   * Format tool result - must be implemented by subclasses
   */
  abstract formatToolResult(result: ToolExecutionResult): string;
  
  /**
   * Check if content should be truncated
   */
  shouldTruncate(content: string): boolean {
    if (!content) return false;
    const lines = content.split('\n');
    return lines.length > this.maxLines;
  }
  
  /**
   * Truncate content to specified line limit
   */
  truncateContent(content: string, maxLines: number = this.maxLines): string {
    if (!content) return '';
    
    const lines = content.split('\n');
    if (lines.length <= maxLines) return content;
    
    const truncated = lines.slice(0, maxLines - 1);
    truncated.push(chalk.gray(`... (${lines.length - maxLines + 1} more lines)`));
    return truncated.join('\n');
  }
  
  /**
   * Truncate long lines in content
   */
  protected truncateLongLines(content: string): string {
    if (!content) return '';
    
    return content.split('\n').map(line => {
      if (line.length > this.maxLineLength) {
        return line.substring(0, this.maxLineLength - 3) + '...';
      }
      return line;
    }).join('\n');
  }
  
  /**
   * Format error result
   */
  protected formatError(toolName: string, error: string | Error): string {
    const errorMessage = error instanceof Error ? error.message : error;
    const lines = [
      chalk.red(`❌ ${toolName} failed`),
      chalk.red(`   Error: ${errorMessage}`)
    ];
    return lines.join('\n');
  }
  
  /**
   * Extract error message from result
   */
  protected extractErrorMessage(result: ToolExecutionResult): string | null {
    if (result.status === 'failed') {
      return result.message || 'Unknown error';
    }
    
    if (result.result && typeof result.result === 'object') {
      const res = result.result as any;
      if (res.error) return res.error;
      if (res.message && !res.success) return res.message;
    }
    
    return null;
  }
  
  /**
   * Format duration in human-readable format
   */
  protected formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  
  /**
   * Format file size in human-readable format
   */
  protected formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  
  /**
   * Create a box around content
   */
  protected createBox(title: string, content: string, color: typeof chalk = chalk.cyan): string {
    const separator = '─'.repeat(50);
    const lines = [
      color(`┌${separator}┐`),
      color(`│ ${title.padEnd(48)} │`),
      color(`├${separator}┤`),
      ...content.split('\n').map(line => `│ ${line.padEnd(48)} │`),
      color(`└${separator}┘`)
    ];
    return lines.join('\n');
  }
  
  /**
   * Create a tree structure display
   */
  protected createTree(title: string, items: { label: string; value: string }[]): string {
    const lines = [chalk.cyan(`${title}`)];
    
    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const prefix = isLast ? '└─' : '├─';
      lines.push(chalk.gray(`${prefix} ${item.label}: `) + chalk.white(item.value));
    });
    
    return lines.join('\n');
  }
  
  /**
   * Highlight code with basic syntax highlighting
   */
  protected highlightCode(code: string, language: string = 'text'): string {
    // Basic syntax highlighting for common patterns
    if (language === 'javascript' || language === 'typescript' || language === 'js' || language === 'ts') {
      return code
        .replace(/\b(const|let|var|function|class|interface|type|import|export|from|return|if|else|for|while)\b/g, chalk.blue('$1'))
        .replace(/\b(true|false|null|undefined)\b/g, chalk.yellow('$1'))
        .replace(/(["'`])([^"'`]*)\1/g, (match, quote, content) => chalk.green(match))
        .replace(/\/\/.*/g, chalk.gray('$&'))
        .replace(/\/\*[\s\S]*?\*\//g, chalk.gray('$&'));
    }
    
    return code;
  }
}