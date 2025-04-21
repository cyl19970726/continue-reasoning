import { z } from "zod";
import { BasicToolNames, SystemToolNames } from "./index";
import { ContextHelper, createTool } from "../utils";
import { exec } from "child_process";
import { promisify } from "util";

const BashToolInputSchema = z.object({
    command: z.string().describe("The bash command to execute"),
    workingDirectory: z
      .string()
      .describe("Working directory for command execution"),
    // timeout: z.number().optional().describe("Timeout in milliseconds (default: 90000)"),
  });

const BashToolOutputSchema = z.object({
    success: z.boolean(),
    error: z.string().optional(),
    stdout: z.string(),
    stderr: z.string(),
    command: z.string(),
})

const execPromise = promisify(exec);

export const bashTool = createTool({
    id: BasicToolNames.runBash,
    name: BasicToolNames.runBash,
    description: "Execute a bash command and return the output",
    inputSchema: BashToolInputSchema,
    outputSchema: BashToolOutputSchema,
    async: false,
    execute: async (params, agent) => {
        try {
            const { command, workingDirectory} = params;
            const timeout = 90000;
      
            console.log(`Executing bash command: ${command}`);
      
            const options: any = {
              timeout,
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            };
      
            if (workingDirectory) {
              options.cwd = workingDirectory;
            }
      
            const { stdout, stderr } = await execPromise(command, options);
      
            console.log("stdout", stdout);
            console.log("stderr", stderr);
      
            if (agent) {
                // Find the context first
                const context = agent.contextManager.findContextById(ExecuteToolsContextId);
                // Check context, saveMemory, and getContainerId exist
                if (context ) {
                    // Get current data first
                    const currentData = context.getData();
                    const currentRecords = currentData?.runBash?.execRecords ?? [];
                    
                    // Call setData with the correct partial structure
                    context.setData({
                        runBash: { // Match the data schema structure
                            // Preserve existing RootWorkingDirectory by spreading
                            ...currentData?.runBash, 
                            execRecords: [
                                ...currentRecords,
                                {
                                    success: true,
                                    stdout: stdout.toString().trim(),
                                    stderr: stderr.toString().trim(),
                                    command,
                                },
                            ]
                        }
                    });

                } else {
                     console.warn(`Could not find ExecuteToolsContext (${ExecuteToolsContextId}) or it lacks saveMemory/getContainerId.`);
                }
            }
            return {
              success: true,
              stdout: stdout.toString().trim(),
              stderr: stderr.toString().trim(),
              command,
            };
          } catch (error) {
            const errorObj = error as any;
            return {
              success: false,
              error: errorObj.message || String(error),
              stdout: errorObj.stdout?.trim() || "",
              stderr: errorObj.stderr?.trim() || "",
              command: params.command,
            };
          }
    }
});




// Define the data schema separately
const ExecuteToolsContextDataSchema = z.object({
    runBash: z.object({
        RootWorkingDirectory: z.string().describe("Working directory for command execution"),
        execRecords: z.array(BashToolOutputSchema).describe("The records of the bash command execution"),
    }),
});

// Define the memory schema separately
const ExecuteToolsContextMemorySchema = z.object({
    success: z.boolean(),
    error: z.string().optional(),
    stdout: z.string(),
    stderr: z.string(),
    command: z.string(),
});

export const ExecuteToolsContextId = "ExecuteToolsContext";
// Now create the context using the defined schemas
export const ExecuteToolsContext = ContextHelper.createContext({
    id: ExecuteToolsContextId,
    description: `Provides context and history for basic tools like bash execution.`,
    dataSchema: ExecuteToolsContextDataSchema,
    initialData:{
        runBash:{
            RootWorkingDirectory: process.cwd(),
            execRecords: [],
        }
    },
    renderPromptFn: (data: z.infer<typeof ExecuteToolsContextDataSchema>) => {
        // Determine the history string, showing most recent first
        const history = data.runBash.execRecords.length === 0
            ? "  - No bash commands executed yet in this session."
            : data.runBash.execRecords.slice().reverse().map((record, index) => `
  [Record ${data.runBash.execRecords.length - index}] Command: ${record.command}
      Status: ${record.success ? 'Success' : 'Failed'} ${record.error ? `(Error: ${record.error})` : ''}
      Stdout: ${record.stdout || '(empty)'}
      Stderr: ${record.stderr || '(empty)'}
            `).join("\n");

        // Construct the prompt
        return `
        ------ Bash Command Context (${BasicToolNames.runBash}) ------
        Current Working Directory: ${data.runBash.RootWorkingDirectory}, you should use this directory when executing the bash command
        *   Use the \`${BasicToolNames.runBash}\` tool to execute shell commands.
        *   Ensure any files created or manipulated are relative to the working directory unless a full path is required.

        Execution History (most recent first):
${history}

        Review the history above to understand the current state and avoid repeating failed commands without adjustments.
        `;
    },
    toolListFn: () => [bashTool],
});