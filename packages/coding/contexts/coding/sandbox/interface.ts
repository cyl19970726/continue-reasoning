/**
 * Sandbox interfaces for the coding agent
 */

/**
 * Result of a shell command execution
 */
export interface ShellExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number | null; // exitCode can be null if process is killed
  error?: Error; // For errors during the exec process itself, not for non-zero exit codes
}

/**
 * Common options for sandbox execution
 */
export interface ExecutionOptions {
  // Common options
  cwd?: string;
  timeout?: number;
  writablePaths?: string[];
  env?: Record<string, string>;
  
  // Network-related options
  allowNetwork?: boolean;
}

/**
 * Sandbox interface for security isolation
 */
export interface ISandbox {
  /**
   * Execute a command with security isolation
   */
  executeSecurely(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult>;
  
  /**
   * The type of sandbox for identification and logging
   */
  readonly type: "none" | "seatbelt" | "landlock";
} 