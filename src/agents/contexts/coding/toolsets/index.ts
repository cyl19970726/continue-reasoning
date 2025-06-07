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
  EditingStrategyToolExamples
} from './editing-strategy-tools';

// Re-export bash tools for system operations and simple file reading
export { BashToolSet } from './bash';

// Export simplified snapshot system tools
export {
  SimpleSnapshotToolSet,
  ReadSnapshotDiffTool,
  GetEditHistoryTool,
  ReverseOpTool,
  CreateMilestoneTool,
  GetMilestonesTool
} from '../snapshot/simple-snapshot-tools';

// Export snapshot-enhanced editing tools
export {
  SnapshotEnhancedApplyWholeFileEditTool,
  createEnhancedWholeFileEditTool
} from '../snapshot/snapshot-enhanced-tools';

// Export snapshot system utilities
export {
  SimpleSnapshotManager,
  initializeSnapshotSystem,
  getAllSnapshotTools,
  DEFAULT_SNAPSHOT_CONFIG,
  createOperationSnapshot
} from '../snapshot/index';

// Complete toolset including snapshot functionality
export const CodingToolsetWithSnapshots = [
  ...EditingStrategyToolSet,
  ...BashToolSet,
  ...SimpleSnapshotToolSet,
  SnapshotEnhancedApplyWholeFileEditTool
]; 