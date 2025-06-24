import { z } from 'zod';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { ShellExecutionResult, ExecutionOptions } from '../sandbox';
import { IRuntime } from '../runtime/interface';
import { logger } from '@continue-reasoning/core';

const BashCommandParamsSchema = z.object({
  command: z.string().describe("The bash command to execute."),
  cwd: z.string().optional().describe("The current working directory for the command. Defaults to the agent's workspace root or process.cwd()."),
  timeout_ms: z.number().int().optional().describe("Timeout in milliseconds for the command. Defaults to 60000ms (60s)."),
  writable_paths: z.array(z.string()).optional().describe("Additional directories that should be writable by the command."),
  allow_network: z.boolean().optional().describe("Whether to allow network access (default: false if not specified).")
});

const BashCommandReturnsSchema = z.object({
  stdout: z.string().describe("The standard output of the command."),
  stderr: z.string().describe("The standard error output of the command."),
  exit_code: z.number().nullable().describe("The exit code of the command. Null if the process was killed or did not exit normally."),
  success: z.boolean().describe("Whether the command execution was successful."),
  message: z.string().optional().describe("An message about the command execution success or error")
});

export const BashCommandTool = createTool({
  id: 'BashCommand',
  name: 'BashCommand',
  description: 'Executes a bash command using the configured runtime and its sandbox, with specific execution options.',
  inputSchema: BashCommandParamsSchema,
  outputSchema: BashCommandReturnsSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    const codingContext = agent?.contextManager.findContextById('coding-context');
    if (!codingContext) {
      throw new Error('Coding context not found');
    }
    
    const runtime = (codingContext as any).getRuntime() as IRuntime;
    if (!runtime) {
      throw new Error('Runtime not found in the coding context');
    }

    // Log the sandbox type being used by the runtime for debugging
    logger.debug(`BashCommandTool: Using runtime (${runtime.type}) with sandbox of type: ${runtime.sandbox.type}`);

    const workspacePath = codingContext.getData()?.current_workspace || process.cwd();
    
    // Handle default values
    const allowNetwork = params.allow_network !== undefined ? params.allow_network : false;
    const timeout = params.timeout_ms || 60000; // Default 60 seconds
    
    const executionOptions: ExecutionOptions = {
      cwd: params.cwd || workspacePath,
      timeout: timeout,
      writablePaths: params.writable_paths,
      allowNetwork: allowNetwork,
      // We assume IRuntime's execute method can take these ISandbox ExecutionOptions
      // or that the IRuntime implementation will correctly pass them to its ISandbox.
    };
    
    logger.debug(`BashCommandTool: Executing command "${params.command}" in ${executionOptions.cwd} via runtime.`);
    
    const result = await runtime.execute(params.command, executionOptions);

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      message: result.error?.message,
      success: result.exitCode === 0,
    };
  },
});

export const BashToolSet = [
  BashCommandTool,
]; 