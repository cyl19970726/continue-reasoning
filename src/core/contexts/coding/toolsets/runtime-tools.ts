// src/core/contexts/coding-gemini/toolsets/runtime-tools.ts
import { z } from 'zod';
import { createTool } from '../../../utils';
import { IAgent } from '../../../interfaces';
// import { NodeJsSandboxedRuntime } from '../runtime/impl/node-runtime'; // No longer directly instantiated
import { IRuntime } from '../runtime/interface'; // Changed from ISandboxedRuntime
import { ExecutionOptions } from '../sandbox';

const ExecuteShellCommandParamsSchema = z.object({
  command: z.string().describe("The shell command to execute."),
  cwd: z.string().optional().describe("The current working directory for the command. Defaults to the agent's workspace root or process.cwd()."),
  timeout_ms: z.number().int().optional().describe("Timeout in milliseconds for the command. Defaults to 60000ms (60s)."),
});

const ExecuteShellCommandReturnsSchema = z.object({
  stdout: z.string().describe("The standard output of the command."),
  stderr: z.string().describe("The standard error output of the command."),
  exit_code: z.number().nullable().describe("The exit code of the command. Null if the process was killed or did not exit normally."),
  error_message: z.string().optional().describe("An error message if the command execution failed (e.g., timeout, killed by signal).")
});

export const ExecuteShellCommandTool = createTool({
  id: 'execute_shell_command_gemini',
  name: 'ExecuteShellCommand',
  description: 'Executes a shell command in a sandboxed environment.',
  inputSchema: ExecuteShellCommandParamsSchema,
  outputSchema: ExecuteShellCommandReturnsSchema,
  async: true,
  execute: async (params, agent?: IAgent) => {
    // Get the coding context
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    // Get the runtime instance from the context
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    const cwd = params.cwd || workspacePath;
    
    const options: ExecutionOptions = {
      cwd,
      timeout: params.timeout_ms
    };

    const result = await runtime.execute(params.command, options); // Changed from executeShell

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      error_message: result.error?.message,
    };
  },
});

// Future ExecuteCodeTool can be added here later

export const RuntimeToolSet = [
    ExecuteShellCommandTool,
]; 