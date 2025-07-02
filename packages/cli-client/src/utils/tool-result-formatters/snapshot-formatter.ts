import chalk from 'chalk';
import { BaseToolResultFormatter } from './base';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Formatter for SnapshotEditingToolSet tools
 */
export class SnapshotEditingFormatter extends BaseToolResultFormatter {
  private toolTypeMap: Record<string, string> = {
    'ApplyWholeFileEditTool': '📝 Create/Replace File',
    'ApplyEditBlockTool': '✏️ Edit Code Block',
    'ApplyRangedEditTool': '📏 Edit Lines',
    'ApplyUnifiedDiffTool': '🔧 Apply Diff',
    'DeleteTool': '🗑️ Delete File'
  };
  
  formatToolCall(toolCall: ToolCallParams): string {
    const params = toolCall.parameters as any;
    const toolType = this.toolTypeMap[toolCall.name] || `📝 ${toolCall.name}`;
    const filePath = params.file_path || params.path || 'unknown';
    const goal = params.goal || 'No goal specified';
    
    const items = [
      { label: 'File', value: filePath },
      { label: 'Goal', value: goal }
    ];
    
    // Add tool-specific parameters
    if (params.start_line !== undefined && params.end_line !== undefined) {
      items.push({ label: 'Lines', value: `${params.start_line}-${params.end_line}` });
    }
    
    if (params.old_code !== undefined) {
      const preview = params.old_code.split('\n')[0];
      items.push({ label: 'Replacing', value: preview.length > 50 ? preview.substring(0, 47) + '...' : preview });
    }
    
    return this.createTree(toolType, items);
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    const error = this.extractErrorMessage(result);
    if (error) {
      return this.formatError(result.name, error);
    }
    
    const data = result.result as any;
    if (!data || typeof data !== 'object') {
      return chalk.gray('No result data');
    }
    
    const lines = [];
    
    // Handle success/error status
    if (data.success === false) {
      return this.formatError(result.name, data.message || 'Operation failed');
    }
    
    // Success message
    lines.push(chalk.green(`✅ ${result.name.replace('Tool', '')} completed`));
    
    // File information
    if (data.file_path || data.path) {
      lines.push(chalk.gray(`├─ File: ${data.file_path || data.path}`));
    }
    
    // Snapshot information
    if (data.snapshot_id || data.snapshotId) {
      lines.push(chalk.gray(`├─ Snapshot: ${data.snapshot_id || data.snapshotId}`));
    }
    
    // Diff information
    if (data.diff_path || data.diffPath) {
      lines.push(chalk.gray(`├─ Diff: ${data.diff_path || data.diffPath}`));
    }
    
    // Line count information
    if (data.lines_changed !== undefined || data.linesChanged !== undefined) {
      lines.push(chalk.gray(`└─ Lines changed: ${data.lines_changed || data.linesChanged}`));
    } else if (data.line_count !== undefined || data.lineCount !== undefined) {
      lines.push(chalk.gray(`└─ Total lines: ${data.line_count || data.lineCount}`));
    }
    
    // Show diff preview if available
    if (data.diff) {
      lines.push(chalk.cyan('\n📊 Diff preview:'));
      const diffLines = data.diff.split('\n');
      const maxDiffLines = 20;
      
      for (let i = 0; i < Math.min(diffLines.length, maxDiffLines); i++) {
        const line = diffLines[i];
        if (line.startsWith('+') && !line.startsWith('+++')) {
          lines.push(chalk.green(line));
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          lines.push(chalk.red(line));
        } else if (line.startsWith('@@')) {
          lines.push(chalk.cyan(line));
        } else {
          lines.push(chalk.gray(line));
        }
      }
      
      if (diffLines.length > maxDiffLines) {
        lines.push(chalk.gray(`... (${diffLines.length - maxDiffLines} more lines)`));
      }
    }
    
    // Show content preview for new files
    if (data.content && result.name === 'ApplyWholeFileEditTool') {
      lines.push(chalk.cyan('\n📄 Content preview:'));
      const contentLines = data.content.split('\n');
      const maxContentLines = 10;
      
      for (let i = 0; i < Math.min(contentLines.length, maxContentLines); i++) {
        lines.push(chalk.gray(`  ${String(i + 1).padStart(4)}: `) + contentLines[i]);
      }
      
      if (contentLines.length > maxContentLines) {
        lines.push(chalk.gray(`... (${contentLines.length - maxContentLines} more lines)`));
      }
    }
    
    return lines.join('\n');
  }
}