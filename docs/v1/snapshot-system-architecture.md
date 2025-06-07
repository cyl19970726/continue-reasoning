# Enhanced Snapshot System - Architecture

## 🏗️ System Overview

```mermaid
graph TB
    subgraph "AI Coding Agent"
        A[Agent] --> B[Coding Context]
        B --> C[Editing Tools]
    end
    
    subgraph "Enhanced Snapshot System"
        C --> D[EditingToolsIntegration]
        D --> E[EnhancedSnapshotManager]
        
        E --> F[L1: OperationBuffer]
        E --> G[L2: SessionCache]
        E --> H[L3: MilestoneStore]
        
        E --> I[CompressionEngine]
        E --> J[BranchManager]
        E --> K[AutoRollback]
    end
    
    subgraph "Storage Layers"
        F --> F1[Memory<br/>50 ops<br/><10ms]
        G --> G1[LRU Cache<br/>1000 sessions<br/><100ms]
        H --> H1[Compressed Disk<br/>Unlimited<br/><1s]
    end
    
    subgraph "Agent Tools"
        E --> L[Snapshot Management Tools]
        L --> L1[CreateSnapshot]
        L --> L2[QuerySnapshots]
        L --> L3[RollbackToSnapshot]
        L --> L4[CreateExperimentBranch]
        L --> L5[MergeExperimentBranch]
        L --> L6[OptimizeSnapshots]
    end
    
    style E fill:#ff6b6b,stroke:#333,stroke-width:3px
    style F fill:#4ecdc4,stroke:#333,stroke-width:2px
    style G fill:#45b7d1,stroke:#333,stroke-width:2px
    style H fill:#96ceb4,stroke:#333,stroke-width:2px
```

## 📊 Three-Layer Architecture

### Layer 1: Operation Buffer (Hot Storage)
```mermaid
graph LR
    subgraph "L1: OperationBuffer"
        A[Circular Buffer] --> B[50 Operations Max]
        B --> C[<10ms Access]
        C --> D[LRU Eviction]
        
        E[Access Map] --> F[O(1) Lookup]
        
        G[Memory Tracking] --> H[Auto Compression]
        H --> I[Promote to L2]
    end
    
    style A fill:#ff6b6b,stroke:#333,stroke-width:2px
```

### Layer 2: Session Cache (Warm Storage)
```mermaid
graph LR
    subgraph "L2: SessionCache"
        A[LRU Cache] --> B[1000 Sessions Max]
        B --> C[<100ms Access]
        C --> D[Optional Persistence]
        
        E[Session Operations] --> F[Combined Diffs]
        F --> G[Branch Management]
        
        H[Async Persistence] --> I[Background Saves]
    end
    
    style A fill:#45b7d1,stroke:#333,stroke-width:2px
```

### Layer 3: Milestone Store (Cold Storage)
```mermaid
graph LR
    subgraph "L3: MilestoneStore"
        A[Compressed Storage] --> B[Unlimited Capacity]
        B --> C[<1s Access]
        C --> D[Retention Policies]
        
        E[Index System] --> F[Fast Queries]
        F --> G[Metadata Search]
        
        H[Backup System] --> I[Disaster Recovery]
    end
    
    style A fill:#96ceb4,stroke:#333,stroke-width:2px
```

## 🔄 Data Flow Architecture

```mermaid
sequenceDiagram
    participant Agent as AI Agent
    participant Tools as Editing Tools
    participant Integration as Integration Layer
    participant Manager as Snapshot Manager
    participant L1 as L1: Buffer
    participant L2 as L2: Cache
    participant L3 as L3: Store
    participant Compression as Compression Engine
    
    Agent->>Tools: Execute Edit Operation
    Tools->>Integration: Tool Execution
    Integration->>Integration: Capture Pre-State
    Integration->>Tools: Execute Original Tool
    Tools-->>Integration: Result + Diff
    Integration->>Manager: captureOperation()
    
    Manager->>L1: Store Operation Snapshot
    L1-->>Manager: Snapshot ID
    
    alt L1 Near Capacity
        Manager->>Compression: Compress Old Operations
        Compression-->>Manager: Compressed Session
        Manager->>L2: Store Session Snapshot
        Manager->>L1: Evict Old Operations
    end
    
    alt Create Milestone
        Manager->>L3: Store Milestone
        L3->>L3: Compress & Index
    end
    
    alt Rollback Request
        Manager->>L1: Get Recent Operations
        Manager->>L2: Get Session History
        Manager->>Manager: Generate Reverse Diff
        Manager->>Integration: Apply Reverse Changes
    end
    
    Manager-->>Agent: Operation Complete
```

