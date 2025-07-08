import { ToolExecutionResult } from '@continue-reasoning/core';
import chalk from 'chalk';
import hljs from 'highlight.js';
import { IToolFormatter } from './ToolFormatterRegistry.js';
import { ExtendedToolExecutionResult } from './types.js';

/**
 * 代码相关工具格式化器
 */
export class CodeFormatter implements IToolFormatter {
  name = 'CodeFormatter';
  supportedTools = ['analyze', 'format', 'lint', 'compile', 'test', 'debug'];

  format(result: ExtendedToolExecutionResult): string {
    const lines = [];
    const toolName = result.name || 'Code Tool';
    
    // 工具头部
    lines.push(chalk.magenta('┌─ ') + chalk.bold(`${toolName.toUpperCase()}`));
    
    // 文件信息
    if (result.metadata?.file) {
      lines.push(chalk.magenta('│ ') + chalk.bold('File: ') + chalk.cyan(result.metadata.file));
    }

    // 语言信息
    if (result.metadata?.language) {
      lines.push(chalk.magenta('│ ') + chalk.bold('Language: ') + chalk.yellow(result.metadata.language));
    }

    // 根据工具类型格式化
    switch (result.name?.toLowerCase()) {
      case 'analyze':
        this.formatAnalysisResult(lines, result);
        break;
      case 'lint':
        this.formatLintResult(lines, result);
        break;
      case 'test':
        this.formatTestResult(lines, result);
        break;
      case 'compile':
        this.formatCompileResult(lines, result);
        break;
      default:
        this.formatGenericCodeResult(lines, result);
    }

    lines.push(chalk.magenta('└─'));
    return lines.join('\n');
  }

  private formatAnalysisResult(lines: string[], result: ExtendedToolExecutionResult): void {
    lines.push(chalk.magenta('├─ ') + chalk.bold('Analysis'));
    
    if (result.metadata?.complexity) {
      lines.push(chalk.magenta('│ ') + chalk.bold('Complexity: ') + this.getComplexityColor(result.metadata.complexity));
    }
    
    if (result.metadata?.issues && Array.isArray(result.metadata.issues)) {
      lines.push(chalk.magenta('├─ ') + chalk.bold('Issues'));
      result.metadata.issues.slice(0, 5).forEach(issue => {
        const severity = this.getSeverityIcon(issue.severity);
        lines.push(chalk.magenta('│ ') + `${severity} ${issue.message}`);
        if (issue.line) {
          lines.push(chalk.magenta('│ ') + chalk.dim(`   Line ${issue.line}`));
        }
      });
    }
    
    if (result.metadata?.suggestions && Array.isArray(result.metadata.suggestions)) {
      lines.push(chalk.magenta('├─ ') + chalk.bold('Suggestions'));
      result.metadata.suggestions.slice(0, 3).forEach(suggestion => {
        lines.push(chalk.magenta('│ ') + chalk.green(`💡 ${suggestion}`));
      });
    }
  }

  private formatLintResult(lines: string[], result: ExtendedToolExecutionResult): void {
    const errorCount = result.metadata?.errorCount || 0;
    const warningCount = result.metadata?.warningCount || 0;
    
    lines.push(chalk.magenta('├─ ') + chalk.bold('Lint Results'));
    lines.push(chalk.magenta('│ ') + `${chalk.red('Errors: ' + errorCount)} ${chalk.yellow('Warnings: ' + warningCount)}`);
    
    if (result.metadata?.issues && Array.isArray(result.metadata.issues)) {
      result.metadata.issues.slice(0, 10).forEach(issue => {
        const icon = issue.type === 'error' ? '❌' : '⚠️ ';
        const location = issue.line ? `:${issue.line}:${issue.column || 1}` : '';
        lines.push(chalk.magenta('│ ') + `${icon} ${issue.message}`);
        lines.push(chalk.magenta('│ ') + chalk.dim(`   ${issue.file}${location}`));
      });
    }
  }

  private formatTestResult(lines: string[], result: ExtendedToolExecutionResult): void {
    const passed = result.metadata?.passed || 0;
    const failed = result.metadata?.failed || 0;
    const total = passed + failed;
    
    lines.push(chalk.magenta('├─ ') + chalk.bold('Test Results'));
    lines.push(chalk.magenta('│ ') + `${chalk.green('Passed: ' + passed)} ${chalk.red('Failed: ' + failed)} ${chalk.blue('Total: ' + total)}`);
    
    if (result.metadata?.duration) {
      lines.push(chalk.magenta('│ ') + chalk.bold('Duration: ') + chalk.yellow(`${result.metadata.duration}ms`));
    }
    
    if (result.metadata?.failedTests && Array.isArray(result.metadata.failedTests)) {
      lines.push(chalk.magenta('├─ ') + chalk.bold('Failed Tests'));
      result.metadata.failedTests.slice(0, 5).forEach(test => {
        lines.push(chalk.magenta('│ ') + chalk.red(`❌ ${test.name}`));
        if (test.error) {
          lines.push(chalk.magenta('│ ') + chalk.dim(`   ${test.error}`));
        }
      });
    }
  }

  private formatCompileResult(lines: string[], result: ExtendedToolExecutionResult): void {
    const success = result.metadata?.success || false;
    
    lines.push(chalk.magenta('├─ ') + chalk.bold('Compilation'));
    lines.push(chalk.magenta('│ ') + (success ? chalk.green('✓ Success') : chalk.red('✗ Failed')));
    
    if (result.metadata?.errors && Array.isArray(result.metadata.errors)) {
      lines.push(chalk.magenta('├─ ') + chalk.bold('Errors'));
      result.metadata.errors.slice(0, 5).forEach(error => {
        lines.push(chalk.magenta('│ ') + chalk.red(`❌ ${error.message}`));
        if (error.file && error.line) {
          lines.push(chalk.magenta('│ ') + chalk.dim(`   ${error.file}:${error.line}`));
        }
      });
    }
    
    if (result.metadata?.outputFile) {
      lines.push(chalk.magenta('├─ ') + chalk.bold('Output: ') + chalk.cyan(result.metadata.outputFile));
    }
  }

  private formatGenericCodeResult(lines: string[], result: ExtendedToolExecutionResult): void {
    if (result.content) {
      lines.push(chalk.magenta('├─ ') + chalk.bold('Output'));
      
      // 尝试语法高亮
      let content = result.content.toString();
      if (result.metadata?.language) {
        try {
          const highlighted = hljs.highlight(content, { language: result.metadata.language });
          content = highlighted.value;
        } catch {
          // 如果高亮失败，使用原始内容
        }
      }
      
      content.split('\n').slice(0, 20).forEach(line => {
        lines.push(chalk.magenta('│ ') + line);
      });
    }
  }

  private getComplexityColor(complexity: number): string {
    if (complexity <= 5) return chalk.green(complexity.toString());
    if (complexity <= 10) return chalk.yellow(complexity.toString());
    return chalk.red(complexity.toString());
  }

  private getSeverityIcon(severity: string): string {
    switch (severity?.toLowerCase()) {
      case 'error': return '❌';
      case 'warning': return '⚠️ ';
      case 'info': return 'ℹ️ ';
      default: return '•';
    }
  }

  formatError(error: Error): string {
    return [
      chalk.red('┌─ ') + chalk.red.bold('Code Tool Error'),
      chalk.red('│ ') + chalk.red(error.message),
      chalk.red('└─')
    ].join('\n');
  }
}