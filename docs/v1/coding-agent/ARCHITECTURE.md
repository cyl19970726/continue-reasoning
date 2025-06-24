# Snapshot System Architecture

## Overview

The snapshot system provides version control and rollback capabilities for code editing operations within the CodingAgent. It captures diffs, manages history, and enables operation reversal.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CodingAgent                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                   CodingContext                             ││
│  │  ┌───────────────┐  ┌─────────────────┐  ┌───────────────┐ ││
│  │  │   IRuntime    │  │ SimpleSnapshot  │  │   Toolsets    │ ││
│  │  │               │  │    Manager      │  │               │ ││
│  │  │ ┌───────────┐ │  │                 │  │ ┌───────────┐ │ ││
│  │  │ │File Ops   │ │  │ ┌─────────────┐ │  │ │ Edit Tools│ │ ││
│  │  │ │Diff Gen   │ │  │ │  Snapshots  │ │  │ │ Bash Tools│ │ ││
│  │  │ │Patch Ops  │ │  │ │  Index      │ │  │ │ Snapshot  │ │ ││
│  │  │ └───────────┘ │  │ │  Milestones │ │  │ │ Tools     │ │ ││
│  │  └───────────────┘  │ └─────────────┘ │  │ └───────────┘ │ ││
│  │                     └─────────────────┘  └───────────────┘ ││
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
│  │    └── milestones/                                          ││
│  │        ├── index.json                                       ││
│  │        ├── milestone-uuid1.json                             ││
│  │        └── milestone-uuid2.json                             ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

### 1. SimpleSnapshotManager
- **Primary Role**: Manages snapshot lifecycle and storage with state continuity validation
- **Key Functions**:
  - Create snapshots for editing operations with continuity validation
  - Generate reverse diffs using `diff.ts` utilities
  - Query edit history with filtering
  - Perform rollback operations
  - Manage milestones for grouping operations
  - **🆕 State Continuity Validation**: Ensures all snapshots are created sequentially
  - **🆕 File Hash Tracking**: Monitors file state changes to detect external modifications
  - **🆕 Workspace Synchronization**: Validates that workspace state matches snapshot system
  - **🆕 Milestone Continuity**: Ensures milestones form continuous chains without gaps
  - **🆕 Convenient Milestone Creation**: Auto-detect ranges and create milestones easily

### 2. State Continuity Features

#### Snapshot Continuity
- Each snapshot includes `sequenceNumber` and `previousSnapshotId`
- File hashes are calculated before and after each operation
- External file modifications are detected and rejected
- Ensures all changes go through the snapshot system

#### Milestone Continuity  
- Milestones track `startSequenceNumber` and `endSequenceNumber`
- Validates that included snapshots form a continuous sequence
- Links to previous milestones for complete history tracking
- **🆕 Cross-Milestone Validation**: Ensures new milestones start exactly where the previous milestone ended
- **🆕 Automatic Range Detection**: Can auto-detect start/end points for milestone creation

#### Error Handling
- **State Mismatch Error**: Thrown when files are modified outside snapshot system
- **Sequence Discontinuity Error**: Thrown when snapshots don't form continuous sequence
- **Parent-Child Relationship Error**: Thrown when snapshot chain is broken
- **🆕 Milestone Continuity Error**: Thrown when milestones have gaps or overlaps
- **🆕 Range Validation Error**: Thrown when milestone ranges are invalid

### 3. Snapshot Storage Structure
```
.continue-reasoning/
├── snapshots/
│   ├── index.json                # Fast lookup index for snapshots
│   └── YYYY/MM/DD/               # Date-based organization
│       ├── snapshot-{uuid}.json  # Individual snapshots with continuity data
│       └── snapshot-{uuid}.json
└── milestones/
    ├── index.json                # Fast lookup index for milestones
    ├── milestone-{uuid}.json     # Milestone definitions with sequence tracking
    └── milestone-{uuid}.json
```

#### Enhanced Snapshot Data Structure
```typescript
interface SnapshotData {
  id: string;
  timestamp: string;
  description: string;
  tool: string;
  affectedFiles: string[];
  diff: string;
  reverseDiff?: string;
  // 🆕 Continuity fields
  previousSnapshotId?: string;
  sequenceNumber: number;
  baseFileHashes: Record<string, string>;
  resultFileHashes: Record<string, string>;
  // ... other fields
}
```

#### Enhanced Milestone Data Structure
```typescript
interface MilestoneData {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  snapshotIds: string[];
  // 🆕 Continuity fields
  startSequenceNumber: number;
  endSequenceNumber: number;
  previousMilestoneId?: string;
  // ... other fields
}
```

### 4. Integration with CodingAgent

Currently, there's a design issue where each tool creates its own `SimpleSnapshotManager` instance:

```typescript
// Current (problematic) approach
const snapshotManager = new SimpleSnapshotManager(workspacePath);
```

## Proposed Architecture Improvements

### 1. CodingContext Integration

Modify `CodingContext` to include a shared `SimpleSnapshotManager`:

