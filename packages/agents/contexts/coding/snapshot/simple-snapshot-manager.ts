/**
 * SimpleSnapshotManager - A simplified, file-based snapshot system
 * Focuses on core functionality without the complexity of the old system
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { IRuntime } from '../runtime/interface';
import { reverseDiff, generateUnifiedDiff, mergeDiffs } from '../runtime/diff';

// Enhanced interfaces for ignore rules
export interface IgnoreRules {
  patterns: string[];
  isIgnored: (filePath: string) => boolean;
}

// Enhanced snapshot configuration
export interface SnapshotConfig {
  enableUnknownChangeDetection: boolean;
  unknownChangeStrategy: 'strict' | 'warn' | 'auto-integrate';
  keepAllCheckpoints: boolean;
  maxCheckpointAge: number; // days
  excludeFromChecking: string[]; // additional ignore patterns
}

// New interfaces for unknown change detection
export interface UnknownChangeResult {
  hasUnknownChanges: boolean;
  unknownChanges: UnknownChange[];
  affectedFiles: string[];
  generatedDiff?: string;
}

export interface UnknownChange {
  filePath: string;
  changeType: 'modified' | 'created' | 'deleted';
  expectedHash: string;
  actualHash: string;
  diff?: string;
}

// Checkpoint system interfaces
export interface CheckpointData {
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

// Enhanced validation interfaces
export interface ValidationOptions {
  enableUnknownChangeDetection?: boolean;
  autoHandleUnknownChanges?: boolean;
  strictMode?: boolean;
}

export interface ValidationResult {
  success: boolean;
  error?: string;
  unknownChanges?: UnknownChange[];
  warnings?: string[];
}

// Unknown change handling
export type UnknownChangeStrategy = 'integrate' | 'reject' | 'warn' | 'strict' | 'auto-integrate';

export interface HandleResult {
  success: boolean;
  message?: string;
  compensatingSnapshotId?: string;
  modifiedFiles?: string[];
}

export interface SnapshotData {
  id: string;
  timestamp: string;
  description: string;
  tool: string;
  affectedFiles: string[];
  diff: string;
  reverseDiff?: string;
  previousSnapshotId?: string;
  sequenceNumber: number;
  baseFileHashes: Record<string, string>;
  resultFileHashes: Record<string, string>;
  context: {
    sessionId: string;
    workspacePath: string;
    toolParams?: any;
  };
  metadata: {
    filesSizeBytes: number;
    linesChanged: number;
    executionTimeMs: number;
  };
}

export interface MilestoneData {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  snapshotIds: string[];
  startSequenceNumber: number;
  endSequenceNumber: number;
  previousMilestoneId?: string;
  summary: {
    totalOperations: number;
    affectedFiles: string[];
    linesAdded: number;
    linesRemoved: number;
  };
  combinedDiff: string;
  tags: string[];
}

export interface EditHistoryItem {
  id: string;
  timestamp: string;
  description: string;
  tool: string;
  affectedFiles: string[];
  diff?: string;
  metadata: {
    linesChanged: number;
    executionTimeMs: number;
  };
}

export interface HistoryOptions {
  limit?: number;
  includeDiffs?: boolean;
  since?: string;
  until?: string;
  toolFilter?: string[];
  fileFilter?: string;
}

export interface EditHistory {
  history: EditHistoryItem[];
  pagination: {
    total: number;
    hasMore: boolean;
    nextCursor?: string;
  };
}

export interface ReverseOptions {
  dryRun?: boolean;
  targetSnapshot?: string;
  force?: boolean;
}

export interface ReverseResult {
  success: boolean;
  message?: string;
  reversedDiff?: string;
  affectedFiles?: string[];
  conflicts?: string[];
  newSnapshotId?: string;
}

export interface MilestoneSummary {
  totalOperations: number;
  affectedFiles: string[];
  linesAdded: number;
  linesRemoved: number;
}

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

export class SimpleSnapshotManager {
  private workspacePath: string;
  private snapshotsDir: string;
  private milestonesDir: string;
  private checkpointsDir: string; // New: checkpoint directory
  private snapshotIndexPath: string;
  private milestoneIndexPath: string;
  private checkpointMetadataPath: string; // New: checkpoint metadata
  
  // Enhanced ignore rules support
  private ignoreRules?: IgnoreRules;
  private snapshotIgnorePath: string;
  
  // Enhanced configuration
  private config: SnapshotConfig;
  
  // State continuity tracking
  private currentSequenceNumber: number = 0;
  private lastSnapshotId?: string;
  private currentFileHashes: Record<string, string> = {};
  private isInitialized: boolean = false;
  
  // Memory cache - reduce IO operations
  private snapshotIndexCache: Map<string, {
    id: string;
    timestamp: string;
    tool: string;
    affectedFiles: string[];
    sequenceNumber: number;
    previousSnapshotId?: string;
  }> = new Map();
  
  private milestoneIndexCache: Map<string, {
    id: string;
    timestamp: string;
    title: string;
    startSequenceNumber: number;
    endSequenceNumber: number;
    previousMilestoneId?: string;
  }> = new Map();
  
  // Sorted snapshot ID arrays for quick lookup
  private snapshotIdsByTime: string[] = [];
  private snapshotIdsBySequence: string[] = [];
  private milestoneIdsByTime: string[] = [];
  
  // Cache loading status
  private cacheLoaded: boolean = false;
  
  // New: Latest checkpoint data cache
  private latestCheckpoint?: CheckpointData;
  
  constructor(workspacePath: string, config?: Partial<SnapshotConfig>) {
    this.workspacePath = workspacePath;
    this.snapshotsDir = path.join(workspacePath, '.continue-reasoning', 'snapshots');
    this.milestonesDir = path.join(workspacePath, '.continue-reasoning', 'milestones');
    this.checkpointsDir = path.join(workspacePath, '.continue-reasoning', 'checkpoints'); // New
    this.snapshotIndexPath = path.join(this.snapshotsDir, 'index.json');
    this.milestoneIndexPath = path.join(this.milestonesDir, 'index.json');
    this.checkpointMetadataPath = path.join(this.checkpointsDir, 'checkpoint-metadata.json'); // New
    this.snapshotIgnorePath = path.join(workspacePath, '.snapshotignore');
    
    // Initialize configuration
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load ignore rules
   */
  private async loadIgnoreRules(): Promise<void> {
    try {
      const ignoreContent = await fs.readFile(this.snapshotIgnorePath, 'utf-8');
      const patterns = ignoreContent
        .split('\n')
        .map(line => {
          // Handle inline comments: split on # symbol, keep only the part before comment
          const commentIndex = line.indexOf('#');
          const cleanLine = commentIndex >= 0 ? line.substring(0, commentIndex) : line;
          return cleanLine.trim();
        })
        .filter(line => line); // Filter out empty lines

      this.ignoreRules = {
        patterns,
        isIgnored: (filePath: string) => this.isFileIgnored(filePath, patterns)
      };
    } catch (error) {
      // Ignore file doesn't exist or failed to read, use default rules
      this.ignoreRules = {
        patterns: this.getDefaultIgnorePatterns(),
        isIgnored: (filePath: string) => this.isFileIgnored(filePath, this.getDefaultIgnorePatterns())
      };
    }
  }

  /**
   * New: Load latest checkpoint data
   */
  private async loadLatestCheckpoint(): Promise<void> {
    try {
      const metadataContent = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      if (metadata.latestCheckpointId) {
        const checkpoint = await this.loadFileCheckpoint(metadata.latestCheckpointId);
        this.latestCheckpoint = checkpoint || undefined;
      }
    } catch (error) {
      console.warn('Failed to load latest checkpoint:', error);
      this.latestCheckpoint = undefined;
    }
  }

  /**
   * Get default ignore rules
   */
  private getDefaultIgnorePatterns(): string[] {
    // Combine default patterns with configuration exclusions
    const defaultPatterns = [
      // Snapshot system's own files
      '.continue-reasoning/**',
      '.snapshotignore',  // Ignore .snapshotignore file itself
      
      // Common temporary files and logs
      '*.log',
      '*.tmp',
      '.DS_Store',
      'Thumbs.db',
      
      // Build artifacts
      'node_modules/**',
      'dist/**',
      'build/**',
      '__pycache__/**',
      '*.pyc',
      '*.pyo',
      
      // IDE and editor files
      '.vscode/**',
      '.idea/**',
      '*.swp',
      '*.swo',
      '*~',
      
      // Runtime generated data files (key to solving current issues)
      '*.json',  // Can be adjusted to more specific rules like '*_output.json', '*_result.json' etc.
      '*.csv',
      '*.xlsx',
      
      // Cache files
      '.cache/**',
      '*.cache',
      
      // Version control
      '.git/**',
      '.svn/**'
    ];
    
    return [...defaultPatterns, ...this.config.excludeFromChecking];
  }

  /**
   * 🆕 检查文件是否应该被忽略
   */
  private isFileIgnored(filePath: string, patterns: string[]): boolean {
    // 将绝对路径转换为相对于工作区的路径
    const relativePath = path.isAbsolute(filePath) 
      ? path.relative(this.workspacePath, filePath)
      : filePath;
    
    // 标准化路径分隔符
    const normalizedPath = relativePath.replace(/\\/g, '/');
    
    for (const pattern of patterns) {
      if (this.matchPattern(normalizedPath, pattern)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 🆕 模式匹配（简化版的glob匹配）
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // 🔧 修复：先处理 ** 再处理单个 *，避免替换顺序问题
    let regexPattern = pattern
      .replace(/\./g, '\\.')     // 转义点号
      .replace(/\*\*/g, '###DOUBLESTAR###')  // 先临时替换 **
      .replace(/\*/g, '[^/]*')   // 处理单个 *
      .replace(/###DOUBLESTAR###/g, '.*')    // 然后将 ** 替换为 .*
      .replace(/\?/g, '[^/]');   // ? 匹配单个字符
    
    // 如果模式以 / 结尾，表示匹配目录
    if (pattern.endsWith('/')) {
      regexPattern += '.*';
    }
    
    // 对于包含路径分隔符的模式，需要正确处理
    if (pattern.includes('/')) {
      // 如果模式以 / 开始，表示从根目录匹配
      if (pattern.startsWith('/')) {
        regexPattern = '^' + regexPattern.substring(1) + '$';
      } else {
        // 否则从开头匹配
        regexPattern = '^' + regexPattern + '$';
      }
    } else {
      // 对于不包含路径分隔符的模式，可以匹配文件名
      regexPattern = '(^|/)' + regexPattern + '($|/)';  
    }
    
    const regex = new RegExp(regexPattern);
    return regex.test(filePath);
  }

  /**
   * 🆕 过滤掉被忽略的文件
   */
  public filterIgnoredFiles(filePaths: string[]): string[] {
    if (!this.ignoreRules) {
      return filePaths;
    }
    
    return filePaths.filter(filePath => !this.ignoreRules!.isIgnored(filePath));
  }

  /**
   * Initialize the snapshot directory structure and load current state
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.snapshotsDir, { recursive: true });
    await fs.mkdir(this.milestonesDir, { recursive: true });
    await fs.mkdir(this.checkpointsDir, { recursive: true }); // New: create checkpoint directory
    await fs.mkdir(path.join(this.checkpointsDir, 'latest'), { recursive: true }); // New: create latest checkpoint dir
    
    // Create snapshot index if it doesn't exist
    try {
      await fs.access(this.snapshotIndexPath);
    } catch {
      await fs.writeFile(this.snapshotIndexPath, JSON.stringify({ snapshots: [] }, null, 2));
    }
    
    // Create milestone index if it doesn't exist
    try {
      await fs.access(this.milestoneIndexPath);
    } catch {
      await fs.writeFile(this.milestoneIndexPath, JSON.stringify({ milestones: [] }, null, 2));
    }
    
    // New: Create checkpoint metadata if it doesn't exist
    try {
      await fs.access(this.checkpointMetadataPath);
    } catch {
      await fs.writeFile(this.checkpointMetadataPath, JSON.stringify({ 
        checkpoints: [],
        latestCheckpointId: null 
      }, null, 2));
    }
    
    // Load ignore rules
    await this.loadIgnoreRules();
    
    // Load cache
    await this.loadCache();
    
    // Load current state
    await this.loadCurrentState();
    
    // New: Load latest checkpoint
    await this.loadLatestCheckpoint();
    
    this.isInitialized = true;
  }

  /**
   * 🆕 加载索引缓存到内存
   */
  private async loadCache(): Promise<void> {
    if (this.cacheLoaded) {
      return;
    }

    try {
      // 加载快照索引缓存
      const snapshotIndexContent = await fs.readFile(this.snapshotIndexPath, 'utf-8');
      const snapshotIndex = JSON.parse(snapshotIndexContent);
      
      this.snapshotIndexCache.clear();
      this.snapshotIdsByTime = [];
      this.snapshotIdsBySequence = [];
      
      for (const snapshot of snapshotIndex.snapshots || []) {
        this.snapshotIndexCache.set(snapshot.id, snapshot);
        this.snapshotIdsByTime.push(snapshot.id);
      }
      
      // 按时间戳排序
      this.snapshotIdsByTime.sort((a, b) => {
        const snapshotA = this.snapshotIndexCache.get(a)!;
        const snapshotB = this.snapshotIndexCache.get(b)!;
        return new Date(snapshotA.timestamp).getTime() - new Date(snapshotB.timestamp).getTime();
      });
      
      // 按序列号排序
      this.snapshotIdsBySequence = [...this.snapshotIdsByTime].sort((a, b) => {
        const snapshotA = this.snapshotIndexCache.get(a)!;
        const snapshotB = this.snapshotIndexCache.get(b)!;
        return snapshotA.sequenceNumber - snapshotB.sequenceNumber;
      });

      // 加载里程碑索引缓存
      const milestoneIndexContent = await fs.readFile(this.milestoneIndexPath, 'utf-8');
      const milestoneIndex = JSON.parse(milestoneIndexContent);
      
      this.milestoneIndexCache.clear();
      this.milestoneIdsByTime = [];
      
      for (const milestone of milestoneIndex.milestones || []) {
        this.milestoneIndexCache.set(milestone.id, milestone);
        this.milestoneIdsByTime.push(milestone.id);
      }
      
      // 按时间戳排序
      this.milestoneIdsByTime.sort((a, b) => {
        const milestoneA = this.milestoneIndexCache.get(a)!;
        const milestoneB = this.milestoneIndexCache.get(b)!;
        return new Date(milestoneA.timestamp).getTime() - new Date(milestoneB.timestamp).getTime();
      });

      this.cacheLoaded = true;
    } catch (error) {
      console.warn('Failed to load cache:', error);
      // 如果加载失败，初始化空缓存
      this.snapshotIndexCache.clear();
      this.milestoneIndexCache.clear();
      this.snapshotIdsByTime = [];
      this.snapshotIdsBySequence = [];
      this.milestoneIdsByTime = [];
      this.cacheLoaded = true;
    }
  }

  /**
   * 🆕 更新内存缓存并持久化到磁盘
   */
  private async updateCache(type: 'snapshot' | 'milestone', item: any): Promise<void> {
    if (type === 'snapshot') {
      // 更新快照缓存
      this.snapshotIndexCache.set(item.id, item);
      
      // 更新排序数组
      this.snapshotIdsByTime.push(item.id);
      this.snapshotIdsByTime.sort((a, b) => {
        const snapshotA = this.snapshotIndexCache.get(a)!;
        const snapshotB = this.snapshotIndexCache.get(b)!;
        return new Date(snapshotA.timestamp).getTime() - new Date(snapshotB.timestamp).getTime();
      });
      
      this.snapshotIdsBySequence.push(item.id);
      this.snapshotIdsBySequence.sort((a, b) => {
        const snapshotA = this.snapshotIndexCache.get(a)!;
        const snapshotB = this.snapshotIndexCache.get(b)!;
        return snapshotA.sequenceNumber - snapshotB.sequenceNumber;
      });
      
      // 持久化到磁盘
      const snapshotArray = Array.from(this.snapshotIndexCache.values());
      await fs.writeFile(this.snapshotIndexPath, JSON.stringify({ snapshots: snapshotArray }, null, 2));
    } else {
      // 更新里程碑缓存
      this.milestoneIndexCache.set(item.id, item);
      
      // 更新排序数组
      this.milestoneIdsByTime.push(item.id);
      this.milestoneIdsByTime.sort((a, b) => {
        const milestoneA = this.milestoneIndexCache.get(a)!;
        const milestoneB = this.milestoneIndexCache.get(b)!;
        return new Date(milestoneA.timestamp).getTime() - new Date(milestoneB.timestamp).getTime();
      });
      
      // 持久化到磁盘
      const milestoneArray = Array.from(this.milestoneIndexCache.values());
      await fs.writeFile(this.milestoneIndexPath, JSON.stringify({ milestones: milestoneArray }, null, 2));
    }
  }

  /**
   * 加载当前状态（最新的快照信息）
   */
  private async loadCurrentState(): Promise<void> {
    try {
      // 🆕 使用缓存而不是直接读取文件
      if (this.snapshotIdsByTime.length > 0) {
        // 获取最新的快照ID（按时间戳排序的最后一个）
        const latestSnapshotId = this.snapshotIdsByTime[this.snapshotIdsByTime.length - 1];
        const latestSnapshotRef = this.snapshotIndexCache.get(latestSnapshotId);
        
        if (latestSnapshotRef) {
          const latestSnapshot = await this.loadSnapshot(latestSnapshotRef.id);
          
          if (latestSnapshot) {
            this.currentSequenceNumber = latestSnapshot.sequenceNumber;
            this.lastSnapshotId = latestSnapshot.id;
            this.currentFileHashes = { ...latestSnapshot.resultFileHashes };
          }
        }
      } else {
        // 如果没有快照，计算当前工作区的文件哈希
        this.currentFileHashes = await this.calculateWorkspaceFileHashes();
      }
    } catch (error) {
      console.warn('Failed to load current state:', error);
      // 如果加载失败，计算当前工作区的文件哈希
      this.currentFileHashes = await this.calculateWorkspaceFileHashes();
    }
  }

  /**
   * 计算工作区文件的哈希值
   */
  private async calculateWorkspaceFileHashes(): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const fileHashes: Record<string, string> = {};
    
    try {
      // 这里简化实现，实际应该遍历工作区的所有相关文件
      // 为了演示，我们只计算一些常见的文件类型
      const commonFiles = [
        'package.json',
        'tsconfig.json',
        'README.md'
      ];
      
      for (const file of commonFiles) {
        const filePath = path.join(this.workspacePath, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
          fileHashes[file] = hash;
        } catch {
          // 文件不存在，跳过
        }
      }
    } catch (error) {
      console.warn('Failed to calculate workspace file hashes:', error);
    }
    
    return fileHashes;
  }

  /**
   * 计算指定文件的哈希值
   */
  private async calculateFileHashes(filePaths: string[]): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const fileHashes: Record<string, string> = {};
    
    // 🆕 应用ignore规则过滤文件
    const filteredFilePaths = this.filterIgnoredFiles(filePaths);
    
    for (const filePath of filteredFilePaths) {
      try {
        const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        fileHashes[filePath] = hash;
      } catch (error) {
        // 文件可能不存在（新创建的文件），使用空字符串的哈希
        const hash = crypto.createHash('sha256').update('').digest('hex').substring(0, 8);
        fileHashes[filePath] = hash;
      }
    }
    
    return fileHashes;
  }

  /**
   * Create a snapshot for an editing operation with continuity validation and unknown change detection
   */
  async createSnapshot(operation: {
    tool: string;
    description: string;
    affectedFiles: string[];
    diff: string;
    context: {
      sessionId: string;
      toolParams?: any;
    };
    metadata: {
      filesSizeBytes: number;
      linesChanged: number;
      executionTimeMs: number;
    };
  }): Promise<string> {
    await this.initialize();
    
    // Enhanced pre-validation with unknown change detection
    if (this.config.enableUnknownChangeDetection) {
      const validationResult = await this.validateFileStateBeforeSnapshot(operation.affectedFiles);
      
      if (!validationResult.success) {
        if (validationResult.unknownChanges && validationResult.unknownChanges.length > 0) {
          // Handle unknown changes based on strategy
          const handleResult = await this.handleUnknownChanges(
            validationResult.unknownChanges, 
            this.config.unknownChangeStrategy
          );
          
          if (!handleResult.success) {
            throw new Error(handleResult.message);
          }
          
          console.warn(`ℹ️  ${handleResult.message}`);
        } else {
          throw new Error(validationResult.error);
        }
      } else if (validationResult.warnings && validationResult.warnings.length > 0) {
        validationResult.warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
      }
    } else {
      // Fallback to basic continuity validation
      const filteredAffectedFiles = this.filterIgnoredFiles(operation.affectedFiles);
      await this.validateStateContinuity(filteredAffectedFiles);
    }
    
    // Filter out ignored files for processing
    const filteredAffectedFiles = this.filterIgnoredFiles(operation.affectedFiles);
    
    const id = this.generateId();
    const timestamp = new Date().toISOString();
    
    // Calculate file hashes before operation (based on current state)
    const baseFileHashes = await this.calculateFileHashes(filteredAffectedFiles);
    
    // Validate base state consistency with current state
    for (const filePath of filteredAffectedFiles) {
      if (this.currentFileHashes[filePath] && 
          baseFileHashes[filePath] !== this.currentFileHashes[filePath]) {
        throw new Error(
          `File state mismatch for ${filePath}. ` +
          `Expected hash: ${this.currentFileHashes[filePath]}, ` +
          `Actual hash: ${baseFileHashes[filePath]}. ` +
          `This indicates the file was modified outside of the snapshot system. ` +
          `Please use the snapshot tools for all file modifications.`
        );
      }
    }
    
    // Generate reverse diff
    let reverseDiffContent = '';
    try {
      const reverseResult = reverseDiff(operation.diff);
      if (reverseResult.success) {
        reverseDiffContent = reverseResult.reversedDiff;
      }
    } catch (error) {
      console.warn('Failed to generate reverse diff:', error);
    }

    // Calculate file hashes after operation (simplified processing)
    const resultFileHashes = await this.calculateResultFileHashes(filteredAffectedFiles, operation.diff);

    const snapshot: SnapshotData = {
      id,
      timestamp,
      description: operation.description,
      tool: operation.tool,
      affectedFiles: operation.affectedFiles, // Keep original file list for records
      diff: operation.diff,
      reverseDiff: reverseDiffContent,
      previousSnapshotId: this.lastSnapshotId,
      sequenceNumber: this.currentSequenceNumber + 1,
      baseFileHashes,
      resultFileHashes,
      context: {
        sessionId: operation.context.sessionId,
        workspacePath: this.workspacePath,
        toolParams: operation.context.toolParams
      },
      metadata: operation.metadata
    };

    // Save snapshot file
    const snapshotPath = this.getSnapshotPath(timestamp, id);
    await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Update index
    await this.updateCache('snapshot', { 
      id, 
      timestamp, 
      tool: operation.tool, 
      affectedFiles: operation.affectedFiles,
      sequenceNumber: snapshot.sequenceNumber,
      previousSnapshotId: this.lastSnapshotId
    });

    // Update memory state (only update files that aren't ignored)
    this.currentSequenceNumber = snapshot.sequenceNumber;
    this.lastSnapshotId = id;
    this.currentFileHashes = { ...this.currentFileHashes, ...resultFileHashes };

    // New: Create file checkpoint after successful snapshot
    try {
      await this.createFileCheckpoint(id, filteredAffectedFiles);
    } catch (error) {
      console.warn('Failed to create file checkpoint:', error);
      // Continue despite checkpoint failure
    }

    return id;
  }

  /**
   * 验证状态连续性
   */
  private async validateStateContinuity(affectedFiles: string[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('SimpleSnapshotManager not initialized. Call initialize() first.');
    }

    // 🆕 只检查未被忽略的文件的状态连续性
    const filesToCheck = this.filterIgnoredFiles(affectedFiles);
    const currentHashes = await this.calculateFileHashes(filesToCheck);
    
    for (const filePath of filesToCheck) {
      const expectedHash = this.currentFileHashes[filePath];
      const actualHash = currentHashes[filePath];
      
      if (expectedHash && expectedHash !== actualHash) {
        throw new Error(
          `State continuity violation detected for file: ${filePath}\n` +
          `Expected file hash: ${expectedHash}\n` +
          `Actual file hash: ${actualHash}\n` +
          `This indicates the file was modified outside of the snapshot system.\n` +
          `All file modifications must go through the snapshot tools to maintain consistency.`
        );
      }
    }
  }

  /**
   * 计算应用diff后的文件哈希（简化实现）
   */
  private async calculateResultFileHashes(filePaths: string[], diff: string): Promise<Record<string, string>> {
    // 这是一个简化的实现
    // 实际应该解析diff并模拟应用后的文件状态
    // 这里我们假设文件已经被修改，重新计算哈希
    
    // 等待一小段时间，确保文件系统操作完成
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return await this.calculateFileHashes(filePaths);
  }

  /**
   * Read a snapshot's diff content (stored as Git format)
   */
  async readSnapshotDiff(snapshotId: string): Promise<{
    success: boolean;
    diff?: string;
    snapshot?: {
      id: string;
      timestamp: string;
      description: string;
      tool: string;
      affectedFiles: string[];
    };
  }> {
    try {
      const snapshot = await this.loadSnapshot(snapshotId);
      if (!snapshot) {
        return { success: false };
      }

      // 直接返回存储的 diff（已经是 Git 格式）
      return {
        success: true,
        diff: snapshot.diff,
        snapshot: {
          id: snapshot.id,
          timestamp: snapshot.timestamp,
          description: snapshot.description,
          tool: snapshot.tool,
          affectedFiles: snapshot.affectedFiles
        }
      };
    } catch (error) {
      console.error('Error reading snapshot diff:', error);
      return { success: false };
    }
  }

  /**
   * Get editing history with optional filters
   */
  async getEditHistory(options: HistoryOptions = {}): Promise<EditHistory> {
    try {
      // 🆕 使用缓存而不是直接读取文件
      let snapshotRefs = Array.from(this.snapshotIndexCache.values());

      // Apply filters
      if (options.since) {
        const sinceDate = new Date(options.since);
        snapshotRefs = snapshotRefs.filter(s => new Date(s.timestamp) >= sinceDate);
      }

      if (options.until) {
        const untilDate = new Date(options.until);
        snapshotRefs = snapshotRefs.filter(s => new Date(s.timestamp) <= untilDate);
      }

      if (options.toolFilter) {
        snapshotRefs = snapshotRefs.filter(s => options.toolFilter!.includes(s.tool));
      }

      if (options.fileFilter) {
        const pattern = options.fileFilter;
        snapshotRefs = snapshotRefs.filter(s => 
          s.affectedFiles.some((file: string) => file.includes(pattern))
        );
      }

      // Sort by timestamp (newest first)
      snapshotRefs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply limit
      const limit = options.limit || 20;
      const hasMore = snapshotRefs.length > limit;
      const limitedSnapshots = snapshotRefs.slice(0, limit);

      // Load full snapshot data if diffs are requested
      const history: EditHistoryItem[] = [];
      for (const snapshotRef of limitedSnapshots) {
        try {
          const snapshot = await this.loadSnapshot(snapshotRef.id);
          if (snapshot) {
            history.push({
              id: snapshot.id,
              timestamp: snapshot.timestamp,
              description: snapshot.description,
              tool: snapshot.tool,
              affectedFiles: snapshot.affectedFiles,
              diff: options.includeDiffs ? snapshot.diff : undefined,
              metadata: {
                linesChanged: snapshot.metadata.linesChanged,
                executionTimeMs: snapshot.metadata.executionTimeMs
              }
            });
          }
        } catch (error) {
          console.warn(`Failed to load snapshot ${snapshotRef.id}:`, error);
        }
      }

      return {
        history,
        pagination: {
          total: snapshotRefs.length,
          hasMore,
          nextCursor: hasMore ? limitedSnapshots[limitedSnapshots.length - 1].id : undefined
        }
      };
    } catch (error) {
      console.error('Error getting edit history:', error);
      return {
        history: [],
        pagination: { total: 0, hasMore: false }
      };
    }
  }

  /**
   * Reverse an operation (rollback)
   */
  async reverseOp(snapshotId: string, options: ReverseOptions = {}, runtime: IRuntime): Promise<ReverseResult> {
    try {
      const snapshot = await this.loadSnapshot(snapshotId);
      if (!snapshot) {
        return {
          success: false,
          message: `Snapshot ${snapshotId} not found`
        };
      }

      if (!snapshot.reverseDiff) {
        return {
          success: false,
          message: `No reverse diff available for snapshot ${snapshotId}`
        };
      }

      // Check for conflicts if not forcing
      if (!options.force) {
        // TODO: Implement conflict detection
        // For now, just proceed
      }

      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would reverse operation affecting ${snapshot.affectedFiles.length} file(s)`,
          reversedDiff: snapshot.reverseDiff,
          affectedFiles: snapshot.affectedFiles
        };
      }

      // Apply the reverse diff
      const applyResult = await runtime.applyUnifiedDiff(snapshot.reverseDiff, {
        baseDir: this.workspacePath
      });

      if (!applyResult.success) {
        return {
          success: false,
          message: `Failed to apply reverse diff: ${applyResult.message}`,
          reversedDiff: snapshot.reverseDiff
        };
      }

      // Create a new snapshot for the reversal operation
      const reversalSnapshotId = await this.createSnapshot({
        tool: 'ReverseOp',
        description: `Reverse operation: ${snapshot.description}`,
        affectedFiles: snapshot.affectedFiles,
        diff: snapshot.reverseDiff,
        context: {
          sessionId: snapshot.context.sessionId,
          toolParams: { originalSnapshotId: snapshotId }
        },
        metadata: {
          filesSizeBytes: 0, // TODO: Calculate
          linesChanged: snapshot.metadata.linesChanged,
          executionTimeMs: 0 // Placeholder
        }
      });

      return {
        success: true,
        message: `Successfully reversed operation affecting ${applyResult.changesApplied} file(s)`,
        reversedDiff: snapshot.reverseDiff,
        affectedFiles: snapshot.affectedFiles,
        newSnapshotId: reversalSnapshotId
      };
    } catch (error) {
      console.error('Error reversing operation:', error);
      return {
        success: false,
        message: `Failed to reverse operation: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Create a milestone from multiple snapshots with continuity validation
   */
  async createMilestone(params: {
    title: string;
    description: string;
    snapshotIds: string[];
    tags?: string[];
  }): Promise<{ success: boolean; milestoneId?: string; summary?: MilestoneSummary }> {
    try {
      const milestoneId = this.generateId();
      const timestamp = new Date().toISOString();

      // Load all snapshots
      const snapshots: SnapshotData[] = [];
      for (const snapshotId of params.snapshotIds) {
        const snapshot = await this.loadSnapshot(snapshotId);
        if (snapshot) {
          snapshots.push(snapshot);
        }
      }

      if (snapshots.length === 0) {
        return { success: false };
      }

      // 验证快照连续性
      await this.validateSnapshotContinuity(snapshots);

      // Sort snapshots by sequence number to ensure proper order
      snapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);

      // 🆕 验证与上一个里程碑的连续性
      await this.validateMilestoneContinuity(snapshots[0]);

      // 获取上一个里程碑ID（如果存在）
      const previousMilestoneId = await this.getLastMilestoneId();

      // Calculate summary
      const allAffectedFiles = new Set<string>();
      let totalLinesAdded = 0;
      let totalLinesRemoved = 0;

      for (const snapshot of snapshots) {
        snapshot.affectedFiles.forEach(file => allAffectedFiles.add(file));
        
        // Simple heuristic: count + and - lines in diff
        const lines = snapshot.diff.split('\n');
        const addedLines = lines.filter(line => line.startsWith('+')).length;
        const removedLines = lines.filter(line => line.startsWith('-')).length;
        
        totalLinesAdded += addedLines;
        totalLinesRemoved += removedLines;
      }

      // 🆕 使用 diff.ts 的专业 mergeDiffs 功能
      const mergeResult = mergeDiffs(snapshots.map(s => s.diff), {
        preserveGitHeaders: true,
        conflictResolution: 'concatenate'
      });

      if (!mergeResult.success) {
        console.warn('Diff merge had conflicts, but proceeding with concatenate resolution:', mergeResult.conflicts);
      }

      const combinedDiff = mergeResult.mergedDiff;

      const summary: MilestoneSummary = {
        totalOperations: snapshots.length,
        affectedFiles: Array.from(allAffectedFiles),
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved
      };

      const milestone: MilestoneData = {
        id: milestoneId,
        timestamp,
        title: params.title,
        description: params.description,
        snapshotIds: params.snapshotIds,
        startSequenceNumber: snapshots[0].sequenceNumber,
        endSequenceNumber: snapshots[snapshots.length - 1].sequenceNumber,
        previousMilestoneId,
        summary,
        combinedDiff,
        tags: params.tags || []
      };

      // Save milestone
      const milestonePath = path.join(this.milestonesDir, `${milestoneId}.json`);
      await fs.writeFile(milestonePath, JSON.stringify(milestone, null, 2));

      // Update index
      await this.updateCache('milestone', { 
        id: milestoneId, 
        timestamp, 
        title: params.title,
        startSequenceNumber: milestone.startSequenceNumber,
        endSequenceNumber: milestone.endSequenceNumber,
        previousMilestoneId
      });

      return { success: true, milestoneId, summary };
    } catch (error) {
      console.error('Error creating milestone:', error);
      return { success: false };
    }
  }

  /**
   * 🆕 便捷的里程碑创建函数 - 自动从上一个里程碑的下一个快照开始到指定结束快照
   */
  async createMilestoneByRange(params: {
    title: string;
    description: string;
    endSnapshotId?: string;   // 如果不指定，使用最新的快照
    tags?: string[];
  }): Promise<{ success: boolean; milestoneId?: string; summary?: MilestoneSummary; snapshotIds?: string[] }> {
    try {
      // 自动确定开始快照ID（总是从上一个里程碑的下一个快照开始）
      const startSnapshotId = await this.getNextSnapshotAfterLastMilestone();
      if (!startSnapshotId) {
        return { 
          success: false, 
          summary: undefined,
          snapshotIds: []
        };
      }

      // 确定结束快照ID
      let endSnapshotId = params.endSnapshotId;
      if (!endSnapshotId) {
        endSnapshotId = this.lastSnapshotId;
        if (!endSnapshotId) {
          return { 
            success: false, 
            summary: undefined,
            snapshotIds: []
          };
        }
      }

      // 获取范围内的所有快照ID
      const snapshotIds = await this.getSnapshotIdsBetween(startSnapshotId, endSnapshotId);
      
      if (snapshotIds.length === 0) {
        return { 
          success: false, 
          summary: undefined,
          snapshotIds: []
        };
      }

      // 使用基础的 createMilestone 函数
      const result = await this.createMilestone({
        title: params.title,
        description: params.description,
        snapshotIds,
        tags: params.tags
      });

      return {
        ...result,
        snapshotIds
      };
    } catch (error) {
      console.error('Error creating milestone by range:', error);
      return { 
        success: false, 
        summary: undefined,
        snapshotIds: []
      };
    }
  }

  /**
   * 🆕 验证里程碑与上一个里程碑的连续性
   */
  private async validateMilestoneContinuity(firstSnapshot: SnapshotData): Promise<void> {
    const lastMilestone = await this.getLastMilestone();
    
    if (lastMilestone) {
      // 检查新里程碑的第一个快照是否紧接着上一个里程碑的最后一个快照
      const expectedSequenceNumber = lastMilestone.endSequenceNumber + 1;
      
      if (firstSnapshot.sequenceNumber !== expectedSequenceNumber) {
        throw new Error(
          `Milestone continuity violation detected:\n` +
          `Last milestone "${lastMilestone.title}" ended at sequence ${lastMilestone.endSequenceNumber}\n` +
          `New milestone starts at sequence ${firstSnapshot.sequenceNumber}\n` +
          `Expected start sequence: ${expectedSequenceNumber}\n` +
          `There appears to be a gap or overlap in milestone coverage.`
        );
      }

      // 验证快照的父子关系
      const lastSnapshotOfPreviousMilestone = await this.loadSnapshot(
        lastMilestone.snapshotIds[lastMilestone.snapshotIds.length - 1]
      );
      
      if (lastSnapshotOfPreviousMilestone && 
          firstSnapshot.previousSnapshotId !== lastSnapshotOfPreviousMilestone.id) {
        throw new Error(
          `Milestone snapshot chain broken:\n` +
          `Last snapshot of previous milestone: ${lastSnapshotOfPreviousMilestone.id}\n` +
          `First snapshot of new milestone claims parent: ${firstSnapshot.previousSnapshotId}\n` +
          `Expected parent: ${lastSnapshotOfPreviousMilestone.id}`
        );
      }
    }
  }

  /**
   * 🆕 获取上一个里程碑的下一个快照ID
   */
  private async getNextSnapshotAfterLastMilestone(): Promise<string | undefined> {
    const lastMilestone = await this.getLastMilestone();
    
    if (!lastMilestone) {
      // 如果没有里程碑，从第一个快照开始
      if (this.snapshotIdsByTime.length > 0) {
        return this.snapshotIdsByTime[0];
      }
      return undefined;
    }

    // 🆕 使用缓存查找下一个快照
    const candidateSnapshots = Array.from(this.snapshotIndexCache.values())
      .filter(s => s.sequenceNumber > lastMilestone.endSequenceNumber);

    if (candidateSnapshots.length === 0) {
      return undefined;
    }

    // 返回序列号最小的快照（即紧接着的下一个）
    const nextSnapshot = candidateSnapshots.reduce((min, current) => 
      current.sequenceNumber < min.sequenceNumber ? current : min
    );

    return nextSnapshot.id;
  }

  /**
   * 🆕 获取两个快照之间的所有快照ID（包含边界）
   */
  private async getSnapshotIdsBetween(startSnapshotId: string, endSnapshotId: string): Promise<string[]> {
    // 🆕 使用缓存而不是直接读取文件
    const startSnapshot = this.snapshotIndexCache.get(startSnapshotId);
    const endSnapshot = this.snapshotIndexCache.get(endSnapshotId);

    if (!startSnapshot || !endSnapshot) {
      // 如果缓存中没有，尝试从磁盘加载
      const startSnapshotData = await this.loadSnapshot(startSnapshotId);
      const endSnapshotData = await this.loadSnapshot(endSnapshotId);
      
      if (!startSnapshotData || !endSnapshotData) {
        throw new Error(`Invalid snapshot IDs: start=${startSnapshotId}, end=${endSnapshotId}`);
      }
      
      if (startSnapshotData.sequenceNumber > endSnapshotData.sequenceNumber) {
        throw new Error(
          `Invalid range: start sequence ${startSnapshotData.sequenceNumber} > end sequence ${endSnapshotData.sequenceNumber}`
        );
      }
      
      // 使用磁盘数据进行范围查找（较慢的回退方案）
      const rangeSnapshots = Array.from(this.snapshotIndexCache.values())
        .filter(s => 
          s.sequenceNumber >= startSnapshotData.sequenceNumber && 
          s.sequenceNumber <= endSnapshotData.sequenceNumber
        );
      
      rangeSnapshots.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
      return rangeSnapshots.map(s => s.id);
    }

    if (startSnapshot.sequenceNumber > endSnapshot.sequenceNumber) {
      throw new Error(
        `Invalid range: start sequence ${startSnapshot.sequenceNumber} > end sequence ${endSnapshot.sequenceNumber}`
      );
    }

    // 🆕 使用预排序的数组进行快速范围查找
    const rangeSnapshots = this.snapshotIdsBySequence
      .map(id => this.snapshotIndexCache.get(id)!)
      .filter(s => 
        s.sequenceNumber >= startSnapshot.sequenceNumber && 
        s.sequenceNumber <= endSnapshot.sequenceNumber
      );

    // 验证连续性
    for (let i = 1; i < rangeSnapshots.length; i++) {
      if (rangeSnapshots[i].sequenceNumber !== rangeSnapshots[i-1].sequenceNumber + 1) {
        throw new Error(
          `Gap detected in snapshot range: sequence ${rangeSnapshots[i-1].sequenceNumber} ` +
          `followed by ${rangeSnapshots[i].sequenceNumber}`
        );
      }
    }

    return rangeSnapshots.map(s => s.id);
  }

  /**
   * 🆕 获取最后一个里程碑的完整数据
   */
  private async getLastMilestone(): Promise<MilestoneData | undefined> {
    try {
      // 🆕 使用缓存快速获取最新里程碑
      if (this.milestoneIdsByTime.length === 0) {
        return undefined;
      }
      
      const lastMilestoneId = this.milestoneIdsByTime[this.milestoneIdsByTime.length - 1];
      const milestone = await this.loadMilestone(lastMilestoneId);
      return milestone || undefined;
    } catch (error) {
      console.warn('Failed to get last milestone:', error);
      return undefined;
    }
  }

  /**
   * Get milestones list
   */
  async getMilestones(includeDiffs: boolean = false, tags?: string[]): Promise<{
    success: boolean;
    milestones: Array<{
      id: string;
      title: string;
      description: string;
      timestamp: string;
      summary: MilestoneSummary;
      combinedDiff?: string;
      tags: string[];
    }>;
  }> {
    try {
      // 🆕 使用缓存而不是直接读取文件
      let milestoneRefs = Array.from(this.milestoneIndexCache.values());

      // Apply tag filter
      if (tags && tags.length > 0) {
        const milestones: MilestoneData[] = [];
        for (const ref of milestoneRefs) {
          const milestone = await this.loadMilestone(ref.id);
          if (milestone && milestone.tags.some(tag => tags.includes(tag))) {
            milestones.push(milestone);
          }
        }
        milestoneRefs = milestones.map(m => ({ 
          id: m.id, 
          timestamp: m.timestamp, 
          title: m.title,
          startSequenceNumber: m.startSequenceNumber,
          endSequenceNumber: m.endSequenceNumber,
          previousMilestoneId: m.previousMilestoneId
        }));
      }

      // Load full milestone data
      const milestones = [];
      for (const ref of milestoneRefs) {
        try {
          const milestone = await this.loadMilestone(ref.id);
          if (milestone) {
            milestones.push({
              id: milestone.id,
              title: milestone.title,
              description: milestone.description,
              timestamp: milestone.timestamp,
              summary: milestone.summary,
              combinedDiff: includeDiffs ? milestone.combinedDiff : undefined,
              tags: milestone.tags
            });
          }
        } catch (error) {
          console.warn(`Failed to load milestone ${ref.id}:`, error);
        }
      }

      // Sort by timestamp (newest first)
      milestones.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      return { success: true, milestones };
    } catch (error) {
      console.error('Error getting milestones:', error);
      return { success: false, milestones: [] };
    }
  }

  /**
   * Get a single milestone by ID
   */
  async getMilestone(milestoneId: string): Promise<MilestoneData | null> {
    return await this.loadMilestone(milestoneId);
  }

  /**
   * Clean up old snapshots
   */
  async cleanup(olderThan?: Date): Promise<void> {
    try {
      const cutoffDate = olderThan || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      // 🆕 使用缓存而不是直接读取文件
      const snapshotsToRemove = Array.from(this.snapshotIndexCache.values())
        .filter(s => new Date(s.timestamp) < cutoffDate);
      
      for (const snapshotRef of snapshotsToRemove) {
        try {
          const snapshotPath = this.getSnapshotPath(snapshotRef.timestamp, snapshotRef.id);
          await fs.unlink(snapshotPath);
          
          // 从缓存中移除
          this.snapshotIndexCache.delete(snapshotRef.id);
          this.snapshotIdsByTime = this.snapshotIdsByTime.filter(id => id !== snapshotRef.id);
          this.snapshotIdsBySequence = this.snapshotIdsBySequence.filter(id => id !== snapshotRef.id);
        } catch (error) {
          console.warn(`Failed to delete snapshot ${snapshotRef.id}:`, error);
        }
      }

      // 更新索引文件
      const remainingSnapshots = Array.from(this.snapshotIndexCache.values());
      await fs.writeFile(this.snapshotIndexPath, JSON.stringify({ snapshots: remainingSnapshots }, null, 2));
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(olderThan?: Date): Promise<void> {
    try {
      const cutoffDate = olderThan || new Date(Date.now() - this.config.maxCheckpointAge * 24 * 60 * 60 * 1000);
      
      // Load checkpoint metadata
      const metadataContent = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
      const metadata = JSON.parse(metadataContent);
      
      const checkpointsToRemove = metadata.checkpoints.filter((cp: any) => 
        new Date(cp.timestamp) < cutoffDate
      );
      
      for (const checkpoint of checkpointsToRemove) {
        try {
          const checkpointPath = path.join(this.checkpointsDir, `${checkpoint.id}.json`);
          await fs.unlink(checkpointPath);
        } catch (error) {
          console.warn(`Failed to delete checkpoint ${checkpoint.id}:`, error);
        }
      }
      
      // Update metadata
      metadata.checkpoints = metadata.checkpoints.filter((cp: any) => 
        new Date(cp.timestamp) >= cutoffDate
      );
      
      await fs.writeFile(this.checkpointMetadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Cleaned up ${checkpointsToRemove.length} old checkpoints`);
    } catch (error) {
      console.error('Error during checkpoint cleanup:', error);
    }
  }

  /**
   * Get enhanced cache statistics for performance monitoring
   */
  getCacheStats(): {
    cacheLoaded: boolean;
    snapshotCount: number;
    milestoneCount: number;
    checkpointInfo: {
      hasLatestCheckpoint: boolean;
      latestCheckpointFiles: number;
      latestCheckpointSize: number;
    };
    memoryUsage: {
      totalArraySize: number;
      snapshotCacheSize: number;
      milestoneCacheSize: number;
    };
    config: SnapshotConfig;
  } {
    return {
      cacheLoaded: this.cacheLoaded,
      snapshotCount: this.snapshotIndexCache.size,
      milestoneCount: this.milestoneIndexCache.size,
      checkpointInfo: {
        hasLatestCheckpoint: !!this.latestCheckpoint,
        latestCheckpointFiles: this.latestCheckpoint?.metadata.totalFiles || 0,
        latestCheckpointSize: this.latestCheckpoint?.metadata.totalSizeBytes || 0
      },
      memoryUsage: {
        totalArraySize: this.snapshotIdsByTime.length + this.snapshotIdsBySequence.length + this.milestoneIdsByTime.length,
        snapshotCacheSize: this.snapshotIndexCache.size,
        milestoneCacheSize: this.milestoneIndexCache.size
      },
      config: this.getConfig()
    };
  }

  /**
   * Get current state information
   */
  getCurrentState(): {
    sequenceNumber: number;
    lastSnapshotId?: string;
    isInitialized: boolean;
    currentFileHashes: Record<string, string>;
  } {
    return {
      sequenceNumber: this.currentSequenceNumber,
      lastSnapshotId: this.lastSnapshotId,
      isInitialized: this.isInitialized,
      currentFileHashes: { ...this.currentFileHashes }
    };
  }

  /**
   * Reset state continuity tracking (for recovery scenarios)
   */
  async resetStateContinuity(): Promise<void> {
    this.currentSequenceNumber = 0;
    this.lastSnapshotId = undefined;
    this.currentFileHashes = {};
    this.isInitialized = false;
    
    // Re-initialize from current workspace state
    await this.loadCurrentState();
    this.isInitialized = true;
  }

  /**
   * Reload cache from disk (for testing and recovery scenarios)
   */
  async reloadCache(): Promise<void> {
    this.cacheLoaded = false;
    this.snapshotIndexCache.clear();
    this.milestoneIndexCache.clear();
    this.snapshotIdsByTime = [];
    this.snapshotIdsBySequence = [];
    this.milestoneIdsByTime = [];
    
    await this.loadCache();
  }

  /**
   * Clear all cached data (for testing scenarios)
   */
  clearCache(): void {
    this.snapshotIndexCache.clear();
    this.milestoneIndexCache.clear();
    this.snapshotIdsByTime = [];
    this.snapshotIdsBySequence = [];
    this.milestoneIdsByTime = [];
    this.cacheLoaded = false;
  }

  // Private helper methods

  private generateId(): string {
    return Math.random().toString(36).substring(2, 8);
  }

  private getSnapshotPath(timestamp: string, id: string): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const time = date.toTimeString().substring(0, 8).replace(/:/g, '');
    
    return path.join(this.snapshotsDir, `${year}`, `${month}`, `${day}`, `${time}_${id}.json`);
  }

  private async findSnapshotPath(id: string): Promise<string | null> {
    // 🆕 使用缓存而不是直接读取文件
    const snapshotRef = this.snapshotIndexCache.get(id);
    if (snapshotRef) {
      return this.getSnapshotPath(snapshotRef.timestamp, id);
    }
    return null;
  }

  private async loadSnapshot(id: string): Promise<SnapshotData | null> {
    try {
      const snapshotPath = await this.findSnapshotPath(id);
      if (!snapshotPath) return null;
      
      const content = await fs.readFile(snapshotPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load snapshot ${id}:`, error);
      return null;
    }
  }

  private async loadMilestone(id: string): Promise<MilestoneData | null> {
    try {
      const milestonePath = path.join(this.milestonesDir, `${id}.json`);
      const content = await fs.readFile(milestonePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load milestone ${id}:`, error);
      return null;
    }
  }

  private async getLastMilestoneId(): Promise<string | undefined> {
    const lastMilestone = await this.getLastMilestone();
    return lastMilestone ? lastMilestone.id : undefined;
  }

  private async validateSnapshotContinuity(snapshots: SnapshotData[]): Promise<void> {
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i].previousSnapshotId !== snapshots[i - 1].id) {
        throw new Error(
          `Snapshot continuity violation detected:\n` +
          `Snapshot ${snapshots[i].id} claims parent ${snapshots[i].previousSnapshotId}\n` +
          `Expected parent: ${snapshots[i - 1].id}`
        );
      }
    }
  }

  /**
   * 🆕 手动创建默认的.snapshotignore文件
   */
  async createDefaultSnapshotIgnore(): Promise<void> {
    const defaultContent = `# .snapshotignore - 配置快照系统需要忽略的文件和目录
# 语法类似于 .gitignore，支持glob模式匹配

# ===== 快照系统自身文件 =====
.continue-reasoning/**
.snapshotignore         # 忽略 .snapshotignore 文件本身

# ===== 临时文件和系统文件 =====
*.log
*.tmp
.DS_Store
Thumbs.db

# ===== 构建产物和依赖 =====
node_modules/**
dist/**
build/**
__pycache__/**
*.pyc
*.pyo

# ===== IDE和编辑器文件 =====
.vscode/**
.idea/**
*.swp
*.swo
*~

# ===== 运行时生成的数据文件 =====
# 这些文件通常由程序运行产生，不应被快照系统跟踪
*.json                  # 可根据需要调整为更具体的规则
*.csv
*.xlsx
*_output.*
*_result.*
*_data.*

# ===== 缓存文件 =====
.cache/**
*.cache

# ===== 版本控制系统 =====
.git/**
.svn/**

# ===== 自定义规则 =====
# 在此处添加项目特定的ignore规则
# 例如：
# my_project_outputs/**
# *.generated
`;

    try {
      await fs.writeFile(this.snapshotIgnorePath, defaultContent, 'utf-8');
      console.log(`📝 Created default .snapshotignore file at: ${this.snapshotIgnorePath}`);
    } catch (error) {
      console.warn(`⚠️  Failed to create .snapshotignore file: ${error}`);
    }
  }

  /**
   * 🆕 获取当前的ignore规则信息
   */
  getIgnoreInfo(): {
    ignoreFilePath: string;
    ignoreFileExists: boolean;
    patterns: string[];
    isLoaded: boolean;
  } {
    return {
      ignoreFilePath: this.snapshotIgnorePath,
      ignoreFileExists: require('fs').existsSync(this.snapshotIgnorePath),
      patterns: this.ignoreRules?.patterns || [],
      isLoaded: !!this.ignoreRules
    };
  }

  /**
   * 🆕 重新加载ignore规则
   */
  async reloadIgnoreRules(): Promise<void> {
    await this.loadIgnoreRules();
    console.log(`📝 Reloaded ignore rules. Active patterns: ${this.ignoreRules?.patterns.length || 0}`);
  }

  /**
   * Configuration management methods
   */
  updateConfig(config: Partial<SnapshotConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SnapshotConfig {
    return { ...this.config };
  }

  // === NEW CHECKPOINT MANAGEMENT METHODS ===

  /**
   * Create file checkpoint after successful snapshot
   */
  async createFileCheckpoint(snapshotId: string, affectedFiles: string[]): Promise<string> {
    const startTime = Date.now();
    const checkpointId = this.generateId();
    
    try {
      // Filter out ignored files
      const filteredFiles = this.filterIgnoredFiles(affectedFiles);
      const filesContent: Record<string, string> = {};
      let totalSizeBytes = 0;
      
      // Read and store file contents
      for (const filePath of filteredFiles) {
        try {
          const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          filesContent[filePath] = content;
          totalSizeBytes += content.length;
          
          // Also store in latest directory for quick access
          const latestFilePath = path.join(this.checkpointsDir, 'latest', path.basename(filePath));
          await fs.mkdir(path.dirname(latestFilePath), { recursive: true });
          await fs.writeFile(latestFilePath, content);
        } catch (error) {
          console.warn(`Failed to read file for checkpoint: ${filePath}`, error);
        }
      }
      
      const checkpoint: CheckpointData = {
        id: checkpointId,
        timestamp: new Date().toISOString(),
        snapshotId,
        files: filesContent,
        metadata: {
          totalFiles: Object.keys(filesContent).length,
          totalSizeBytes,
          creationTimeMs: Date.now() - startTime
        }
      };
      
      // Save checkpoint file
      const checkpointPath = path.join(this.checkpointsDir, `${checkpointId}.json`);
      await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2));
      
      // Update metadata
      await this.updateCheckpointMetadata(checkpointId);
      
      // Update memory cache
      this.latestCheckpoint = checkpoint;
      
      return checkpointId;
    } catch (error) {
      console.error('Failed to create file checkpoint:', error);
      throw new Error(`Failed to create checkpoint: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Load file checkpoint by ID
   */
  async loadFileCheckpoint(checkpointId?: string): Promise<CheckpointData | null> {
    try {
      let targetCheckpointId = checkpointId;
      
      if (!targetCheckpointId) {
        // Load latest checkpoint ID from metadata
        const metadataContent = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent);
        targetCheckpointId = metadata.latestCheckpointId;
      }
      
      if (!targetCheckpointId) {
        return null;
      }
      
      const checkpointPath = path.join(this.checkpointsDir, `${targetCheckpointId}.json`);
      const content = await fs.readFile(checkpointPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Failed to load checkpoint ${checkpointId}:`, error);
      return null;
    }
  }

  /**
   * Update checkpoint metadata
   */
  private async updateCheckpointMetadata(checkpointId: string): Promise<void> {
    try {
      let metadata;
      try {
        const content = await fs.readFile(this.checkpointMetadataPath, 'utf-8');
        metadata = JSON.parse(content);
      } catch {
        metadata = { checkpoints: [], latestCheckpointId: null };
      }
      
      // Add to checkpoint list
      metadata.checkpoints.push({
        id: checkpointId,
        timestamp: new Date().toISOString()
      });
      
      // Update latest
      metadata.latestCheckpointId = checkpointId;
      
      // Keep only recent checkpoints if not keeping all
      if (!this.config.keepAllCheckpoints && metadata.checkpoints.length > 5) {
        metadata.checkpoints = metadata.checkpoints.slice(-5); // Keep last 5
      }
      
      await fs.writeFile(this.checkpointMetadataPath, JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Failed to update checkpoint metadata:', error);
    }
  }

  // === NEW UNKNOWN CHANGE DETECTION METHODS ===

  /**
   * Detect unknown modifications by comparing current file state with last checkpoint
   */
  async detectUnknownModifications(affectedFiles: string[]): Promise<UnknownChangeResult> {
    try {
      if (!this.config.enableUnknownChangeDetection) {
        return {
          hasUnknownChanges: false,
          unknownChanges: [],
          affectedFiles: []
        };
      }

      const filteredFiles = this.filterIgnoredFiles(affectedFiles);
      const unknownChanges: UnknownChange[] = [];
      const currentHashes = await this.calculateFileHashes(filteredFiles);
      
      // Compare with expected state (from last checkpoint or current file hashes)
      const expectedHashes = this.latestCheckpoint ? 
        await this.getHashesFromCheckpoint(this.latestCheckpoint, filteredFiles) :
        this.currentFileHashes;

      for (const filePath of filteredFiles) {
        const expectedHash = expectedHashes[filePath];
        const actualHash = currentHashes[filePath];
        
        if (expectedHash && expectedHash !== actualHash) {
          // Generate diff for the unknown change
          let diff: string | undefined;
          try {
            const expectedContent = this.latestCheckpoint?.files[filePath] || '';
            const actualContent = await this.readFileContent(filePath);
            diff = await generateUnifiedDiff(expectedContent, actualContent, {
              oldPath: `a/${filePath}`,
              newPath: `b/${filePath}`
            });
          } catch (error) {
            console.warn(`Failed to generate diff for ${filePath}:`, error);
          }

          unknownChanges.push({
            filePath,
            changeType: expectedHash === undefined ? 'created' : 'modified',
            expectedHash,
            actualHash,
            diff
          });
        } else if (!expectedHash && actualHash) {
          // New file created
          let diff: string | undefined;
          try {
            const actualContent = await this.readFileContent(filePath);
            diff = await generateUnifiedDiff('', actualContent, {
              oldPath: '/dev/null',
              newPath: `b/${filePath}`
            });
          } catch (error) {
            console.warn(`Failed to generate diff for new file ${filePath}:`, error);
          }

          unknownChanges.push({
            filePath,
            changeType: 'created',
            expectedHash: '',
            actualHash,
            diff
          });
        }
      }

      // Check for deleted files
      for (const [filePath, expectedHash] of Object.entries(expectedHashes)) {
        if (filteredFiles.includes(filePath) && !currentHashes[filePath]) {
          unknownChanges.push({
            filePath,
            changeType: 'deleted',
            expectedHash,
            actualHash: '',
            diff: undefined // Could generate deletion diff if needed
          });
        }
      }

      // Generate combined diff if there are unknown changes
      let generatedDiff: string | undefined;
      if (unknownChanges.length > 0) {
        const diffs = unknownChanges.map(change => change.diff).filter(Boolean) as string[];
        if (diffs.length > 0) {
          const mergeResult = mergeDiffs(diffs, { 
            preserveGitHeaders: true,
            conflictResolution: 'concatenate'
          });
          generatedDiff = mergeResult.success ? mergeResult.mergedDiff : diffs.join('\n');
        }
      }

      return {
        hasUnknownChanges: unknownChanges.length > 0,
        unknownChanges,
        affectedFiles: unknownChanges.map(change => change.filePath),
        generatedDiff
      };
    } catch (error) {
      console.error('Failed to detect unknown modifications:', error);
      return {
        hasUnknownChanges: false,
        unknownChanges: [],
        affectedFiles: [],
        generatedDiff: undefined
      };
    }
  }

  /**
   * Validate file state before snapshot with unknown change detection
   */
  async validateFileStateBeforeSnapshot(
    affectedFiles: string[], 
    options?: ValidationOptions
  ): Promise<ValidationResult> {
    try {
      if (!this.isInitialized) {
        return {
          success: false,
          error: 'SimpleSnapshotManager not initialized. Call initialize() first.'
        };
      }

      const actualOptions = { ...this.config, ...options };

      // Basic continuity validation (existing logic)
      try {
        await this.validateStateContinuity(affectedFiles);
      } catch (error) {
        if (actualOptions.strictMode) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'State continuity validation failed'
          };
        }
      }

      // Unknown change detection
      if (actualOptions.enableUnknownChangeDetection) {
        const unknownChangeResult = await this.detectUnknownModifications(affectedFiles);
        
        if (unknownChangeResult.hasUnknownChanges) {
          const message = `Detected ${unknownChangeResult.unknownChanges.length} unknown changes in files: ${unknownChangeResult.affectedFiles.join(', ')}`;
          
          if (actualOptions.strictMode && this.config.unknownChangeStrategy === 'strict') {
            return {
              success: false,
              error: message,
              unknownChanges: unknownChangeResult.unknownChanges
            };
          } else {
            return {
              success: true,
              unknownChanges: unknownChangeResult.unknownChanges,
              warnings: [message]
            };
          }
        }
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Handle unknown changes based on strategy
   */
  async handleUnknownChanges(
    unknownChanges: UnknownChange[], 
    strategy: UnknownChangeStrategy
  ): Promise<HandleResult> {
    try {
      switch (strategy) {
        case 'strict':
        case 'reject':
          return {
            success: false,
            message: `Rejecting operation due to ${unknownChanges.length} unknown changes. Please use snapshot tools for all modifications.`
          };

        case 'warn':
          console.warn(`⚠️  Detected ${unknownChanges.length} unknown changes:`);
          unknownChanges.forEach(change => {
            console.warn(`  - ${change.changeType}: ${change.filePath}`);
          });
          return {
            success: true,
            message: `Warning: Proceeding with ${unknownChanges.length} unknown changes detected.`
          };

        case 'auto-integrate':
        case 'integrate':
          // Create a compensating snapshot for unknown changes
          const affectedFiles = unknownChanges.map(change => change.filePath);
          const diffs = unknownChanges.map(change => change.diff).filter(Boolean) as string[];
          const combinedDiff = diffs.length > 0 ? diffs.join('\n') : 'Unknown changes detected';
          
          const compensatingSnapshotId = await this.createSnapshot({
            tool: 'UnknownChangeIntegration',
            description: `Compensating snapshot for ${unknownChanges.length} unknown changes`,
            affectedFiles,
            diff: combinedDiff,
            context: {
              sessionId: 'unknown-change-integration',
              toolParams: { unknownChanges: unknownChanges.length }
            },
            metadata: {
              filesSizeBytes: combinedDiff.length,
              linesChanged: unknownChanges.length,
              executionTimeMs: 0
            }
          });

          return {
            success: true,
            message: `Integrated ${unknownChanges.length} unknown changes into compensating snapshot.`,
            compensatingSnapshotId,
            modifiedFiles: affectedFiles
          };

        default:
          return {
            success: false,
            message: `Unknown strategy: ${strategy}`
          };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to handle unknown changes: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // === HELPER METHODS ===

  /**
   * Get file hashes from checkpoint data
   */
  private async getHashesFromCheckpoint(checkpoint: CheckpointData, filePaths: string[]): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const hashes: Record<string, string> = {};
    
    for (const filePath of filePaths) {
      const content = checkpoint.files[filePath];
      if (content !== undefined) {
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        hashes[filePath] = hash;
      }
    }
    
    return hashes;
  }

  /**
   * Read file content safely
   */
  private async readFileContent(filePath: string): Promise<string> {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.workspacePath, filePath);
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error) {
      return ''; // Return empty string if file doesn't exist or can't be read
    }
  }
}
