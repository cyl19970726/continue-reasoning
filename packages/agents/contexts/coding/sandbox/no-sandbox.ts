import { ISandbox, ShellExecutionResult, ExecutionOptions } from './interface.js';
import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * No sandbox implementation - provides no security isolation.
 * Only suitable for trusted environments or when another isolation mechanism is used (like Docker).
 */
export class NoSandbox implements ISandbox {
  readonly type = "none";

  public async executeSecurely(
    command: string,
    options?: ExecutionOptions
  ): Promise<ShellExecutionResult> {
    const execOptions: ExecOptions = {
      cwd: options?.cwd || process.cwd(),
      timeout: options?.timeout || 60000,
      shell: process.env.SHELL || undefined,
      env: options?.env ? { ...process.env, ...options.env } : process.env,
    };

    try {
      const { stdout, stderr } = await execAsync(command, execOptions);
      return { stdout, stderr, exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: typeof error.code === 'number' ? error.code : null,
        error: error.signal
          ? new Error(`Command killed by signal: ${error.signal}`)
          : error.killed
            ? new Error('Command was killed.')
            : new Error(`Command failed with exit code ${error.code}: ${error.stderr || error.stdout || 'No output'}`),
      };
    }
  }
} 