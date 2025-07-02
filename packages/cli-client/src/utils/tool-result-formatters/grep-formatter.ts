import chalk from 'chalk';
import { BaseToolResultFormatter } from './base';
import { ToolCallParams, ToolExecutionResult } from '../../core-types';

/**
 * Formatter for GrepTool results
 */
export class GrepToolFormatter extends BaseToolResultFormatter {
  formatToolCall(toolCall: ToolCallParams): string {
    const params = toolCall.parameters as any;
    const pattern = params.pattern || '';
    const path = params.path || '.';
    const includePatterns = params.include_patterns?.join(', ') || 'all files';
    
    return this.createTree('🔍 Grep: Searching for pattern', [
      { label: 'Pattern', value: chalk.yellow(`"${pattern}"`) },
      { label: 'Path', value: path },
      { label: 'Include', value: includePatterns }
    ]);
  }
  
  formatToolResult(result: ToolExecutionResult): string {
    const error = this.extractErrorMessage(result);
    if (error) {
      return this.formatError('Grep', error);
    }
    
    const data = result.result as any;
    if (!data || typeof data !== 'object') {
      return chalk.gray('No matches found');
    }
    
    const lines = [];
    
    // Handle success/error status
    if (data.success === false) {
      return this.formatError('Grep', data.message || 'Search failed');
    }
    
    // Extract match information
    const matches = data.matches || [];
    const fileCount = data.file_count || 0;
    const matchCount = data.match_count || matches.length;
    
    // Summary
    lines.push(chalk.green(`✅ Grep completed`));
    lines.push(chalk.gray(`├─ Files searched: ${fileCount}`));
    lines.push(chalk.gray(`└─ Matches found: ${matchCount}`));
    
    if (matchCount === 0) {
      lines.push(chalk.yellow('\nNo matches found'));
      return lines.join('\n');
    }
    
    // Display matches
    lines.push('');
    let displayedMatches = 0;
    const maxMatchesToShow = 10;
    
    for (const match of matches) {
      if (displayedMatches >= maxMatchesToShow) {
        lines.push(chalk.gray(`\n... (${matches.length - maxMatchesToShow} more matches)`));
        break;
      }
      
      const filePath = match.file || match.path || 'unknown';
      const lineNumber = match.line_number || match.line || '?';
      const content = match.content || match.match || '';
      const context = match.context || [];
      
      lines.push(chalk.cyan(`\n📄 ${filePath}`));
      
      // Show context lines if available
      if (context.length > 0) {
        for (const ctxLine of context) {
          const ctxLineNum = ctxLine.line_number || ctxLine.line || '?';
          const ctxContent = ctxLine.content || '';
          const isMatch = ctxLine.is_match || ctxLineNum === lineNumber;
          
          if (isMatch) {
            lines.push(chalk.green(`  ${String(ctxLineNum).padStart(4)}: `) + chalk.yellow(ctxContent));
          } else {
            lines.push(chalk.gray(`  ${String(ctxLineNum).padStart(4)}: ${ctxContent}`));
          }
        }
      } else {
        // Simple match display
        lines.push(chalk.green(`  ${String(lineNumber).padStart(4)}: `) + chalk.yellow(content));
      }
      
      displayedMatches++;
    }
    
    // Add suggested read ranges if available
    if (data.suggested_read_ranges && data.suggested_read_ranges.length > 0) {
      lines.push(chalk.cyan('\n📖 Suggested read ranges:'));
      for (const range of data.suggested_read_ranges.slice(0, 5)) {
        const file = range.file || 'unknown';
        const start = range.start_line || 1;
        const end = range.end_line || start + 10;
        lines.push(chalk.gray(`   ReadFile("${file}", ${start}, ${end})`));
      }
    }
    
    return lines.join('\n');
  }
}