import { z } from 'zod';
import { IContext, ITool, IAgent, ToolCallResult, ToolSet as ToolSetInterface } from '../../interfaces';
import { GeminiFileSystemToolSet, GeminiRuntimeToolSet, GeminiEditingStrategyToolSet, GeminiBashToolSet } from './toolsets';
import { IRuntime } from './runtime/interface';
import { NodeJsSandboxedRuntime } from './runtime/impl/node-runtime';
import { ISandbox } from './sandbox';
import { NoSandbox } from './sandbox/no-sandbox';
import { SeatbeltSandbox } from './sandbox/seatbelt-sandbox';
import * as os from 'os';

// Schema for CodingContext persistent data
export const CodingContextDataSchema = z.object({
  current_workspace: z.string().describe("The root path of the current coding project/workspace."),
  open_files: z.record(z.string(), z.object({ 
    content_hash: z.string().optional().describe("A hash of the file content for change detection."),
    last_read_content: z.string().optional().describe("The content of the file when it was last read (can be partial)."),
  })).optional().default({}).describe("A map of file paths to their metadata, representing files currently in focus or recently accessed."),
  active_diffs: z.record(z.string(), z.string()).optional().default({}).describe("A map of file paths to their active diff strings, typically after an edit operation."),
  selected_editing_strategy: z.enum(["edit_block", "whole_file", "ranged_edit", "unified_diff"])
    .optional()
    .default("whole_file")
    .describe("The currently selected default editing strategy for the LLM to use."),
});

export type CodingContextData = z.infer<typeof CodingContextDataSchema>;

export class CodingContext implements IContext<typeof CodingContextDataSchema> {
  readonly id = 'coding_gemini';
  readonly name = 'Gemini Coding Agent Context';
  readonly description = 'Manages state and tools for coding tasks, powered by Gemini models.';
  
  public data: CodingContextData;
  private contextToolSet: ToolSetInterface;
  private runtime: IRuntime;
  private sandbox: ISandbox;
  readonly dataSchema = CodingContextDataSchema;

  constructor(workspacePath: string, initialData?: Partial<CodingContextData>) {
    const parsedInitialData = {
      current_workspace: workspacePath,
      open_files: initialData?.open_files || {},
      active_diffs: initialData?.active_diffs || {},
      selected_editing_strategy: initialData?.selected_editing_strategy || "whole_file",
    };
    this.data = CodingContextDataSchema.parse(parsedInitialData);

    // Initialize the runtime
    this.runtime = new NodeJsSandboxedRuntime();
    
    // Initialize the sandbox with NoSandbox as a default
    // Will be replaced with platform-specific sandbox once initialized
    this.sandbox = new NoSandbox();
    
    // Start the async initialization of the sandbox
    this.initializeSandbox();

    const allTools: ITool<any, any, IAgent>[] = [
      ...GeminiFileSystemToolSet,
      ...GeminiRuntimeToolSet,
      ...GeminiEditingStrategyToolSet,
      ...GeminiBashToolSet,
    ];
    
    this.contextToolSet = {
      name: 'GeminiCodingAgentTools',
      description: 'Core tools for the Gemini Coding Agent, including file system, runtime, and editing tools.',
      tools: allTools,
      active: true,
      source: 'coding-gemini-context',
    };
  }
  
  /**
   * Initialize the sandbox asynchronously
   * This allows the constructor to complete while sandbox initialization happens in the background
   */
  private async initializeSandbox(): Promise<void> {
    try {
      const betterSandbox = await this.createPlatformSandbox();
      this.sandbox = betterSandbox;
      console.log(`Sandbox initialized with type: ${this.sandbox.type}`);
    } catch (error) {
      console.error('Failed to initialize platform sandbox, using NoSandbox as fallback:', error);
      // Keep the default NoSandbox
    }
  }

  /**
   * Create the appropriate sandbox instance based on the current platform
   */
  private async createPlatformSandbox(): Promise<ISandbox> {
    const platform = os.platform();
    
    // For macOS, use Seatbelt if available
    if (platform === 'darwin') {
      try {
        // Check if Seatbelt is available
        if (await SeatbeltSandbox.isAvailable()) {
          console.log('Using macOS Seatbelt sandbox');
          return new SeatbeltSandbox();
        }
      } catch (error) {
        console.warn('Failed to initialize Seatbelt sandbox:', error);
      }
    }
    
    // For other platforms or if Seatbelt failed, use NoSandbox
    console.log('Using NoSandbox (no security isolation)');
    return new NoSandbox();
  }

  getData(): CodingContextData {
    return { ...this.data };
  }

  setData(newData: Partial<CodingContextData>): void {
    const mergedData = { ...this.data, ...newData };
    this.data = CodingContextDataSchema.parse(mergedData);
  }

  toolSet(): ToolSetInterface {
    return this.contextToolSet;
  }
  
  onToolCall(toolCallResult: ToolCallResult): void {
    console.log(`CodingContext.onToolCall: Tool ${toolCallResult.name} (ID: ${toolCallResult.call_id}) executed.`);
    
    const toolName = toolCallResult.name;
    const resultData = toolCallResult.result as any;

    if (toolName === 'ApplyWholeFileEditTool' && resultData?.success && resultData?.diff) {
      console.log(`ApplyWholeFileEditTool succeeded. Diff generated. Path info needed for full context update.`);
    }

    if (toolName === 'ReadFileTool' && resultData?.content) {
      console.log(`ReadFileTool succeeded. Content read. Path info needed for full context update.`);
    }
  }

  async renderPrompt(options?: any): Promise<string> {
    let prompt = `You are a coding assistant operating in the workspace: ${this.data.current_workspace}.\n`;
    prompt += `The current default editing strategy is: ${this.data.selected_editing_strategy}.\n`;
    prompt += `You have access to a sandbox with type: ${this.sandbox.type}.\n`;

    if (this.data.open_files && Object.keys(this.data.open_files).length > 0) {
      prompt += "\nFiles currently in focus (or recently read):\n";
      for (const [path, meta] of Object.entries(this.data.open_files)) {
        prompt += `- ${path}`;
        if (meta.last_read_content) {
          prompt += ` (preview available)\n`;
        } else {
          prompt += `\n`;
        }
      }
    }

    if (this.data.active_diffs && Object.keys(this.data.active_diffs).length > 0) {
      prompt += "\nRecent changes (active diffs):\n";
      for (const [path, diff] of Object.entries(this.data.active_diffs)) {
        prompt += `Diff for ${path}:\n\`\`\`diff\n${diff}\n\`\`\`\n`;
      }
    }
    
    prompt += "\nAvailable toolset: ${this.contextToolSet.name} - ${this.contextToolSet.description}\n";
    return prompt;
  }

  getRuntime(): IRuntime {
    return this.runtime;
  }
  
  getSandbox(): ISandbox {
    return this.sandbox;
  }
}

export function createGeminiCodingContext(workspacePath: string, initialData?: Partial<CodingContextData>): CodingContext {
    if (!workspacePath) {
        throw new Error("Workspace path is required to create a CodingContext.");
    }
    return new CodingContext(workspacePath, initialData);
} 