/**
 * Runtime interfaces for the coding agent
 */

import { ISandbox, ShellExecutionResult, ExecutionOptions } from '../sandbox/index.js';

/**
 * 代码块搜索匹配配置
 */
export interface CodeBlockMatchOptions {
  /** 模糊匹配阈值 (0-1), 1为精确匹配 */
  fuzzyMatchThreshold?: number;
  /** 是否忽略空白差异 */
  ignoreWhitespace?: boolean;
  /** 是否支持代码省略 (...) */
  supportElision?: boolean;
  /** 语言类型，用于语言感知匹配 */
  language?: string;
}

/**
 * 统一的文件编辑结果
 */
export interface FileEditResult {
  /** 编辑是否成功 */
  success: boolean;
  /** 编辑前后的差异 */
  diff?: string;
  /** 成功或错误消息 */
  message?: string;
  /** 应用的更改计数（例如匹配的块数） */
  changesApplied?: number;
  /** 受影响的文件列表 */
  affectedFiles?: string[];
  /** 保存的diff文件路径 */
  savedDiffPath?: string;
  /** 是否为多文件操作 */
  isMultiFile?: boolean;
  /** 多文件操作的详细结果 */
  multiFileResults?: Array<{
    filePath: string;
    success: boolean;
    message?: string;
    changesApplied?: number;
  }>;
}

/**
 * File system operation options
 */
export interface FileSystemOptions {
  encoding?: string;
  recursive?: boolean;
}

/**
 * File status information
 */
export interface FileStatus {
  exists: boolean;
  size: number;
  type: 'file' | 'dir';
  modifiedAt: Date;
}

/**
 * Directory entry 
 */
export interface DirectoryEntry {
  name: string;
  type: 'file' | 'dir';
  path: string;
}

/**
 * Runtime interface for execution environment
 */
export interface IRuntime {
  /**
   * Read a file from the filesystem
   */
  readFile(
    filePath: string,
    options?: { encoding?: BufferEncoding; startLine?: number; endLine?: number }
  ): Promise<string>;
  
  /**
   * Write content to a file
   */
  writeFile(
    filePath: string, 
    content: string,
    options?: { 
      mode?: 'overwrite' | 'append' | 'create_or_overwrite' | 'overwrite_range';
      startLine?: number;
      endLine?: number;
    }
  ): Promise<FileEditResult>;
  
  /**
   * Search and replace a code block (Aider-style)
   */
  applyEditBlock(
    filePath: string,
    searchBlock: string,
    replaceBlock: string,
    options?: CodeBlockMatchOptions
  ): Promise<FileEditResult>;
  
  /**
   * Apply a ranged edit (OpenHands-style)
   */
  applyRangedEdit(
    filePath: string,
    contentToApply: string,
    startLine: number,
    endLine: number,
    options?: { preserveUnchangedMarkers?: boolean }
  ): Promise<FileEditResult>;
  
  /**
   * Apply a unified diff (supports both single and multi-file diffs)
   * The file paths are automatically extracted from the diff content
   */
  applyUnifiedDiff(
    diffContent: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult>;
  
  /**
   * Apply a unified diff from a file
   */
  applyUnifiedDiffFromFile(
    diffFilePath: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult>;
  
  /**
   * Reverse apply a unified diff (undo changes)
   */
  reverseApplyUnifiedDiff(
    diffContent: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult>;
  
  /**
   * Reverse apply a unified diff from a file
   */
  reverseApplyUnifiedDiffFromFile(
    diffFilePath: string,
    options?: { 
      baseDir?: string; 
      saveDiffPath?: string;
      dryRun?: boolean;
    }
  ): Promise<FileEditResult>;
  
  /**
   * Generate a diff between two strings or files
   */
  generateDiff(
    oldContent: string, 
    newContent: string, 
    options?: { oldPath?: string; newPath?: string }
  ): Promise<string>;
  
  /**
   * Compare two files and generate a unified diff
   */
  compareFiles(
    oldFilePath: string,
    newFilePath: string,
    options?: { oldPath?: string; newPath?: string }
  ): Promise<string>;
  
  /**
   * List directory contents
   */
  listDirectory(
    dirPath: string, 
    options?: { recursive?: boolean; maxDepth?: number }
  ): Promise<DirectoryEntry[]>;
  
  /**
   * Get file or directory status
   */
  getFileStatus(filePath: string): Promise<FileStatus>;
  
  /**
   * Delete a file
   */
  deleteFile(filePath: string): Promise<boolean>;
  
  /**
   * Create a directory
   */
  createDirectory(dirPath: string, options?: { recursive?: boolean }): Promise<boolean>;
  
  /**
   * Execute a command in this runtime environment
   * This is a lower-level method, prefer using the file operations methods when possible
   */
  execute(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult>;
  
  /**
   * Execute code (various languages)
   */
  executeCode(
    language: string,
    code: string,
    options?: { timeout?: number; env?: Record<string, string> }
  ): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    resultData?: any;
  }>;
  
  /**
   * The type of runtime for identification and logging
   */
  readonly type: "node" | "docker" | "vm";
  
  /**
   * The sandbox used by this runtime (if any)
   */
  readonly sandbox: ISandbox;
  
  /**
   * Check if this runtime is available on the current system
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Runtime mode configuration
 */
export enum RuntimeMode {
  /**
   * CLI Agent mode - prefers OS-native sandbox on local runtime
   */
  CLI_AGENT = "cli-agent",
  
  /**
   * Repository Agent mode - prefers Docker runtime
   */
  REPO_AGENT = "repo-agent",
  
  /**
   * Auto-detect the best available runtime
   */
  AUTO = "auto"
}

/**
 * Config for the CodingContext runtime
 */
export interface RuntimeConfig {
  /**
   * The mode determines which runtime to use
   */
  mode: RuntimeMode | string;
  
  /**
   * Docker image to use (for Docker runtime)
   */
  dockerImage?: string;
  
  /**
   * Whether to force using sandbox even in Docker
   */
  forceSandbox?: boolean;
  
  /**
   * Default writable paths for all commands
   */
  defaultWritablePaths?: string[];
}
