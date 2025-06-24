# Enhanced Snapshot System - Usage Examples

## 🚀 Quick Start

### Basic Setup

```typescript
import { 
  createSnapshotManager, 
  DEFAULT_SNAPSHOT_CONFIG,
  EditingToolsIntegration 
} from '../src/agents/contexts/coding/snapshot';

// Create snapshot manager with default configuration
const snapshotManager = createSnapshotManager(DEFAULT_SNAPSHOT_CONFIG);

// Create integration layer for existing tools
const toolsIntegration = new EditingToolsIntegration(snapshotManager);

// Get enhanced tools
const enhancedTools = toolsIntegration.getAllEnhancedTools();
```

### Custom Configuration

```typescript
import { createSnapshotManager } from '../src/agents/contexts/coding/snapshot';

const customConfig = {
  L1: {
    maxOperations: 100,        // Keep more operations in memory
    memoryLimit: 20 * 1024 * 1024, // 20MB limit
    compressionThreshold: 80    // Compress when 80% full
  },
  L2: {
    maxSessions: 50,
    memoryLimit: 100 * 1024 * 1024, // 100MB limit
    persistToDisk: true,
    diskPath: './my-project/snapshots/sessions'
  },
  L3: {
    compressionLevel: 'high',
    retentionPolicy: 'time-based',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    diskPath: './my-project/snapshots/milestones'
  }
};

const snapshotManager = createSnapshotManager(customConfig);
```

## 📋 Tool Usage Examples

### 1. Creating Snapshots

#### Manual Checkpoint Creation
```typescript
import { CreateSnapshotTool } from '../src/agents/contexts/coding/snapshot/tools';

// Create a checkpoint before major refactoring
const result = await CreateSnapshotTool.execute({
  type: 'checkpoint',
  description: 'Before implementing new authentication system',
  tags: ['auth-refactor', 'checkpoint']
});

console.log(`Checkpoint created: ${result.snapshotId}`);
```

#### Milestone Creation
```typescript
// Create milestone after completing a feature
const milestone = await CreateSnapshotTool.execute({
  type: 'milestone',
  reason: 'feature-complete',
  description: 'User authentication system complete',
  tags: ['v1.2.0', 'auth-feature', 'milestone']
});

console.log(`Milestone created: ${milestone.snapshotId}`);
```

### 2. Querying Snapshots

#### Find Recent Snapshots
```typescript
import { QuerySnapshotsTool } from '../src/agents/contexts/coding/snapshot/tools';

// Find all snapshots from the last hour
const recentSnapshots = await QuerySnapshotsTool.execute({
  timeRange: {
    start: Date.now() - (60 * 60 * 1000), // 1 hour ago
    end: Date.now()
  },
  sortBy: 'timestamp',
  sortOrder: 'desc',
  limit: 20
});

recentSnapshots.snapshots.forEach(snapshot => {
  console.log(`${snapshot.id}: ${snapshot.description} (${new Date(snapshot.timestamp)})`);
});
```

#### Find Snapshots by Tags
```typescript
// Find all milestones related to authentication
const authMilestones = await QuerySnapshotsTool.execute({
  type: 'milestone',
  tags: ['auth-feature'],
  sortBy: 'timestamp',
  sortOrder: 'asc'
});

console.log(`Found ${authMilestones.totalCount} authentication milestones`);
```

#### Find Snapshots for Specific Files
```typescript
// This would be implemented as a custom query
const fileSnapshots = await QuerySnapshotsTool.execute({
  // Custom filter logic would be added to find snapshots affecting specific files
  layer: 'L1', // Recent operations
  limit: 50
});
```

### 3. Rollback Operations

