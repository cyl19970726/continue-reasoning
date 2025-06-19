# New Snapshot System Modification Plan

## Problem Analysis

The current snapshot system faces state continuity issues when files are modified outside of the snapshot-enhanced-tools.ts system. For example, direct file operations like `fs.write(file.txt)` cannot be detected by the simple-snapshot-manager, leading to state inconsistencies and potential errors.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CodingAgent                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   CodingContext                             ││
│  │  ┌───────────────┐  ┌─────────────────┐  ┌───────────────┐ ││
│  │  │   IRuntime    │  │ Enhanced        │  │   Toolsets    │ ││
│  │  │               │  │ Snapshot        │  │               │ ││
│  │  │ ┌───────────┐ │  │ Manager         │  │ ┌───────────┐ │ ││
│  │  │ │File Ops   │ │  │                 │  │ │ Edit Tools│ │ ││
│  │  │ │Diff Gen   │ │  │ ┌─────────────┐ │  │ │ Bash Tools│ │ ││
│  │  │ │Patch Ops  │ │  │ │ Snapshots   │ │  │ │ Snapshot  │ │ ││
│  │  │ │State Det  │ │  │ │ Index       │ │  │ │ Tools     │ │ ││
│  │  │ └───────────┘ │  │ │ Milestones  │ │  │ └───────────┘ │ ││
│  │  └───────────────┘  │ │ Checkpoints │ │  └───────────────┘ ││
│  │                     │ │ Unknown     │ │                    ││
│  │                     │ │ Change Det  │ │                    ││
│  │                     │ └─────────────┘ │                    ││
│  │                     └─────────────────┘                    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                  File System Storage                            │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │    .continue-reasoning/                                     ││
│  │    ├── snapshots/                                           ││
│  │    │   ├── index.json                                       ││
│  │    │   └── 2024/01/29/snapshot-uuid1.json                  ││
│  │    ├── milestones/                                          ││
│  │    │   ├── index.json                                       ││
│  │    │   ├── milestone-uuid1.json                             ││
│  │    │   └── milestone-uuid2.json                             ││
│  │    └── checkpoints/                                         ││
│  │        ├── latest/                                          ││
│  │        │   ├── file1.txt                                    ││
│  │        │   └── file2.py                                     ││
│  │        └── checkpoint-metadata.json                         ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Solution Strategy

We choose **Solution 2**: Implement unknown modification detection with file checkpoint system.

### Core Components

1. **Unknown Modification Detection**
   - Compare current file hashes with last known state
   - Generate diff for unknown changes
   - Integration with existing state continuity system

2. **File Checkpoint System**
   - Store file copies after each snapshot operation
   - Only keep the latest checkpoint (configurable)
   - Efficient storage and retrieval

3. **Enhanced State Validation**
   - Pre-snapshot validation with unknown change handling
   - Automatic recovery suggestions
   - Configurable strictness levels

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Checkpoint Storage System**
   ```typescript
   interface CheckpointData {
     id: string;
     timestamp: string;
     snapshotId: string;
     files: Record<string, string>; // filepath -> content
     metadata: {
       totalFiles: number;
       totalSizeBytes: number;
       creationTimeMs: number;
     };
   }
   ```

2. **Unknown Change Detection**
   ```typescript
   interface UnknownChangeResult {
     hasUnknownChanges: boolean;
     unknownChanges: UnknownChange[];
     affectedFiles: string[];
     generatedDiff?: string;
   }

   interface UnknownChange {
     filePath: string;
     changeType: 'modified' | 'created' | 'deleted';
     expectedHash: string;
     actualHash: string;
     diff?: string;
   }
   ```

### Phase 2: Enhanced Snapshot Manager

#### New Methods to Implement:

1. **`detectUnknownModifications(affectedFiles: string[]): Promise<UnknownChangeResult>`**
   - Compare current file states with last known checkpoint
   - Generate diffs for unknown modifications
   - Return comprehensive change analysis

2. **`createFileCheckpoint(snapshotId: string, affectedFiles: string[]): Promise<string>`**
   - Create file copies after successful snapshot
   - Store in checkpoint directory
   - Update checkpoint metadata

3. **`validateFileStateBeforeSnapshot(affectedFiles: string[], options?: ValidationOptions): Promise<ValidationResult>`**
   - Pre-snapshot validation with unknown change handling
   - Option to auto-handle unknown changes
   - Integration with existing continuity validation

4. **`handleUnknownChanges(unknownChanges: UnknownChange[], strategy: 'integrate' | 'reject' | 'warn'): Promise<HandleResult>`**
   - Strategy for dealing with unknown modifications
   - Option to create compensating snapshots
   - User-friendly error messages and recovery suggestions

