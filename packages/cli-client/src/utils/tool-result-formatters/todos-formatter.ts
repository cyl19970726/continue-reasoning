import chalk from 'chalk';
import { BaseToolResultFormatter } from './base';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Formatter for TodosManagerTool results
 */
export class TodosManagerFormatter extends BaseToolResultFormatter {
  formatToolCall(toolCall: ToolCallParams): string {
    const params = toolCall.parameters as any;
    const action = params.action || 'unknown';
    const todos = params.todos || '';
    
    const items = [
      { label: 'Action', value: chalk.yellow(action) }
    ];
    
    if (action !== 'read' && todos) {
      const todoCount = (todos.match(/^- \[/gm) || []).length;
      const completedCount = (todos.match(/^- \[x\]/gmi) || []).length;
      items.push({ label: 'Tasks', value: `${todoCount} total (${completedCount} completed)` });
    }
    
    return this.createTree('📋 TodosManager', items);
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    const error = this.extractErrorMessage(result);
    if (error) {
      return this.formatError('TodosManager', error);
    }
    
    const data = result.result as any;
    if (!data || typeof data !== 'object') {
      return chalk.gray('No result data');
    }
    
    const lines = [];
    
    // Handle error status
    if (data.success === false) {
      return this.formatError('TodosManager', data.message || 'Operation failed');
    }
    
    // Success message with action details
    lines.push(chalk.green(`✅ ${data.message || 'TodosManager completed'}`));
    
    // Display todos content if available
    if (data.todos) {
      lines.push(chalk.cyan('\n📋 Current Todos:'));
      lines.push(this.formatTodos(data.todos));
      
      // Show statistics
      const stats = this.getTodoStats(data.todos);
      lines.push('');
      lines.push(chalk.gray('📊 Statistics:'));
      lines.push(chalk.gray(`   Total tasks: ${stats.total}`));
      lines.push(chalk.green(`   ✓ Completed: ${stats.completed}`));
      lines.push(chalk.yellow(`   ○ Pending: ${stats.pending}`));
      
      if (stats.total > 0) {
        const percentage = Math.round((stats.completed / stats.total) * 100);
        lines.push(chalk.gray(`   Progress: ${this.createProgressBar(percentage)} ${percentage}%`));
      }
    } else if (data.action === 'read' && !data.todos) {
      lines.push(chalk.yellow('\n⚠️ No todos found'));
    }
    
    return lines.join('\n');
  }
  
  private formatTodos(todos: string): string {
    if (!todos || !todos.trim()) {
      return chalk.gray('  (No todos)');
    }
    
    const lines = todos.split('\n');
    const formattedLines = [];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      
      // Check if it's a todo item
      if (trimmedLine.match(/^- \[[ x]\]/i)) {
        const isCompleted = trimmedLine.match(/^- \[x\]/i);
        const taskText = trimmedLine.replace(/^- \[[ x]\]\s*/i, '');
        
        if (isCompleted) {
          formattedLines.push(chalk.green(`  ✓ ${chalk.strikethrough(taskText)}`));
        } else {
          formattedLines.push(chalk.yellow(`  ○ ${taskText}`));
        }
      } else {
        // Non-todo line (e.g., headers or notes)
        formattedLines.push(chalk.gray(`  ${trimmedLine}`));
      }
    }
    
    return formattedLines.join('\n');
  }
  
  private getTodoStats(todos: string): { total: number; completed: number; pending: number } {
    if (!todos) {
      return { total: 0, completed: 0, pending: 0 };
    }
    
    const total = (todos.match(/^- \[[ x]\]/gmi) || []).length;
    const completed = (todos.match(/^- \[x\]/gmi) || []).length;
    const pending = total - completed;
    
    return { total, completed, pending };
  }
  
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round(width * percentage / 100);
    const empty = width - filled;
    
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
}