#### Safe Rollback with Backup
```typescript
import { RollbackToSnapshotTool } from '../src/agents/contexts/coding/snapshot/tools';

// Rollback to a previous state with automatic backup
const rollbackResult = await RollbackToSnapshotTool.execute({
  targetSnapshotId: 'snap_1704067200000_abc123',
  strategy: 'safe',
  createBackup: true, // Create backup before rollback
  skipVerification: false // Verify files before rollback
});

if (rollbackResult.success) {
  console.log(`Rolled back ${rollbackResult.operationsReverted} operations`);
  console.log(`Backup created: ${rollbackResult.backupSnapshotId}`);
  console.log(`Affected files: ${rollbackResult.affectedFiles.join(', ')}`);
} else {
  console.error(`Rollback failed: ${rollbackResult.message}`);
}
```

#### Selective File Rollback
```typescript
// Rollback only specific files
const selectiveRollback = await RollbackToSnapshotTool.execute({
  targetSnapshotId: 'snap_1704067200000_def456',
  includeFiles: [
    'src/auth/login.ts',
    'src/auth/register.ts'
  ],
  strategy: 'fast',
  createBackup: false
});
```

### 4. Experimental Programming

#### Create Experiment Branch
```typescript
import { CreateExperimentBranchTool, MergeExperimentBranchTool } from '../src/agents/contexts/coding/snapshot/tools';

// Create experimental branch for trying new approach
const branch = await CreateExperimentBranchTool.execute({
  name: 'redis-caching-experiment',
  description: 'Try implementing Redis for user session caching',
  parentSnapshotId: 'snap_1704067200000_parent'
});

console.log(`Experiment branch created: ${branch.branchId}`);

// Work on the experiment...
// (All file operations will be captured in this branch)

// Merge successful experiment
const mergeResult = await MergeExperimentBranchTool.execute({
  branchId: branch.branchId,
  strategy: 'squash' // Combine all branch operations into single commit
});

if (mergeResult.success) {
  console.log(`Experiment merged successfully`);
} else {
  console.log(`Merge failed: ${mergeResult.message}`);
}
```

### 5. System Monitoring and Optimization

#### Get System Statistics
```typescript
import { GetSnapshotStatsTool, OptimizeSnapshotsTool } from '../src/agents/contexts/coding/snapshot/tools';

// Monitor snapshot system health
const stats = await GetSnapshotStatsTool.execute({});

console.log('Snapshot System Statistics:');
console.log(`Total snapshots: ${stats.statistics.totalSnapshots}`);
console.log(`Memory usage: ${(stats.statistics.totalMemoryUsage / 1024 / 1024).toFixed(2)} MB`);
console.log(`Disk usage: ${(stats.statistics.totalDiskUsage / 1024 / 1024).toFixed(2)} MB`);

// Show recommendations
stats.recommendations.forEach(rec => {
  console.log(`💡 ${rec}`);
});
```

#### Optimize Storage
```typescript
// Preview optimization without applying changes
const dryRun = await OptimizeSnapshotsTool.execute({
  layer: 'all',
  aggressiveness: 'normal',
  dryRun: true
});

console.log('Optimization Preview:', dryRun.recommendations);

// Apply optimization
const optimization = await OptimizeSnapshotsTool.execute({
  layer: 'all',
  aggressiveness: 'aggressive',
  dryRun: false
});

console.log('Optimization completed');
```

## 🔄 Complete Workflow Examples

### Feature Development Workflow

```typescript
// 1. Create milestone before starting new feature
const startMilestone = await CreateSnapshotTool.execute({
  type: 'milestone',
  reason: 'before-refactor',
  description: 'Before implementing payment system'
});

// 2. Create experimental branch for testing approach
const experiment = await CreateExperimentBranchTool.execute({
  name: 'stripe-payment-integration',
  description: 'Implement Stripe payment processing'
});

// 3. Work on the feature (automatic snapshots created)
// ... file operations happen here ...

// 4. Create checkpoint after major progress
const checkpoint = await CreateSnapshotTool.execute({
  type: 'checkpoint',
  description: 'Payment API integration complete, starting UI'
});

// 5. If experiment successful, merge to main
const merge = await MergeExperimentBranchTool.execute({
  branchId: experiment.branchId
});

// 6. Create final milestone
const completeMilestone = await CreateSnapshotTool.execute({
  type: 'milestone',
  reason: 'feature-complete',
  description: 'Payment system implementation complete'
});
```

