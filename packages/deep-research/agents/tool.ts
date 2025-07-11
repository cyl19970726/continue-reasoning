import { z } from 'zod';
import { createTool } from '@continue-reasoning/core';
import { IAgent } from '@continue-reasoning/core';
import { logger } from '@continue-reasoning/core';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const BashCommandParamsSchema = z.object({
  command: z.string().describe("The bash command to execute."),
  cwd: z.string().optional().describe("The current working directory for the command. Defaults to the agent's workspace root or process.cwd()."),
  timeout_ms: z.number().optional().describe("Timeout in milliseconds for the command. Defaults to 60000ms (60s)."),
});

const BashCommandReturnsSchema = z.object({
  stdout: z.string().describe("The standard output of the command."),
  stderr: z.string().describe("The standard error output of the command."),
  exit_code: z.number().nullable().describe("The exit code of the command. Null if the process was killed or did not exit normally."),
  success: z.boolean().describe("Whether the command execution was successful."),
  message: z.string().optional().describe("A message about the command execution success or error")
});

export const BashCommandTool = createTool({
  id: 'BashCommand',
  name: 'BashCommand',
  description: 'Executes a bash command for writing research reports to files.',
  inputSchema: BashCommandParamsSchema,
  outputSchema: BashCommandReturnsSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    const workspacePath = process.cwd();
    const timeout = Math.floor(params.timeout_ms || 60000); // Default 60 seconds
    
    logger.debug(`BashCommandTool: Executing command "${params.command}" in ${params.cwd || workspacePath}`);
    
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: params.cwd || workspacePath,
        timeout: timeout,
      });

      return {
        stdout: stdout,
        stderr: stderr,
        exit_code: 0,
        message: `Execute command "${params.command}" successfully`,
        success: true,
      };
    } catch (error: any) {
      logger.error(`BashCommandTool: Error executing command "${params.command}": ${error.message}`);

      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exit_code: error.code || -1,
        message: `Execute command "${params.command}" failed: ${error.message}`,
        success: false,
      };
    }
  },
});

export const BashToolSet = [
  BashCommandTool,
];
