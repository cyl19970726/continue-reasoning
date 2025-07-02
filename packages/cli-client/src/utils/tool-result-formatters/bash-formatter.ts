import chalk from 'chalk';
import { BaseToolResultFormatter } from './base';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Formatter for BashToolSet results
 */
export class BashToolFormatter extends BaseToolResultFormatter {
  formatToolCall(toolCall: ToolCallParams): string {
    const params = toolCall.parameters as any;
    const command = params.command || '';
    const description = params.description || '';
    const timeout = params.timeout;
    
    const items = [
      { label: 'Command', value: chalk.yellow(command) }
    ];
    
    if (description) {
      items.push({ label: 'Purpose', value: description });
    }
    
    if (timeout !== undefined) {
      items.push({ label: 'Timeout', value: `${timeout}ms` });
    }
    
    return this.createTree('🖥️ BashCommand', items);
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    const error = this.extractErrorMessage(result);
    if (error) {
      return this.formatError('BashCommand', error);
    }
    
    const data = result.result as any;
    if (!data) {
      return chalk.gray('No output');
    }
    
    const lines = [];
    
    // Handle string result (simple output)
    if (typeof data === 'string') {
      lines.push(chalk.green('✅ Command executed'));
      lines.push(chalk.cyan('\n📤 Output:'));
      lines.push(this.formatCommandOutput(data));
      return lines.join('\n');
    }
    
    // Handle object result
    if (typeof data === 'object') {
      // Check for error status
      if (data.success === false || data.exitCode !== 0) {
        lines.push(chalk.red('❌ Command failed'));
        if (data.exitCode !== undefined) {
          lines.push(chalk.red(`├─ Exit code: ${data.exitCode}`));
        }
        if (data.command) {
          lines.push(chalk.red(`└─ Command: ${data.command}`));
        }
      } else {
        lines.push(chalk.green('✅ Command executed successfully'));
      }
      
      // Execution time
      if (result.executionTime !== undefined) {
        lines.push(chalk.gray(`├─ Duration: ${this.formatDuration(result.executionTime)}`));
      }
      
      // Exit code (for successful commands)
      if (data.exitCode !== undefined && data.exitCode === 0) {
        lines.push(chalk.gray(`└─ Exit code: ${data.exitCode}`));
      }
      
      // Standard output
      if (data.stdout !== undefined && data.stdout.trim()) {
        lines.push(chalk.cyan('\n📤 Standard Output:'));
        lines.push(this.formatCommandOutput(data.stdout));
      }
      
      // Standard error
      if (data.stderr !== undefined && data.stderr.trim()) {
        lines.push(chalk.red('\n📤 Standard Error:'));
        lines.push(this.formatCommandOutput(data.stderr, chalk.red));
      }
      
      // If no output at all
      if (!data.stdout?.trim() && !data.stderr?.trim()) {
        lines.push(chalk.gray('\n(No output)'));
      }
    }
    
    return lines.join('\n');
  }
  
  private formatCommandOutput(output: string, colorFn: typeof chalk = chalk.white): string {
    if (!output || !output.trim()) {
      return chalk.gray('(empty)');
    }
    
    const lines = output.split('\n');
    const shouldTruncate = lines.length > this.maxLines;
    const linesToShow = shouldTruncate ? this.maxLines - 1 : lines.length;
    
    const formattedLines = [];
    
    for (let i = 0; i < linesToShow; i++) {
      const line = lines[i];
      // Truncate long lines
      if (line.length > this.maxLineLength) {
        formattedLines.push(colorFn(line.substring(0, this.maxLineLength - 3) + '...'));
      } else {
        formattedLines.push(colorFn(line));
      }
    }
    
    if (shouldTruncate) {
      formattedLines.push(chalk.gray(`... (${lines.length - linesToShow} more lines)`));
    }
    
    // Add indentation to output
    return formattedLines.map(line => '  ' + line).join('\n');
  }
}