### Error Recovery Workflow

```typescript
// 1. Detect issue and find last known good state
const recentSnapshots = await QuerySnapshotsTool.execute({
  type: 'milestone',
  sortBy: 'timestamp',
  sortOrder: 'desc',
  limit: 5
});

// 2. Rollback to last stable milestone
const rollback = await RollbackToSnapshotTool.execute({
  targetSnapshotId: recentSnapshots.snapshots[0].id,
  strategy: 'safe',
  createBackup: true
});

// 3. Create recovery milestone
const recovery = await CreateSnapshotTool.execute({
  type: 'milestone',
  reason: 'error-recovery',
  description: `Recovered from error, rolled back to ${recentSnapshots.snapshots[0].description}`
});
```

### Performance Monitoring Workflow

```typescript
// Regular maintenance function
async function maintainSnapshotSystem() {
  // 1. Check system health
  const stats = await GetSnapshotStatsTool.execute({});
  
  // 2. Optimize if needed
  if (stats.statistics.totalMemoryUsage > 100 * 1024 * 1024) {
    await OptimizeSnapshotsTool.execute({
      aggressiveness: 'normal'
    });
  }
  
  // 3. Create maintenance milestone
  if (stats.statistics.totalSnapshots > 1000) {
    await CreateSnapshotTool.execute({
      type: 'milestone',
      reason: 'scheduled',
      description: 'Scheduled maintenance checkpoint'
    });
  }
  
  return stats;
}

// Run maintenance every hour
setInterval(maintainSnapshotSystem, 60 * 60 * 1000);
```

## 🎯 Best Practices

### 1. Snapshot Naming and Tagging
```typescript
// Good: Descriptive and tagged
await CreateSnapshotTool.execute({
  type: 'milestone',
  reason: 'feature-complete',
  description: 'User authentication system with JWT tokens and password reset',
  tags: ['auth', 'jwt', 'security', 'v1.2.0']
});

// Avoid: Vague descriptions
await CreateSnapshotTool.execute({
  type: 'checkpoint',
  description: 'Updated stuff'
});
```

### 2. Rollback Safety
```typescript
// Always create backup for important rollbacks
const safeRollback = await RollbackToSnapshotTool.execute({
  targetSnapshotId: snapshotId,
  createBackup: true,    // 👍 Always backup
  strategy: 'safe',      // 👍 Use safe strategy
  skipVerification: false // 👍 Verify before rollback
});
```

### 3. Experimental Programming
```typescript
// Use descriptive branch names
const experiment = await CreateExperimentBranchTool.execute({
  name: 'database-migration-postgres-to-mongodb',
  description: 'Evaluate MongoDB as replacement for PostgreSQL'
});

// Test multiple approaches in parallel
const approaches = ['redis-cache', 'memcached-cache', 'in-memory-cache'];
const branches = await Promise.all(
  approaches.map(approach => 
    CreateExperimentBranchTool.execute({
      name: approach,
      description: `Test ${approach} implementation`
    })
  )
);
```

### 4. Regular Maintenance
```typescript
// Monitor and optimize regularly
const MEMORY_THRESHOLD = 100 * 1024 * 1024; // 100MB
const SNAPSHOT_THRESHOLD = 500;

async function autoMaintenance() {
  const stats = await GetSnapshotStatsTool.execute({});
  
  if (stats.statistics.totalMemoryUsage > MEMORY_THRESHOLD) {
    await OptimizeSnapshotsTool.execute({ aggressiveness: 'normal' });
  }
  
  if (stats.statistics.totalSnapshots > SNAPSHOT_THRESHOLD) {
    await CreateSnapshotTool.execute({
      type: 'milestone',
      reason: 'scheduled',
      description: 'Auto-maintenance milestone'
    });
  }
}
```

This enhanced snapshot system provides a comprehensive solution for managing code changes, enabling fearless experimentation, and maintaining complete change history for your AI coding agents!