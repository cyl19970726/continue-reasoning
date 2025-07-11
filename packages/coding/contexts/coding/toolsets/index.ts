import { BashCommandTool } from './bash.js';
import { GrepTool } from './grep.js';
import { GlobTool } from './glob.js';
import { ReadFileTool } from './read.js';

// Main editing strategy tools (includes enhanced file operations with diff support)
export { 
  ApplyWholeFileEditTool,
  ApplyEditBlockTool,
  ApplyRangedEditTool,
  ApplyUnifiedDiffTool,
  ReverseDiffTool,
  DeleteTool,
  EditingStrategyToolSet,
} from './editing-strategy-tools.js';

// Re-export bash tools for system operations and simple file reading
export { BashCommandTool } from './bash.js';
// Re-export grep tools for code search and pattern matching
export { ReadFileTool } from './read.js';
export const NoEditToolSet = [BashCommandTool, ReadFileTool,GrepTool,GlobTool];

  // Export chat history management tool
  export { ExcludeChatHistoryTool } from '@continue-reasoning/core';

// Re-export error handling utilities
export { formatDetailedError, extractErrorInfo, createErrorResponse, logEnhancedError } from './error-utils.js';


// Re-export glob tools for file pattern matching
// export { GlobTool, GlobToolSet } from './glob.js';