## 🧠 Compression Strategy Architecture

```mermaid
graph TB
    subgraph "Compression Pipeline"
        A[Input: Operation Snapshots] --> B[Pattern Recognition]
        
        B --> C[Continuous Edits?]
        B --> D[Repeated Operations?]
        B --> E[Redundant Changes?]
        B --> F[Refactoring Sequence?]
        
        C -->|Yes| G[Merge Continuous]
        D -->|Yes| H[Deduplicate]
        E -->|Yes| I[Eliminate Redundancy]
        F -->|Yes| J[Combine Refactoring]
        
        G --> K[Intelligent Diff Merge]
        H --> K
        I --> K
        J --> K
        
        K --> L[Generate Compressed Snapshot]
        L --> M[Update Compression Metadata]
        M --> N[Output: Compressed Snapshot]
    end
    
    style B fill:#feca57,stroke:#333,stroke-width:2px
    style K fill:#ff6b6b,stroke:#333,stroke-width:2px
```

## 🌿 Branch Management Architecture

```mermaid
graph TB
    subgraph "Experimental Programming"
        A[Main Timeline] --> B[Create Branch]
        B --> C[Branch: Experiment A]
        B --> D[Branch: Experiment B]
        B --> E[Branch: Experiment C]
        
        C --> F[Test Approach 1]
        D --> G[Test Approach 2]
        E --> H[Test Approach 3]
        
        F --> I{Evaluate Results}
        G --> I
        H --> I
        
        I -->|Best Result| J[Merge Winner]
        I -->|Failed| K[Discard Branch]
        
        J --> L[Update Main Timeline]
        K --> M[Clean Up Resources]
    end
    
    style A fill:#48dbfb,stroke:#333,stroke-width:3px
    style I fill:#feca57,stroke:#333,stroke-width:2px
```

## 🎯 Tool Integration Architecture

```mermaid
graph TB
    subgraph "Enhanced Editing Tools"
        A[Original Tools] --> B[Snapshot Wrapper]
        
        B --> C[Pre-Operation Capture]
        C --> D[Execute Original Tool]
        D --> E[Post-Operation Capture]
        E --> F[Generate Diff]
        F --> G[Store Snapshot]
        
        G --> H[Enhanced Result]
    end
    
    subgraph "Original Tools"
        A1[ApplyWholeFileEdit]
        A2[ApplyEditBlock]
        A3[ApplyRangedEdit]
        A4[ApplyUnifiedDiff]
        A5[Delete]
        A6[CreateDirectory]
    end
    
    subgraph "Snapshot Tools"
        S1[CreateSnapshot]
        S2[QuerySnapshots]
        S3[RollbackToSnapshot]
        S4[CreateExperimentBranch]
        S5[MergeExperimentBranch]
        S6[OptimizeSnapshots]
    end
    
    A1 --> B
    A2 --> B
    A3 --> B
    A4 --> B
    A5 --> B
    A6 --> B
    
    style B fill:#ff6b6b,stroke:#333,stroke-width:3px
```

## 📈 Performance Optimization Architecture

```mermaid
graph LR
    subgraph "Performance Monitoring"
        A[Memory Monitor] --> B[Usage Tracking]
        B --> C[Threshold Alerts]
        
        D[Access Pattern] --> E[LRU Optimization]
        E --> F[Cache Efficiency]
        
        G[Compression Ratio] --> H[Algorithm Selection]
        H --> I[Adaptive Compression]
    end
    
    subgraph "Auto Optimization"
        C --> J[Auto Compression]
        F --> K[Cache Resize]
        I --> L[Strategy Switch]
        
        J --> M[Background Processing]
        K --> M
        L --> M
    end
    
    style M fill:#26de81,stroke:#333,stroke-width:2px
```

## 🔧 Event System Architecture

```mermaid
graph TB
    subgraph "Event System"
        A[Snapshot Operations] --> B[Event Emitter]
        
        B --> C[snapshot:created]
        B --> D[snapshot:rollback]
        B --> E[snapshot:compression]
        B --> F[snapshot:cleanup]
        B --> G[experiment:branch-created]
        B --> H[experiment:branch-merged]
        B --> I[snapshot:milestone-created]
        B --> J[snapshot:memory-warning]
        B --> K[snapshot:error]
        
        C --> L[Agent Listeners]
        D --> L
        E --> L
        F --> L
        G --> L
        H --> L
        I --> L
        J --> L
        K --> L
    end
    
    style B fill:#fd79a8,stroke:#333,stroke-width:2px
```

