import { ToolExecutionResult } from '@continue-reasoning/core';
import chalk from 'chalk';
import { BashFormatter } from './BashFormatter.js';
import { FileFormatter } from './FileFormatter.js';
import { CodeFormatter } from './CodeFormatter.js';
import { DefaultFormatter } from './DefaultFormatter.js';
import { ExtendedToolExecutionResult } from './types.js';

/**
 * 工具格式化器接口
 */
export interface IToolFormatter {
  name: string;
  supportedTools: string[];
  format(result: ExtendedToolExecutionResult): string;
  formatError(error: Error): string;
}

/**
 * 工具格式化器注册表
 */
export class ToolFormatterRegistry {
  private formatters: Map<string, IToolFormatter> = new Map();
  private defaultFormatter: IToolFormatter;

  constructor() {
    this.defaultFormatter = new DefaultFormatter();
    this.registerBuiltinFormatters();
  }

  /**
   * 注册内置格式化器
   */
  private registerBuiltinFormatters(): void {
    const builtinFormatters = [
      new BashFormatter(),
      new FileFormatter(),
      new CodeFormatter()
    ];

    builtinFormatters.forEach(formatter => {
      this.register(formatter);
    });
  }

  /**
   * 注册格式化器
   */
  register(formatter: IToolFormatter): void {
    formatter.supportedTools.forEach(toolName => {
      this.formatters.set(toolName.toLowerCase(), formatter);
    });
  }

  /**
   * 获取格式化器
   */
  getFormatter(toolName: string): IToolFormatter {
    return this.formatters.get(toolName.toLowerCase()) || this.defaultFormatter;
  }

  /**
   * 格式化工具结果
   */
  format(toolName: string, result: ExtendedToolExecutionResult): string {
    try {
      const formatter = this.getFormatter(toolName);
      return formatter.format(result);
    } catch (error) {
      return this.formatError(toolName, error as Error);
    }
  }

  /**
   * 格式化错误
   */
  formatError(toolName: string, error: Error): string {
    const formatter = this.getFormatter(toolName);
    return formatter.formatError(error);
  }

  /**
   * 获取支持的工具列表
   */
  getSupportedTools(): string[] {
    const tools = new Set<string>();
    this.formatters.forEach((formatter, toolName) => {
      tools.add(toolName);
    });
    return Array.from(tools).sort();
  }

  /**
   * 获取格式化器信息
   */
  getFormatterInfo(): Array<{ name: string; tools: string[] }> {
    const formattersInfo: Array<{ name: string; tools: string[] }> = [];
    const seen = new Set<string>();

    this.formatters.forEach(formatter => {
      if (!seen.has(formatter.name)) {
        formattersInfo.push({
          name: formatter.name,
          tools: formatter.supportedTools
        });
        seen.add(formatter.name);
      }
    });

    return formattersInfo;
  }
}