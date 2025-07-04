import { IToolResultFormatter } from './base';
import { GrepToolFormatter } from './grep-formatter';
import { SnapshotEditingFormatter } from './snapshot-formatter';
import { ReadToolFormatter } from './read-formatter';
import { BashToolFormatter } from './bash-formatter';
import { TodosManagerFormatter } from './todos-formatter';
import { DefaultToolFormatter } from './default-formatter';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

// Export all formatters
export * from './base';
export * from './grep-formatter';
export * from './snapshot-formatter';
export * from './read-formatter';
export * from './bash-formatter';
export * from './todos-formatter';
export * from './default-formatter';

/**
 * Registry for tool result formatters
 */
export class ToolFormatterRegistry {
  private formatters: Map<string, IToolResultFormatter> = new Map();
  private defaultFormatter: IToolResultFormatter;
  
  constructor(maxLines: number = 100) {
    // Initialize default formatter
    this.defaultFormatter = new DefaultToolFormatter(maxLines);
    
    // Register specific formatters
    this.registerFormatter('Grep', new GrepToolFormatter(maxLines));
    this.registerFormatter('GrepTool', new GrepToolFormatter(maxLines));
    
    // Snapshot editing tools
    const snapshotFormatter = new SnapshotEditingFormatter(maxLines);
    this.registerFormatter('ApplyWholeFileEditTool', snapshotFormatter);
    this.registerFormatter('ApplyEditBlockTool', snapshotFormatter);
    this.registerFormatter('ApplyRangedEditTool', snapshotFormatter);
    this.registerFormatter('ApplyUnifiedDiffTool', snapshotFormatter);
    this.registerFormatter('DeleteTool', snapshotFormatter);
    
    // Read tool
    this.registerFormatter('ReadFile', new ReadToolFormatter(maxLines));
    this.registerFormatter('ReadFileTool', new ReadToolFormatter(maxLines));
    
    // Bash tools
    const bashFormatter = new BashToolFormatter(maxLines);
    this.registerFormatter('Bash', bashFormatter);
    this.registerFormatter('BashCommand', bashFormatter);
    this.registerFormatter('BashTool', bashFormatter);
    
    // Todos manager
    this.registerFormatter('TodosManager', new TodosManagerFormatter(maxLines));
    this.registerFormatter('TodoUpdate', new TodosManagerFormatter(maxLines));
  }
  
  /**
   * Register a formatter for a specific tool
   */
  registerFormatter(toolName: string, formatter: IToolResultFormatter): void {
    this.formatters.set(toolName, formatter);
  }
  
  /**
   * Get formatter for a tool
   */
  getFormatter(toolName: string): IToolResultFormatter {
    return this.formatters.get(toolName) || this.defaultFormatter;
  }
  
  /**
   * Format tool call
   */
  formatToolCall(toolCall: ToolCallParams): string {
    const formatter = this.getFormatter(toolCall.name);
    return formatter.formatToolCall(toolCall);
  }
  
  /**
   * Format tool result
   */
  formatToolResult(result: ToolExecutionResult): string {
    const formatter = this.getFormatter(result.name);
    return formatter.formatToolResult(result);
  }
}

/**
 * Create a singleton instance of the formatter registry
 */
export const defaultFormatterRegistry = new ToolFormatterRegistry();