## 🎮 Auto-Rollback System Architecture

```mermaid
graph TB
    subgraph "Auto-Rollback Triggers"
        A[Code Operations] --> B[Trigger Monitor]
        
        B --> C[Compile Error?]
        B --> D[Test Failure?]
        B --> E[Performance Drop?]
        B --> F[Quality Degradation?]
        
        C -->|Fatal Error| G[Auto Rollback]
        D -->|>30% Failure| G
        E -->|>20% Slower| G
        F -->|Complexity Spike| G
        
        G --> H[Find Last Good State]
        H --> I[Generate Reverse Diff]
        I --> J[Apply Rollback]
        J --> K[Create Recovery Snapshot]
    end
    
    style G fill:#e17055,stroke:#333,stroke-width:2px
```

## 🏢 System Integration Points

```mermaid
graph LR
    subgraph "Integration Layer"
        A[Coding Agent] --> B[Context Manager]
        B --> C[Snapshot System]
        
        C --> D[Git Integration]
        C --> E[IDE Integration]
        C --> F[CI/CD Integration]
        C --> G[Monitoring Integration]
        
        D --> H[Git Hooks]
        E --> I[Real-time Sync]
        F --> J[Pipeline Triggers]
        G --> K[Metrics Collection]
    end
    
    style C fill:#ff6b6b,stroke:#333,stroke-width:3px
```

## 📊 Memory Management Strategy

```mermaid
graph TB
    subgraph "Memory Management"
        A[Memory Allocation] --> B[Layer Budgets]
        
        B --> C[L1: 10MB]
        B --> D[L2: 50MB]
        B --> E[L3: Metadata Only]
        
        F[Memory Pressure] --> G[Progressive Eviction]
        G --> H[Compress L1 → L2]
        G --> I[Persist L2 → Disk]
        G --> J[Promote L2 → L3]
        
        K[Memory Monitor] --> L[80% Warning]
        L --> M[90% Emergency]
        M --> N[Force Optimization]
    end
    
    style G fill:#feca57,stroke:#333,stroke-width:2px
```

## 🔒 Data Consistency Architecture

```mermaid
graph LR
    subgraph "Consistency Guarantees"
        A[Snapshot Creation] --> B[Atomic Operations]
        B --> C[ACID Properties]
        
        D[Cross-Layer Sync] --> E[Event Ordering]
        E --> F[Causal Consistency]
        
        G[Concurrent Access] --> H[Lock-Free Structures]
        H --> I[CAS Operations]
        
        J[Error Recovery] --> K[Compensation Actions]
        K --> L[State Reconstruction]
    end
    
    style C fill:#00b894,stroke:#333,stroke-width:2px
```

## 🚀 Deployment Architecture

```mermaid
graph TB
    subgraph "Deployment Modes"
        A[Standalone Mode] --> B[Single Agent]
        B --> C[Local Storage]
        
        D[Distributed Mode] --> E[Multiple Agents]
        E --> F[Shared Storage]
        F --> G[Cluster Coordination]
        
        H[Cloud Mode] --> I[Managed Service]
        I --> J[Auto Scaling]
        J --> K[High Availability]
    end
    
    subgraph "Storage Backends"
        C --> L[Local Disk]
        F --> M[Distributed FS]
        I --> N[Cloud Storage]
    end
    
    style A fill:#00cec9,stroke:#333,stroke-width:2px
    style D fill:#6c5ce7,stroke:#333,stroke-width:2px
    style H fill:#a29bfe,stroke:#333,stroke-width:2px
```

## 📋 Component Dependency Graph

```mermaid
graph TB
    A[types.ts] --> B[OperationBuffer]
    A --> C[SessionCache]
    A --> D[MilestoneStore]
    A --> E[CompressionEngine]
    
    B --> F[SnapshotManager]
    C --> F
    D --> F
    E --> F
    
    F --> G[EditingToolsIntegration]
    F --> H[SnapshotManagementTools]
    
    I[diff.ts] --> E
    I --> F
    
    J[index.ts] --> F
    J --> G
    J --> H
    
    style F fill:#ff6b6b,stroke:#333,stroke-width:3px
    style A fill:#74b9ff,stroke:#333,stroke-width:2px
```

This architecture provides a comprehensive view of the Enhanced Snapshot System, showing how all components work together to provide powerful versioning, rollback, and experimental programming capabilities for AI coding agents.