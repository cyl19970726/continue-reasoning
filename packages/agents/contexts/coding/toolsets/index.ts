import { BashCommandTool } from './bash.js';
// import { GrepTool } from './grep.js';
// import { GlobTool } from './glob.js';
import { ReadFileTool } from './read.js';

// Main editing strategy tools (includes enhanced file operations with diff support)
export { 
  ApplyWholeFileEditTool,
  ApplyEditBlockTool,
  ApplyRangedEditTool,
  ApplyUnifiedDiffTool,
  ReverseDiffTool,
  DeleteTool,
  CreateDirectoryTool,
  CompareFilesTool,
  EditingStrategyToolSet,
  EditingStrategyToolExamples,
} from './editing-strategy-tools.js';

// Re-export bash tools for system operations and simple file reading
export { BashCommandTool } from './bash.js';
// Re-export grep tools for code search and pattern matching
// export { GrepTool, GrepToolSet } from './grep.js';
export { ReadFileTool } from './read.js';
export const NoEditToolSet = [BashCommandTool, ReadFileTool];

// Re-export error handling utilities
export { formatDetailedError, extractErrorInfo, createErrorResponse, logEnhancedError } from './error-utils.js';

// Export snapshot system utilities
export {
  initializeSnapshotSystem,
  getAllSnapshotTools,
  DEFAULT_SNAPSHOT_CONFIG,
  createOperationSnapshot
} from '../snapshot/index.js';

// Re-export glob tools for file pattern matching
// export { GlobTool, GlobToolSet } from './glob.js';