```typescript
// Enhanced CodingContext
export interface ICodingContext extends IRAGEnabledContext<typeof CodingContextDataSchema> {
  getRuntime(): IRuntime;
  getSandbox(): ISandbox;
  getSnapshotManager(): SimpleSnapshotManager;  // NEW
}
```

### 2. Automatic Snapshot Creation

Integrate snapshot creation into the core editing operations:

```typescript
// In IRuntime implementations
async writeFile(filePath: string, content: string, options?: any): Promise<FileEditResult> {
  const oldContent = await this.readFile(filePath).catch(() => '');
  const result = await this.performWrite(filePath, content, options);
  
  // Auto-create snapshot if context provides snapshot manager
  if (this.context?.getSnapshotManager) {
    await this.context.getSnapshotManager().createSnapshot({
      tool: 'writeFile',
      description: `Modified ${filePath}`,
      affectedFiles: [filePath],
      diff: result.diff,
      // ... other metadata
    });
  }
  
  return result;
}
```

### 3. Enhanced Agent Interface

Since `IAgent` doesn't provide extension points, we can use composition:

```typescript
export interface ICodingAgent extends IAgent {
  getSnapshotManager(): SimpleSnapshotManager;
  getWorkspacePath(): string;
}

export class CodingAgent extends BaseAgent implements ICodingAgent {
  private snapshotManager: SimpleSnapshotManager;
  
  constructor(/* ... */) {
    super(/* ... */);
    this.snapshotManager = new SimpleSnapshotManager(this.workspacePath);
  }
  
  getSnapshotManager(): SimpleSnapshotManager {
    return this.snapshotManager;
  }
}
```

## Data Flow

1. **Edit Operation**: User calls editing tool
2. **Runtime Execution**: IRuntime performs file operation
3. **Diff Generation**: Generate unified diff using `diff.ts` utilities
4. **Snapshot Creation**: SimpleSnapshotManager creates snapshot
5. **Storage**: Snapshot saved to file system
6. **Index Update**: Fast lookup index updated

## Key Benefits

1. **Centralized Management**: Single SimpleSnapshotManager per workspace
2. **Automatic Tracking**: All edits automatically create snapshots
3. **Consistent Diff Handling**: Uses standardized `diff.ts` utilities
4. **Performance**: Shared instance reduces initialization overhead
5. **State Consistency**: Single source of truth for snapshot state
6. **🆕 Milestone Continuity**: Ensures complete coverage without gaps or overlaps
7. **🆕 Convenient Creation**: Multiple ways to create milestones with auto-detection

## Milestone Creation Patterns

### 1. Manual Milestone Creation
```typescript
// Create milestone with specific snapshots
const result = await snapshotManager.createMilestone({
  title: 'Feature Implementation',
  description: 'Implemented user authentication',
  snapshotIds: ['snap1', 'snap2', 'snap3'],
  tags: ['feature', 'auth']
});
```

### 2. Range-based Milestone Creation (Recommended)
```typescript
// Create milestone from beginning to specific snapshot
const result = await snapshotManager.createMilestoneByRange({
  title: 'Phase 1 Complete',
  description: 'Completed first development phase',
  endSnapshotId: 'snap5', // Auto-starts from beginning or last milestone
  tags: ['phase1']
});

// Create milestone to latest snapshot
const result = await snapshotManager.createMilestoneByRange({
  title: 'Current Progress',
  description: 'All work up to now',
  // No endSnapshotId - uses latest snapshot
  tags: ['progress']
});
```

**Key Benefits of Range Creation:**
- **Automatic Start Detection**: Always starts from the correct position (beginning or after last milestone)
- **Continuity Guarantee**: Ensures no gaps in milestone coverage
- **Simplified API**: No need to manually track start positions
- **Error Prevention**: Eliminates possibility of creating gaps or overlaps

## Error Scenarios and Recovery

### Milestone Continuity Violations
```typescript
// This will throw an error if there's a gap
try {
  await snapshotManager.createMilestone({
    title: 'Invalid Milestone',
    snapshotIds: ['snap1', 'snap3'] // Missing snap2
  });
} catch (error) {
  // Error: "Milestone continuity violation detected..."
  // Provides detailed information about the gap
}
```

### Recovery Strategies
1. **Use Range Creation**: Let the system auto-detect continuous ranges
2. **Check Current State**: Use `getCurrentState()` to understand current position
3. **Validate Workspace**: Use `validateWorkspaceSync()` to check for external changes
4. **Reset if Needed**: Use `resetStateContinuity()` as last resort

## Integration with Diff System

The snapshot system heavily relies on the `diff.ts` utilities:

- **generateUnifiedDiff**: Create diffs for operations
- **reverseDiff**: Generate rollback diffs
- **validateDiffFormat**: Ensure diff quality
- **parseMultiFileDiff**: Handle multi-file operations

## Future Enhancements

1. **Git Integration**: Sync with Git commits
2. **Compression**: Compress old snapshots
3. **Selective Rollback**: Rollback specific files only
4. **Conflict Resolution**: Better merge conflict handling
5. **Performance Optimization**: Lazy loading, caching