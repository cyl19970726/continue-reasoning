// src/core/contexts/coding/toolsets/index.ts

// Main editing strategy tools (includes enhanced file operations with diff support)
export { 
  ReadFileTool,
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
  ReadToolSet,
} from './editing-strategy-tools';

// Re-export bash tools for system operations and simple file reading
export { BashToolSet } from './bash';

// Re-export grep tools for code search and pattern matching
export { GrepTool, GrepToolSet } from './grep';

// Re-export error handling utilities
export { formatDetailedError, extractErrorInfo, createErrorResponse, logEnhancedError } from './error-utils';

// Export snapshot system utilities
export {
  initializeSnapshotSystem,
  getAllSnapshotTools,
  DEFAULT_SNAPSHOT_CONFIG,
  createOperationSnapshot
} from '../snapshot/index';

// Re-export glob tools for file pattern matching
export { GlobTool, GlobToolSet } from './glob';
