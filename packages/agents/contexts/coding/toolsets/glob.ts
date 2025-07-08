import { z } from 'zod';
import { createTool, IAgent, logger } from '@continue-reasoning/core';
import * as fs from 'fs';
import * as path from 'path';

// Define the structure of a single glob match
const GlobMatchSchema = z.object({
  file_path: z.string().describe('Relative path of the matching file (from workspace root)'),
  size_bytes: z.number().optional().describe('Size of the file in bytes'),
});

// Parameters accepted by the Glob tool
const GlobParamsSchema = z.object({
  pattern: z.string().describe("Glob pattern to match files, e.g. '*.ts' or 'src/**/*.test.ts'"),
  paths: z.array(z.string()).optional().describe('Relative paths (files or directories) to start the search from. Defaults to workspace root'),
  exclude_patterns: z.array(z.string()).optional().describe('Glob patterns to exclude from the search'),
  max_results: z.number().optional().describe('Maximum number of files to return (1-500, default: 100)'),
  case_sensitive: z.boolean().optional().describe('Whether the pattern match should be case-sensitive (default: false)'),
});

// Output returned by the Glob tool
const GlobReturnsSchema = z.object({
  files: z.array(GlobMatchSchema).describe('Files that matched the glob pattern'),
  total_matches: z.number().describe('Number of files that matched'),
  success: z.boolean(),
  message: z.string().optional(),
});

/**
 * Convert a simple glob pattern to a RegExp.
 * Supported wildcards: ** => any directories, * => any chars except "/", ? => single char
 */
function globToRegExp(pattern: string, caseSensitive: boolean): RegExp {
  // Escape regex special characters except for our wildcards *, ?, ** which will be processed later
  let regex = pattern.replace(/[.+^${}()|\\[\\]\\\\]/g, '\\$&');
  // Handle double star first (matches any directory depth)
  regex = regex.replace(/\*\*/g, '§§DOUBLE_STAR§§');
  // Handle single star (anything but path separator)
  regex = regex.replace(/\*/g, '[^/]*');
  // Restore double star to match any char including path separator
  regex = regex.replace(/§§DOUBLE_STAR§§/g, '.*');
  // Handle ? wildcard (single char)
  regex = regex.replace(/\?/g, '.');
  return new RegExp('^' + regex + '$', caseSensitive ? '' : 'i');
}

// Recursively traverse the directory tree and invoke callback on each file.
function traverseDir(dir: string, onFile: (filePath: string) => boolean | void) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    // Skip directories we can't read
    return;
  }
  
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip typical large directories
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      traverseDir(entryPath, onFile);
    } else if (entry.isFile()) {
      const shouldContinue = onFile(entryPath);
      // If callback explicitly returns false, stop the traversal early
      if (shouldContinue === false) return;
    }
  }
}

// Create the Glob tool
export const GlobTool = createTool({
  id: 'Glob',
  name: 'Glob',
  description: 'Find files matching a glob pattern within the current workspace. Useful for quickly locating files before reading or editing.',
  inputSchema: GlobParamsSchema,
  outputSchema: GlobReturnsSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();

    const caseSensitive = params.case_sensitive ?? false;
    const patternReg = globToRegExp(params.pattern, caseSensitive);
    const excludeRegs = (params.exclude_patterns ?? ['node_modules/**', '.git/**']).map((p) => globToRegExp(p, caseSensitive));

    const maxResults = Math.max(1, Math.min(500, Math.floor(params.max_results ?? 100)));
    const searchRoots = params.paths?.length ? params.paths : ['.'];

    const matches: Array<z.infer<typeof GlobMatchSchema>> = [];

    const isExcluded = (rel: string) => excludeRegs.some((r) => r.test(rel));

    try {
      for (const root of searchRoots) {
        const absRoot = path.resolve(workspacePath, root);
        if (!fs.existsSync(absRoot)) continue;

        traverseDir(absRoot, (filePath) => {
          const relPath = path.relative(workspacePath, filePath).replace(/\\/g, '/');
          if (isExcluded(relPath)) return;

          if (patternReg.test(relPath)) {
            matches.push({
              file_path: relPath,
              size_bytes: fs.statSync(filePath).size,
            });
            if (matches.length >= maxResults) return false; // stop traversal
          }
        });

        if (matches.length >= maxResults) break;
      }

      return {
        files: matches.slice(0, maxResults), // Ensure we don't exceed maxResults
        total_matches: matches.length,
        success: true,
        message: matches.length > 0 ? `Found ${matches.length} file(s).` : 'No files matched',
      } as z.infer<typeof GlobReturnsSchema>;
    } catch (error) {
      logger.error('GlobTool execution error:', error);
      return {
        files: [],
        total_matches: 0,
        success: false,
        message: `Glob search failed: ${error}`,
      } as z.infer<typeof GlobReturnsSchema>;
    }
  },
});

export const GlobToolSet = [
  GlobTool,
]; 