### Phase 3: Integration and Configuration

1. **Configuration Options**
   ```typescript
   interface SnapshotConfig {
     enableUnknownChangeDetection: boolean;
     unknownChangeStrategy: 'strict' | 'warn' | 'auto-integrate';
     keepAllCheckpoints: boolean;
     maxCheckpointAge: number; // days
     excludeFromChecking: string[]; // additional ignore patterns
   }
   ```

2. **Enhanced Tool Integration**
   - Modify snapshot-enhanced-tools.ts to use new validation
   - Add pre-execution checks
   - Enhanced error reporting

## Key Interfaces

### Enhanced SimpleSnapshotManager

```typescript
class SimpleSnapshotManager {
  // Existing methods...
  
  // New methods for unknown change detection
  detectUnknownModifications(affectedFiles: string[]): Promise<UnknownChangeResult>;
  
  // Checkpoint management
  createFileCheckpoint(snapshotId: string, affectedFiles: string[]): Promise<string>;
  loadFileCheckpoint(checkpointId?: string): Promise<CheckpointData | null>;
  cleanupOldCheckpoints(olderThan?: Date): Promise<void>;
  
  // Enhanced validation
  validateFileStateBeforeSnapshot(
    affectedFiles: string[], 
    options?: ValidationOptions
  ): Promise<ValidationResult>;
  
  // Unknown change handling
  handleUnknownChanges(
    unknownChanges: UnknownChange[], 
    strategy: UnknownChangeStrategy
  ): Promise<HandleResult>;
  
  // Configuration
  updateConfig(config: Partial<SnapshotConfig>): void;
  getConfig(): SnapshotConfig;
}
```

### Enhanced Snapshot Creation Flow

```typescript
async createSnapshot(operation: SnapshotOperation): Promise<string> {
  // 1. Pre-validation with unknown change detection
  const validationResult = await this.validateFileStateBeforeSnapshot(
    operation.affectedFiles
  );
  
  if (!validationResult.success) {
    if (validationResult.unknownChanges) {
      // Handle unknown changes based on strategy
      await this.handleUnknownChanges(
        validationResult.unknownChanges,
        this.config.unknownChangeStrategy
      );
    } else {
      throw new Error(validationResult.error);
    }
  }
  
  // 2. Create snapshot (existing logic)
  const snapshotId = await this.createSnapshotInternal(operation);
  
  // 3. Create file checkpoint
  await this.createFileCheckpoint(snapshotId, operation.affectedFiles);
  
  return snapshotId;
}
```

## Migration Strategy

1. **Backward Compatibility**
   - All existing functionality remains unchanged
   - New features are opt-in via configuration
   - Graceful degradation when checkpoints are missing

2. **Gradual Rollout**
   - Phase 1: Core infrastructure (no behavior changes)
   - Phase 2: Opt-in unknown change detection
   - Phase 3: Enhanced integration and default enablement

3. **Testing Strategy**
   - Unit tests for each new component
   - Integration tests with various change scenarios
   - Performance benchmarks for checkpoint operations

## Configuration Options

```typescript
// Default configuration
const DEFAULT_CONFIG: SnapshotConfig = {
  enableUnknownChangeDetection: true,
  unknownChangeStrategy: 'warn',
  keepAllCheckpoints: false,
  maxCheckpointAge: 7, // days
  excludeFromChecking: [
    '*.log',
    '*.tmp',
    '*_generated.*',
    'node_modules/**'
  ]
};
```

## Error Handling and Recovery

1. **Unknown Change Detection Failures**
   - Fallback to basic hash comparison
   - Warning logs with actionable suggestions
   - Option to disable detection temporarily

2. **Checkpoint Creation Failures**
   - Continue with snapshot creation
   - Log warnings for debugging
   - Clean retry mechanism

3. **State Recovery Options**
   - Manual checkpoint creation command
   - Reset state continuity tracking
   - Force mode for emergency situations

## Performance Considerations

1. **Checkpoint Storage**
   - Only store files that are likely to be modified
   - Compression for large files
   - Async operations to avoid blocking

2. **Unknown Change Detection**
   - Efficient file hash calculation
   - Parallel processing for multiple files
   - Caching of recent hash calculations

3. **Memory Management**
   - Stream-based file operations for large files
   - Configurable memory limits
   - Automatic cleanup of temporary data

This comprehensive plan addresses the state continuity issues while maintaining backward compatibility and providing flexible configuration options for different use cases. 