import chalk from 'chalk';
import { BaseToolResultFormatter } from './base';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Formatter for ReadTool results
 */
export class ReadToolFormatter extends BaseToolResultFormatter {
  formatToolCall(toolCall: ToolCallParams): string {
    const params = toolCall.parameters as any;
    const filePath = params.file_path || params.path || 'unknown';
    const startLine = params.start_line || params.offset;
    const endLine = params.end_line || (startLine && params.limit ? startLine + params.limit : undefined);
    
    const items = [
      { label: 'File', value: filePath }
    ];
    
    if (startLine !== undefined || endLine !== undefined) {
      items.push({ label: 'Range', value: `lines ${startLine || 1}-${endLine || 'end'}` });
    }
    
    return this.createTree('📖 ReadFile', items);
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    const error = this.extractErrorMessage(result);
    if (error) {
      return this.formatError('ReadFile', error);
    }
    
    const data = result.result as any;
    if (!data) {
      return chalk.gray('No content');
    }
    
    // Handle string content directly
    if (typeof data === 'string') {
      return this.formatFileContent(data, 'unknown');
    }
    
    // Handle object result
    if (typeof data === 'object') {
      if (data.success === false) {
        return this.formatError('ReadFile', data.message || 'Read failed');
      }
      
      const content = data.content || data.text || '';
      const filePath = data.file_path || data.path || 'unknown';
      const fileSize = data.size || data.length;
      
      return this.formatFileContent(content, filePath, fileSize);
    }
    
    return chalk.gray('Unexpected result format');
  }
  
  private formatFileContent(content: string, filePath: string, fileSize?: number): string {
    const lines = [];
    
    // Header
    lines.push(chalk.green('✅ File read successfully'));
    lines.push(chalk.gray(`├─ File: ${filePath}`));
    
    if (fileSize !== undefined) {
      lines.push(chalk.gray(`├─ Size: ${this.formatFileSize(fileSize)}`));
    }
    
    // Content lines
    const contentLines = content.split('\n');
    lines.push(chalk.gray(`└─ Lines: ${contentLines.length}`));
    
    // Check if content is empty
    if (!content.trim()) {
      lines.push(chalk.yellow('\n⚠️ File is empty'));
      return lines.join('\n');
    }
    
    // Display content with line numbers
    lines.push(chalk.cyan('\n📄 Content:'));
    
    // Determine if we need to truncate
    const shouldTruncate = contentLines.length > this.maxLines;
    const linesToShow = shouldTruncate ? this.maxLines - 1 : contentLines.length;
    
    // Add line numbers and syntax highlighting
    const fileExt = filePath.split('.').pop()?.toLowerCase() || '';
    const isCode = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs'].includes(fileExt);
    
    for (let i = 0; i < linesToShow; i++) {
      const lineNum = String(i + 1).padStart(4);
      const lineContent = contentLines[i];
      
      // Apply basic syntax highlighting for code files
      if (isCode) {
        const highlighted = this.highlightCode(lineContent, fileExt);
        lines.push(chalk.gray(`${lineNum}: `) + highlighted);
      } else {
        // Truncate long lines for non-code files
        const truncatedLine = lineContent.length > this.maxLineLength 
          ? lineContent.substring(0, this.maxLineLength - 3) + '...'
          : lineContent;
        lines.push(chalk.gray(`${lineNum}: `) + truncatedLine);
      }
    }
    
    if (shouldTruncate) {
      lines.push(chalk.gray(`\n... (${contentLines.length - linesToShow} more lines)`));
      lines.push(chalk.yellow(`💡 File truncated. Showing first ${linesToShow} lines of ${contentLines.length} total.`));
    }
    
    return lines.join('\n');
  }
}