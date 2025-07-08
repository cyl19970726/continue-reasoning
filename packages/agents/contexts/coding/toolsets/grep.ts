import { z } from 'zod';
import { createTool, IAgent, logger } from '@continue-reasoning/core';
import { ExecutionOptions } from '../sandbox/index.js';
import { IRuntime } from '../runtime/interface.js';

// 匹配结果的结构
const GrepMatchSchema = z.object({
  file_path: z.string().describe("The file path where the match was found"),
  line_number: z.number().describe("The line number of the match"),
  line_content: z.string().describe("The content of the matching line"),
  context_before: z.array(z.object({
    line_number: z.number(),
    content: z.string()
  })).describe("Lines before the match for context"),
  context_after: z.array(z.object({
    line_number: z.number(),
    content: z.string()
  })).describe("Lines after the match for context"),
  column_start: z.number().optional().describe("Starting column of the match"),
  column_end: z.number().optional().describe("Ending column of the match")
});

const GrepParamsSchema = z.object({
  pattern: z.string().describe("The search pattern (supports regex)"),
  paths: z.array(z.string()).optional().describe("Paths to search in (files or directories). Defaults to current workspace"),
  context_lines: z.number().optional().describe("Number of context lines before and after each match (0-20, default: 3)"),
  recursive: z.boolean().optional().describe("Whether to search recursively in directories (default: true)"),
  case_sensitive: z.boolean().optional().describe("Whether the search should be case sensitive (default: false)"),
  include_patterns: z.array(z.string()).optional().describe("File patterns to include (e.g., ['*.ts', '*.js'])"),
  exclude_patterns: z.array(z.string()).optional().describe("File patterns to exclude (e.g., ['node_modules/**', '*.log'])"),
  max_results: z.number().optional().describe("Maximum number of matches to return (1-100, default: 50)"),
  whole_word: z.boolean().optional().describe("Match whole words only (default: false)"),
  line_numbers: z.boolean().optional().describe("Include line numbers in output (default: true)")
});

const GrepReturnsSchema = z.object({
  matches: z.array(GrepMatchSchema).describe("Array of search matches with context"),
  total_matches: z.number().describe("Total number of matches found"),
  files_searched: z.number().describe("Number of files searched"),
  search_pattern: z.string().describe("The pattern that was searched"),
  success: z.boolean().describe("Whether the search was successful"),
  message: z.string().optional().describe("Additional information about the search results"),
  suggested_read_ranges: z.array(z.object({
    file_path: z.string(),
    start_line: z.number(),
    end_line: z.number(),
    context: z.string().describe("Description of what this range contains")
  })).optional().describe("Suggested ranges for ReadFile operations")
});

export const GrepTool = createTool({
  id: 'Grep',
  name: 'Grep',
  description: 'Search for patterns in files and return matches with context lines. Perfect for code exploration and finding specific implementations.',
  inputSchema: GrepParamsSchema,
  outputSchema: GrepReturnsSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    
    // Set defaults and validate ranges (ensure integers)
    const contextLines = Math.max(0, Math.min(20, Math.floor(params.context_lines ?? 3)));
    const recursive = params.recursive ?? true;
    const caseSensitive = params.case_sensitive ?? false;
    const maxResults = Math.max(1, Math.min(100, Math.floor(params.max_results ?? 50)));
    const wholeWord = params.whole_word ?? false;
    const lineNumbers = params.line_numbers ?? true;
    const searchPaths = params.paths ?? ['.'];
    
    // Validate parameters
    if (contextLines !== (params.context_lines ?? 3) && params.context_lines !== undefined) {
      logger.warn(`GrepTool: context_lines adjusted from ${params.context_lines} to ${contextLines} (valid range: 0-20)`);
    }
    if (maxResults !== (params.max_results ?? 50) && params.max_results !== undefined) {
      logger.warn(`GrepTool: max_results adjusted from ${params.max_results} to ${maxResults} (valid range: 1-100)`);
    }
    
    // Build grep command
    let grepCmd = 'grep';
    
    // Add flags
    const flags: string[] = [];
    if (!caseSensitive) flags.push('-i'); // case insensitive
    if (recursive) flags.push('-r'); // recursive
    if (lineNumbers) flags.push('-n'); // line numbers
    if (wholeWord) flags.push('-w'); // whole word
    flags.push(`-C${contextLines}`); // context lines
    flags.push('--color=never'); // disable color output for parsing
    
    // Handle include/exclude patterns
    if (params.include_patterns && params.include_patterns.length > 0) {
      for (const pattern of params.include_patterns) {
        flags.push(`--include='${pattern}'`);
      }
    }
    
    if (params.exclude_patterns && params.exclude_patterns.length > 0) {
      for (const pattern of params.exclude_patterns) {
        flags.push(`--exclude='${pattern}'`);
      }
    }
    
    // Add common excludes for development
    const defaultExcludes = ['node_modules/**', '.git/**', '*.log', '*.tmp', '.DS_Store'];
    for (const exclude of defaultExcludes) {
      if (!params.exclude_patterns || !params.exclude_patterns.includes(exclude)) {
        flags.push(`--exclude='${exclude}'`);
      }
    }
    
    // Escape pattern for shell
    const escapedPattern = params.pattern.replace(/'/g, "'\"'\"'");
    
    // Build final command
    const command = `${grepCmd} ${flags.join(' ')} '${escapedPattern}' ${searchPaths.join(' ')} | head -${maxResults * 10}`;
    
    logger.debug(`GrepTool: Executing command: ${command}`);
    
    const executionOptions: ExecutionOptions = {
      cwd: workspacePath,
      timeout: 30000, // 30 seconds timeout
      allowNetwork: false,
    };
    
    try {
      const result = await runtime.execute(command, executionOptions);
      
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        // Exit code 1 means no matches found, which is not an error
        // Other non-zero codes indicate actual errors
        return {
          matches: [],
          total_matches: 0,
          files_searched: 0,
          search_pattern: params.pattern,
          success: false,
          message: `Grep command failed: ${result.stderr || 'Unknown error'}`
        };
      }
      
      // Parse grep output
      const matches = parseGrepOutput(result.stdout, contextLines);
      
      // Generate suggested read ranges
      const suggestedRanges = generateReadRanges(matches);
      
      const filesSearched = new Set(matches.map(m => m.file_path)).size;
      
      return {
        matches: matches.slice(0, maxResults), // Limit to maxResults
        total_matches: matches.length,
        files_searched: filesSearched,
        search_pattern: params.pattern,
        success: true,
        message: matches.length > 0 
          ? `Found ${matches.length} matches in ${filesSearched} files`
          : 'No matches found',
        suggested_read_ranges: suggestedRanges.slice(0, 10) // Limit suggestions
      };
      
    } catch (error) {
      logger.error('GrepTool execution error:', error);
      return {
        matches: [],
        total_matches: 0,
        files_searched: 0,
        search_pattern: params.pattern,
        success: false,
        message: `Search failed: ${error}`
      };
    }
  },
});

