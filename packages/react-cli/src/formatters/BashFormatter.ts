import { ToolExecutionResult } from '@continue-reasoning/core';
import chalk from 'chalk';
import { IToolFormatter } from './ToolFormatterRegistry.js';
import { ExtendedToolExecutionResult } from './types.js';

/**
 * Bash 工具格式化器
 */
export class BashFormatter implements IToolFormatter {
  name = 'BashFormatter';
  supportedTools = ['bash', 'shell', 'command', 'exec'];

  format(result: ExtendedToolExecutionResult): string {
    const lines = [];
    
    // 命令头部
    lines.push(chalk.blue('┌─ ') + chalk.bold('Bash Command'));
    if (result.metadata?.command) {
      lines.push(chalk.blue('│ ') + chalk.cyan(`$ ${result.metadata.command}`));
    }
    lines.push(chalk.blue('├─ ') + chalk.bold('Output'));

    // 输出内容
    if (result.stdout) {
      const stdout = result.stdout.toString().trim();
      if (stdout) {
        stdout.split('\n').forEach(line => {
          lines.push(chalk.blue('│ ') + line);
        });
      }
    }

    // 错误输出
    if (result.stderr) {
      const stderr = result.stderr.toString().trim();
      if (stderr) {
        lines.push(chalk.blue('├─ ') + chalk.red.bold('Error Output'));
        stderr.split('\n').forEach(line => {
          lines.push(chalk.blue('│ ') + chalk.red(line));
        });
      }
    }

    // 退出码
    if (result.metadata?.exitCode !== undefined) {
      const exitCode = result.metadata.exitCode;
      const exitColor = exitCode === 0 ? chalk.green : chalk.red;
      lines.push(chalk.blue('├─ ') + chalk.bold('Exit Code: ') + exitColor(exitCode));
    }

    // 执行时间
    if (result.metadata?.duration) {
      lines.push(chalk.blue('├─ ') + chalk.bold('Duration: ') + chalk.yellow(`${result.metadata.duration}ms`));
    }

    lines.push(chalk.blue('└─'));

    return lines.join('\n');
  }

  formatError(error: Error): string {
    return [
      chalk.red('┌─ ') + chalk.red.bold('Bash Command Error'),
      chalk.red('│ ') + chalk.red(error.message),
      chalk.red('└─')
    ].join('\n');
  }
}