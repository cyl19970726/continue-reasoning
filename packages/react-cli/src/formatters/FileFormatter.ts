import { ToolExecutionResult } from '@continue-reasoning/core';
import chalk from 'chalk';
import { IToolFormatter } from './ToolFormatterRegistry.js';
import { ExtendedToolExecutionResult } from './types.js';

/**
 * 文件操作工具格式化器
 */
export class FileFormatter implements IToolFormatter {
  name = 'FileFormatter';
  supportedTools = ['read', 'write', 'edit', 'create', 'delete', 'ls', 'glob', 'grep'];

  format(result: ExtendedToolExecutionResult): string {
    const lines = [];
    const toolName = result.name || 'File Operation';
    
    // 工具头部
    lines.push(chalk.green('┌─ ') + chalk.bold(`${toolName.toUpperCase()}`));
    
    // 文件路径信息
    if (result.metadata?.filePath || result.metadata?.path) {
      const path = result.metadata.filePath || result.metadata.path;
      lines.push(chalk.green('│ ') + chalk.bold('Path: ') + chalk.cyan(path));
    }

    // 根据不同工具类型格式化
    switch (result.name?.toLowerCase()) {
      case 'read':
        this.formatReadResult(lines, result);
        break;
      case 'write':
      case 'edit':
        this.formatWriteResult(lines, result);
        break;
      case 'ls':
        this.formatListResult(lines, result);
        break;
      case 'grep':
        this.formatGrepResult(lines, result);
        break;
      case 'glob':
        this.formatGlobResult(lines, result);
        break;
      default:
        this.formatGenericResult(lines, result);
    }

    // 文件统计信息
    if (result.metadata?.size) {
      lines.push(chalk.green('├─ ') + chalk.bold('Size: ') + chalk.yellow(this.formatSize(result.metadata.size)));
    }

    if (result.metadata?.lineCount) {
      lines.push(chalk.green('├─ ') + chalk.bold('Lines: ') + chalk.yellow(result.metadata.lineCount));
    }

    lines.push(chalk.green('└─'));
    return lines.join('\n');
  }

  private formatReadResult(lines: string[], result: ExtendedToolExecutionResult): void {
    lines.push(chalk.green('├─ ') + chalk.bold('Content'));
    
    if (result.content) {
      const content = result.content.toString();
      const previewLines = content.split('\n').slice(0, 10);
      
      previewLines.forEach((line, index) => {
        const lineNumber = chalk.dim(`${(index + 1).toString().padStart(3)}: `);
        lines.push(chalk.green('│ ') + lineNumber + line);
      });
      
      if (content.split('\n').length > 10) {
        lines.push(chalk.green('│ ') + chalk.dim('... (truncated)'));
      }
    }
  }

  private formatWriteResult(lines: string[], result: ExtendedToolExecutionResult): void {
    if (result.success) {
      lines.push(chalk.green('├─ ') + chalk.green.bold('✓ Successfully written'));
    } else {
      lines.push(chalk.green('├─ ') + chalk.red.bold('✗ Write failed'));
    }
    
    if (result.metadata?.bytesWritten) {
      lines.push(chalk.green('├─ ') + chalk.bold('Bytes written: ') + chalk.yellow(result.metadata.bytesWritten));
    }
  }

  private formatListResult(lines: string[], result: ExtendedToolExecutionResult): void {
    lines.push(chalk.green('├─ ') + chalk.bold('Items'));
    
    if (result.items && Array.isArray(result.items)) {
      result.items.slice(0, 20).forEach(item => {
        const icon = item.type === 'directory' ? '📁' : '📄';
        lines.push(chalk.green('│ ') + `${icon} ${item.name}`);
      });
      
      if (result.items.length > 20) {
        lines.push(chalk.green('│ ') + chalk.dim(`... and ${result.items.length - 20} more items`));
      }
    }
  }

  private formatGrepResult(lines: string[], result: ExtendedToolExecutionResult): void {
    lines.push(chalk.green('├─ ') + chalk.bold('Matches'));
    
    if (result.matches && Array.isArray(result.matches)) {
      result.matches.slice(0, 15).forEach(match => {
        const lineInfo = match.lineNumber ? chalk.cyan(`:${match.lineNumber}:`) : ':';
        lines.push(chalk.green('│ ') + chalk.yellow(match.file) + lineInfo + ` ${match.line}`);
      });
      
      if (result.matches.length > 15) {
        lines.push(chalk.green('│ ') + chalk.dim(`... and ${result.matches.length - 15} more matches`));
      }
    }
  }

  private formatGlobResult(lines: string[], result: ExtendedToolExecutionResult): void {
    lines.push(chalk.green('├─ ') + chalk.bold('Matched Files'));
    
    if (result.files && Array.isArray(result.files)) {
      result.files.slice(0, 20).forEach(file => {
        lines.push(chalk.green('│ ') + chalk.cyan(file));
      });
      
      if (result.files.length > 20) {
        lines.push(chalk.green('│ ') + chalk.dim(`... and ${result.files.length - 20} more files`));
      }
    }
  }

  private formatGenericResult(lines: string[], result: ExtendedToolExecutionResult): void {
    if (result.content) {
      lines.push(chalk.green('├─ ') + chalk.bold('Result'));
      const content = result.content.toString().slice(0, 500);
      content.split('\n').forEach(line => {
        lines.push(chalk.green('│ ') + line);
      });
    }
  }

  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  formatError(error: Error): string {
    return [
      chalk.red('┌─ ') + chalk.red.bold('File Operation Error'),
      chalk.red('│ ') + chalk.red(error.message),
      chalk.red('└─')
    ].join('\n');
  }
}