/**
 * Parse grep output with context lines
 */
function parseGrepOutput(output: string, contextLines: number): Array<z.infer<typeof GrepMatchSchema>> {
  if (!output.trim()) {
    return [];
  }
  
  const lines = output.split('\n');
  const matches: Array<z.infer<typeof GrepMatchSchema>> = [];
  let currentMatch: Partial<z.infer<typeof GrepMatchSchema>> | null = null;
  let contextBefore: Array<{line_number: number, content: string}> = [];
  let contextAfter: Array<{line_number: number, content: string}> = [];
  let collectingAfter = false;
  let afterCount = 0;
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Separator between match groups
    if (line === '--') {
      if (currentMatch && currentMatch.file_path) {
        currentMatch.context_after = contextAfter;
        matches.push(currentMatch as z.infer<typeof GrepMatchSchema>);
      }
      currentMatch = null;
      contextBefore = [];
      contextAfter = [];
      collectingAfter = false;
      afterCount = 0;
      continue;
    }
    
    // Parse line format: filename:line_number:content or filename-line_number-content
    const matchLine = line.match(/^([^:]+):(\d+):(.*)$/);
    const contextLine = line.match(/^([^-]+)-(\d+)-(.*)$/);
    
    if (matchLine) {
      // This is a match line
      if (currentMatch && currentMatch.file_path) {
        // Save previous match
        currentMatch.context_after = contextAfter;
        matches.push(currentMatch as z.infer<typeof GrepMatchSchema>);
      }
      
      // Start new match
      currentMatch = {
        file_path: matchLine[1],
        line_number: parseInt(matchLine[2]),
        line_content: matchLine[3],
        context_before: [...contextBefore],
        context_after: []
      };
      
      contextBefore = [];
      contextAfter = [];
      collectingAfter = true;
      afterCount = 0;
      
    } else if (contextLine) {
      // This is a context line
      const contextInfo = {
        line_number: parseInt(contextLine[2]),
        content: contextLine[3]
      };
      
      if (collectingAfter && afterCount < contextLines) {
        contextAfter.push(contextInfo);
        afterCount++;
      } else if (!collectingAfter) {
        contextBefore.push(contextInfo);
        if (contextBefore.length > contextLines) {
          contextBefore.shift(); // Keep only last N lines
        }
      }
    }
  }
  
  // Don't forget the last match
  if (currentMatch && currentMatch.file_path) {
    currentMatch.context_after = contextAfter;
    matches.push(currentMatch as z.infer<typeof GrepMatchSchema>);
  }
  
  return matches;
}

/**
 * Generate suggested read ranges based on matches
 */
function generateReadRanges(matches: Array<z.infer<typeof GrepMatchSchema>>): Array<{
  file_path: string;
  start_line: number;
  end_line: number;
  context: string;
}> {
  const rangeMap = new Map<string, {start: number, end: number, matchCount: number}>();
  
  // Group nearby matches in the same file
  for (const match of matches) {
    const key = match.file_path;
    const startLine = Math.max(1, match.line_number - 5);
    const endLine = match.line_number + 5;
    
    if (rangeMap.has(key)) {
      const existing = rangeMap.get(key)!;
      existing.start = Math.min(existing.start, startLine);
      existing.end = Math.max(existing.end, endLine);
      existing.matchCount++;
    } else {
      rangeMap.set(key, {start: startLine, end: endLine, matchCount: 1});
    }
  }
  
  return Array.from(rangeMap.entries()).map(([filePath, range]) => ({
    file_path: filePath,
    start_line: range.start,
    end_line: range.end,
    context: `Contains ${range.matchCount} match(es), expanded context around lines ${range.start}-${range.end}`
  }));
}

export const GrepToolSet = [
  GrepTool,
]; 