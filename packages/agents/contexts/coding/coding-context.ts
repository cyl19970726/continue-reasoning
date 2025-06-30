import { IContext, ITool, IAgent, ToolCallResult, ToolSet as ToolSetInterface, IRAGEnabledContext, PromptCtx } from '@continue-reasoning/core';
import { z } from 'zod';
import { logger } from '@continue-reasoning/core';
import { createTool } from '@continue-reasoning/core';
import { EditingStrategyToolSet, BashToolSet, EditingStrategyToolExamples, GrepToolSet } from './toolsets';
import { ContextHelper } from '@continue-reasoning/core';
import { IRuntime } from './runtime/interface';
import { NodeJsSandboxedRuntime } from './runtime/impl/node-runtime';
import { ISandbox } from './sandbox';
import { NoSandbox } from './sandbox/no-sandbox';
import { SeatbeltSandbox } from './sandbox/seatbelt-sandbox';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { SnapshotManager } from './snapshot/snapshot-manager';
import { SnapshotEditingToolSet } from './snapshot/snapshot-enhanced-tools';
import { snapshotManagerTools } from './snapshot/snapshot-manager-tools';
import { ReadToolSet } from './toolsets/editing-strategy-tools';
import { WebSearchTool } from '@continue-reasoning/core';

// Schema for CodingContext persistent data - 极简版本
export const CodingContextDataSchema = z.object({
  current_workspace: z.string().describe("Current active workspace path."),
});

export type CodingContextData = z.infer<typeof CodingContextDataSchema>;

// Extended interface that includes runtime, sandbox, and snapshot functionality  
export interface ICodingContext extends IRAGEnabledContext<typeof CodingContextDataSchema> {
  getRuntime(): IRuntime;
  getSandbox(): ISandbox;
  getSnapshotManager(): SnapshotManager;
  getCurrentWorkspace(): string;
  switchToWorkspace(workspacePath: string): Promise<void>;
}

/**
 * Initialize the sandbox asynchronously
 * This allows the constructor to complete while sandbox initialization happens in the background
 */
async function initializeSandbox(sandbox: ISandbox): Promise<ISandbox> {
  try {
    const betterSandbox = await createPlatformSandbox();
    logger.info(`Sandbox initialized with type: ${betterSandbox.type}`);
    return betterSandbox;
  } catch (error) {
    logger.error('Failed to initialize platform sandbox, using NoSandbox as fallback:', error);
    // Keep the default NoSandbox
    return sandbox;
  }
}

/**
 * Create the appropriate sandbox instance based on the current platform
 */
async function createPlatformSandbox(): Promise<ISandbox> {
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

/**
 * Validate if a path is within the current workspace
 */
function isPathInWorkspace(targetPath: string, workspacePath: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedWorkspace = path.resolve(workspacePath);
  return resolvedTarget.startsWith(resolvedWorkspace);
}

/**
 * Create workspace management tools - 极简版本
 */
function createWorkspaceTools(context: ICodingContext): ITool<any, any, IAgent>[] {
  
  const SwitchWorkspaceTool = createTool({
    name: 'SwitchWorkspaceTool',
    description: 'Switch to a different workspace. This will close the current SnapshotManager and create a new one for the target workspace. The target directory will be created if it doesn\'t exist.',
    inputSchema: z.object({
      workspacePath: z.string().describe('The absolute or relative path to the workspace directory to switch to')
    }),
    async: true,
    execute: async (args, agent) => {
      try {
        const { workspacePath } = args;
        const resolvedPath = path.resolve(workspacePath);
        
        // Check if already current
        if (resolvedPath === context.getCurrentWorkspace()) {
          return {
            success: true,
            message: `Already in workspace: ${resolvedPath}`,
            currentWorkspace: resolvedPath
          };
        }
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(resolvedPath)) {
          fs.mkdirSync(resolvedPath, { recursive: true });
          logger.info(`Created workspace directory: ${resolvedPath}`);
        } else if (!fs.statSync(resolvedPath).isDirectory()) {
          return {
            success: false,
            message: `Path '${resolvedPath}' exists but is not a directory`,
            currentWorkspace: context.getCurrentWorkspace()
          };
        }
        
        // Switch to the workspace
        await context.switchToWorkspace(resolvedPath);
        
        logger.info(`Switched to workspace: ${resolvedPath}`);
        
        return {
          success: true,
          message: `Successfully switched to workspace: ${resolvedPath}. SnapshotManager has been reinitialized.`,
          currentWorkspace: resolvedPath
        };
      } catch (error) {
        logger.error('Error switching workspace:', error);
        return {
          success: false,
          message: `Failed to switch workspace: ${error}`,
          currentWorkspace: context.getCurrentWorkspace()
        };
      }
    }
  });

  return [SwitchWorkspaceTool];
}

/**
 * Create a Coding Context with simple workspace switching
 */
export function createCodingContext(workspacePath: string, initialData?: Partial<CodingContextData>): ICodingContext {
  if (!workspacePath) {
    throw new Error("Workspace path is required to create a CodingContext.");
  }
  
  // 确保工作空间存在
  if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
      logger.info(`Created workspace directory: ${workspacePath}`);
  }
  
  const parsedInitialData = {
    current_workspace: workspacePath,
    ...initialData
  };

  // Initialize the runtime
  const runtime = new NodeJsSandboxedRuntime();
  
  // Initialize the sandbox with NoSandbox as a default
  // Will be replaced with platform-specific sandbox once initialized
  let sandbox: ISandbox = new NoSandbox();
  
  // Initialize the snapshot manager for the initial workspace
  let snapshotManager = new SnapshotManager(workspacePath);
  
  // Start the async initialization of the sandbox
  initializeSandbox(sandbox).then(newSandbox => {
    sandbox = newSandbox;
  });

  // Create the base RAG context first
  const baseContext = ContextHelper.createRAGContext({
    id: 'coding-context',
    description: 'Manages file operations and code modifications using diff-driven development workflow with workspace switching and advanced code search capabilities.',
    dataSchema: CodingContextDataSchema,
    initialData: parsedInitialData,
    renderPromptFn: (data: CodingContextData): PromptCtx => {
      // Workflow: Comprehensive programming process including codebase understanding
      const workflow = `**Programming Workflow**:

**Phase 1: Codebase Understanding (for new or unfamiliar projects)**:
1. **Project Structure Analysis** → Use BashCommand(find/tree) to understand directory layout
2. **Documentation Discovery** → ReadFile key docs: README.md, docs/, package.json, architecture docs
3. **Entry Points Identification** → Find main files, index files, configuration files
4. **Dependencies Mapping** → Analyze package.json, imports, and core module relationships
5. **Code Pattern Recognition** → Use Grep tool with context lines to find common patterns, interfaces, class structures
6. **Test Structure Understanding** → Locate and examine test files to understand expected behavior

**Phase 2: Feature Development (Documentation-First Approach)**:
7. **Snapshot Ignore Setup** → FIRST: Configure .snapshotignore to prevent unknown changes from test files, temporary files, and development artifacts
8. **Documentation Planning** → Create/update docs/ structure and main documentation
9. **Interface Design** → Define main framework interfaces before implementation
10. **Architecture Documentation** → Document module relationships and data flow
11. **Requirements Analysis** → Based on requirements, add more patterns to .snapshotignore for project-specific files
12. **Implementation Strategy** → Choose appropriate editing tools based on modification scope

**Phase 3: Implementation**:
12. **Staged Implementation** → Start with interfaces, then concrete implementations
13. **Snapshot Creation** → Apply code changes with automatic snapshot generation
14. **Documentation Updates** → Keep docs synchronized with code changes
15. **Consolidation** → Use MergeSnapshot to organize related changes

**Phase 4: Validation**:
16. **Test Validation** → Run tests to ensure functionality is correct
17. **Documentation Review** → Verify docs match implemented functionality
18. **Rollback Handling** → Use RevertSnapshot if issues occur`;

      // Status information: Contains more context
      const currentWorkspace = data.current_workspace;
      
      let status = `**🎯 CURRENT WORKSPACE**: ${currentWorkspace}`;

      // Guidelines: Comprehensive development principles and best practices
      const guideline = `**Programming Best Practices**:

**🚨 SINGLE WORKSPACE MODEL** (CRITICAL):
• **CURRENT WORKSPACE**: Only ONE workspace is active at any time: ${currentWorkspace}
• **WORKSPACE OPERATIONS**: All file operations are restricted to the current workspace and its subdirectories
• **SNAPSHOT MANAGEMENT**: SnapshotManager only tracks changes in the current workspace
• **WORKSPACE SWITCHING**: Use SwitchWorkspaceTool to change workspace (closes old SnapshotManager, creates new one)
• **PATH VALIDATION**: All file paths must be within: ${currentWorkspace}/**

**🚫 SNAPSHOT IGNORE MANAGEMENT** (CRITICAL):
• **BEFORE ANY DEVELOPMENT**: Always check and configure .snapshotignore file to prevent unknown changes
• **IGNORE IRRELEVANT FILES**: Add test files, temporary files, build outputs, and development-unrelated files to .snapshotignore
• **PREVENT SNAPSHOT CHAIN BREAKS**: Unknown changes in ignored files can break snapshot continuity and consolidation
• **PROACTIVE IGNORE PATTERNS**: Add patterns for files that MIGHT be created during development but are not part of the main codebase
• **EXAMPLES TO IGNORE**: 
  - Test files: *.test.js, *.spec.js, test*.js, *_test.js
  - Temporary files: *.tmp, *.temp, temp_*, test_*
  - Build outputs: dist/**, build/**, *.min.js, *.bundle.js
  - IDE files: .vscode/**, .idea/**, *.swp
  - Logs: *.log, logs/**
  - Development artifacts: *.generated, *_output.*, *_result.*
• **SNAPSHOT IGNORE MANAGEMENT**: Use BashCommand to read/write .snapshotignore file directly (cat .snapshotignore, echo "pattern" >> .snapshotignore)

**📚 INTERFACE-FIRST DEVELOPMENT PRINCIPLES** (CRITICAL):
• **ALWAYS READ INTERFACES FIRST**: Before implementing any feature, READ the relevant interface files to understand the contract
• **INTERFACE COMPLIANCE**: When extending classes that implement interfaces, ALWAYS add new methods to the interface first
• **DEPENDENCY ANALYSIS**: Use Grep to find interface definitions and understand existing contracts before coding
• **MODULAR DESIGN**: Each feature should have clear interfaces with minimal coupling
• **ABSTRACT THINKING**: Design interfaces that are extensible and maintainable

**🔍 CODE READING & UNDERSTANDING PRINCIPLES** (CRITICAL):
• **STRUCTURE FIRST**: Always start with BashCommand(find/tree) to understand project layout
• **INTERFACE DISCOVERY**: Use Grep to find "interface|class|export" patterns to understand architecture
• **DEPENDENCY MAPPING**: Trace imports and understand module relationships before making changes
• **PATTERN RECOGNITION**: Use Grep with context lines to identify common patterns and conventions
• **TEST INSPECTION**: Read test files to understand expected behavior and usage patterns

**📝 DOCUMENTATION-FIRST DEVELOPMENT PRINCIPLES**:
• **Main Documentation**: Always create main docs in docs/ directory with proper indexing
• **README Files**: Each code directory must have a README explaining code structure
• **Document Simplicity**: Keep docs concise and clear - they should guide development, not replace code reading
• **Document Modularity**: Each document should be focused and not too long (optimize for Agent token consumption)
• **Index Management**: Main documents should contain indexes to other documentation

**🏗️ ARCHITECTURE & INTERFACE DESIGN**:
• **Interface First**: Before writing any code, design main framework interfaces
• **Logical Connections**: Connect different framework interfaces with implementable functions
• **Abstract Definitions**: Use abstract functions for later implementation, keeping interfaces clean
• **Incremental Refinement**: Gradually refine interfaces when implementing sub-modules
• **File Size Limit**: Each code file must not exceed 500 lines - split and decouple if larger

**🔧 EDITING TOOL PREFERENCES** (CRITICAL):
• **AVOID ApplyUnifiedDiff**: This tool has issues with multi-line diffs and file path resolution
• **PREFER ApplyEditBlock**: Use for targeted code changes when you know the exact code block
• **PREFER ApplyWholeFileEdit**: Use for complete file operations or when creating new files
• **USE ApplyRangedEdit**: For precise line-based modifications when you know line numbers
• **FILE PATH ACCURACY**: Always verify file paths are relative to workspace root

**🗂️ Workspace Management Tools**:
• SwitchWorkspaceTool - Switch to any valid directory path (creates directory if needed)

**📝 Code Editing Tools** (automatically create snapshots in current workspace):
• ${SnapshotEditingToolSet.map(tool => tool.name).join(', ')} - All editing operations generate corresponding snapshots, all require 'goal' parameter to describe purpose.
• Prefer ApplyWholeFileEdit for complete file operations
• Use ApplyEditBlock or ApplyRangedEdit for small-scope modifications
• Use Delete tool for file removal
• **AVOID ApplyUnifiedDiff unless absolutely necessary**

**🔍 Code Search & Analysis Tools**:
• Grep - Search patterns in files with context lines, supports regex, file filtering, and provides suggested ReadFile ranges
• ReadFile - Read specific file ranges (use suggested ranges from Grep results)
• BashCommand - Execute shell commands for file system operations and analysis

**📊 Snapshot Management Tools** (operates on current workspace):
• ReadSnapshot - View snapshot content and differences
• ListSnapshots - View snapshot history (supports limit parameter)
• RevertSnapshot - Rollback individual snapshots
• MergeSnapshot - Merge multiple consecutive snapshots into one optimized snapshot (CRITICAL for workflow organization)

**🔄 MergeSnapshot Tool - Advanced Workflow Management** (CRITICAL):
• **PURPOSE**: Combines multiple consecutive snapshots into a single consolidated snapshot for better organization
• **SEQUENCE MANAGEMENT**: Automatically renumbers subsequent snapshots to maintain continuity (e.g., merge(1,2) → snapshots 3,4,5 become 2,3,4)
• **STORAGE OPTIMIZATION**: Reduces snapshot chain length and improves prompt efficiency
• **WORKFLOW ORGANIZATION**: Groups related changes into logical units (e.g., "Phase 1: Interface Design", "Phase 2: Implementation")
• **AUTOMATIC CLEANUP**: Always deletes original snapshots after successful merge (deleteOriginals=true)
• **DIFF PRESERVATION**: Merged snapshot contains combined diff showing all changes from original snapshots
• **USAGE PATTERN**: Use after completing logical development phases to keep snapshot history clean and organized
• **SEQUENCE CONTINUITY**: Ensures snapshot sequence numbers remain continuous after merge operations

**🚫 Snapshot Ignore Management** (CRITICAL for preventing unknown changes):
• BashCommand("cat .snapshotignore") - Check current ignore patterns
• BashCommand("echo 'pattern' >> .snapshotignore") - Add new ignore patterns
• ApplyWholeFileEdit(".snapshotignore", goal="Update ignore patterns") - Comprehensive ignore file updates

**🔄 Development Workflow Recommendations**:
• **FIRST PRIORITY**: Configure .snapshotignore BEFORE any development to prevent unknown changes and snapshot chain breaks
• **Before Coding**: Start with documentation and interface design
• **Code Understanding**: Use ReadFile + Grep combinations to understand existing code structure
• **Interface Analysis**: ALWAYS read interface definitions before implementing features
• **Incremental Implementation**: Implement interfaces gradually, then concrete functionality
• **Phased Development**: Break large development tasks into multiple phases/stages for better organization
• **Snapshot Organization**: Each edit creates snapshots - group related changes with MergeSnapshot after completing each phase
• **Clean History**: Use MergeSnapshot regularly to maintain clean execution history and improve prompt efficiency
• **Testing Integration**: Run tests frequently and use RevertSnapshot for quick fixes
• **Documentation Sync**: Keep documentation updated as code evolves
• **Project Switching**: Use SwitchWorkspaceTool + MergeSnapshot for clean project transitions
• **Ignore File Maintenance**: Regularly update .snapshotignore patterns based on project needs and file generation patterns

**📋 PHASED DEVELOPMENT STRATEGY** (CRITICAL for Complex Features):
• **Phase Planning**: Break complex features into logical implementation phases
• **Phase Completion**: After completing each phase, use MergeSnapshot to merge related snapshots
• **Progress Reporting**: When responding to users, provide phase-by-phase summary with snapshotId and diffPath for each phase
• **Rollback Granularity**: Consolidated phases allow for more granular rollback options
• **Prompt Efficiency**: Consolidated snapshots reduce prompt token usage and improve execution speed

**🎯 CODEBASE UNDERSTANDING STRATEGIES**:
• **Structure First**: Use find/tree commands to understand project layout
• **Documentation Scan**: Read README, docs/, package.json, and architectural documents
• **Interface Discovery**: Use Grep({pattern: "interface|class|export", context_lines: 3}) to find key definitions
• **Pattern Analysis**: Use Grep tool with regex patterns and context lines to identify common patterns, interfaces, and conventions
• **Dependency Flow**: Trace imports and understand module relationships
• **Test Inspection**: Examine test files to understand expected behavior and usage patterns
`;

      // Examples: Common working patterns including codebase understanding
      const examples = `**Common Working Patterns**:

**📚 Understanding New Codebase**:
BashCommand("cat .snapshotignore || echo 'No .snapshotignore found'") → 
BashCommand("echo 'test*.js\n*.test.js\n*.spec.js\ntemp_*\n*.tmp\n*.log' >> .snapshotignore") →
BashCommand("find . -type f -name '*.md' | head -10") → ReadFile("README.md") → ReadFile("docs/") → 
BashCommand("find . -name 'package.json' -o -name 'index.*'") → ReadFile entry points →
Grep({pattern: "interface|class|export", include_patterns: ["*.ts", "*.js"], context_lines: 2}) → 
ReadFile(suggested_ranges) → [Pattern analysis with context]

**🏗️ Documentation-First Feature Development**:
BashCommand("cat .snapshotignore") → BashCommand("echo 'test*.js\n*.test.js\ntemp_*\n*.tmp' >> .snapshotignore") →
ApplyWholeFileEdit("docs/new-feature.md", goal="Document new feature design") →
ApplyWholeFileEdit("src/interfaces/NewFeature.ts", goal="Define main interfaces") →
ApplyWholeFileEdit("src/NewFeature.ts", goal="Implement core logic") →
BashCommand("npm test") → MergeSnapshot(title="New feature implementation")

**🔍 Code Investigation & Bug Fixing**:
Grep({pattern: "error|Error|exception", include_patterns: ["*.ts", "*.js"], context_lines: 5}) → 
ReadFile(suggested_ranges) → Identify problematic code →
ListSnapshots(limit=5) → ReadSnapshot recent changes →
Grep({pattern: "function.*buggy", context_lines: 3}) → Locate bug sources →
ApplyEditBlock(goal="Fix identified bug") → BashCommand("npm test") → RevertSnapshot if needed

**📖 Adding Documentation to Existing Code**:
BashCommand("find . -type d -name src") → ReadFile("src/") →
ApplyWholeFileEdit("README.md", goal="Add comprehensive project documentation") →
ApplyWholeFileEdit("src/README.md", goal="Document source code structure") →
MergeSnapshot(title="Documentation enhancement")

**⚡ Workspace Management**:
SwitchWorkspaceTool("/path/to/new/project") → [SnapshotManager closed and recreated]
SwitchWorkspaceTool("../other-project") → [relative paths work too]

**🔄 Project Checkpoint & Switching**:
MergeSnapshot(title="Current work checkpoint") → 
SwitchWorkspaceTool("/path/to/other/project") → 
BashCommand("find . -name 'README.md'") → ReadFile project overview

**🧪 Test-Driven Development Pattern**:
BashCommand("cat .snapshotignore") → BashCommand("echo '*.test.ts\n*.spec.ts\ntest_*\ncoverage/**' >> .snapshotignore") →
ReadFile("tests/") → Understand test structure →
ApplyWholeFileEdit("tests/newFeature.test.ts", goal="Define test cases") →
ApplyWholeFileEdit("src/newFeature.ts", goal="Implement to pass tests") →
BashCommand("npm test") → MergeSnapshot(title="TDD feature complete")

**🔧 Interface Refinement Workflow**:
ReadFile existing interfaces → Grep({pattern: "interface|type", include_patterns: ["*.ts"], context_lines: 4}) →
ApplyEditBlock("src/interfaces/", goal="Refine interface definitions") →
Grep({pattern: "implements.*Interface", context_lines: 2}) → Identify implementations →
ReadFile(suggested_ranges) → Review usage patterns → Update implementations →
MergeSnapshot(title="Interface refinement")

**🚫 Snapshot Ignore Configuration Workflow**:
BashCommand("cat .snapshotignore") → Check current patterns →
BashCommand("echo '# Project-specific test files\ntest_*.py\n*_test.py\noutput/**\nresults/**' >> .snapshotignore") → Add project patterns →
BashCommand("cat .snapshotignore") → Verify updated patterns →
[Continue with development knowing test/temp files won't break snapshot chain]

**🎯 Advanced Grep Usage Patterns**:
Grep({pattern: "TODO|FIXME|HACK", context_lines: 2, max_results: 20}) → Track code debt →
Grep({pattern: "export.*function", include_patterns: ["*.ts"], whole_word: true}) → Find API endpoints →
Grep({pattern: "import.*from.*local", exclude_patterns: ["node_modules/**"], context_lines: 1}) → Analyze dependencies →
Grep({pattern: "test.*should", include_patterns: ["*.test.ts"], context_lines: 3}) → Understand test structure

**📝 PHASED DEVELOPMENT WITH CONSOLIDATION**:
Phase 1: ApplyWholeFileEdit(interfaces, goal="Define core interfaces") → ApplyEditBlock(implementations, goal="Basic implementation") →
MergeSnapshot(title="Phase 1: Core interfaces and basic implementation") →
Phase 2: ApplyEditBlock(advanced features, goal="Add advanced features") → BashCommand("npm test") →
MergeSnapshot(title="Phase 2: Advanced features with tests") →
Final Response with phase summary

**🎯 FINAL RESPONSE FORMAT** (CRITICAL for User Communication):
When completing development tasks, ALWAYS provide phase-by-phase summary in <interactive><response>:

<interactive>
<response>
Development completed successfully! Here's what was accomplished:

**Phase 1: [Phase Description]**
- Completed: [What was done in this phase]
- Snapshot ID: [consolidated_snapshot_id]
- Diff Path: [path_to_readable_diff_file]

**Phase 2: [Phase Description]** (if applicable)
- Completed: [What was done in this phase]  
- Snapshot ID: [consolidated_snapshot_id]
- Diff Path: [path_to_readable_diff_file]

**Note**: If you're not satisfied with any phase's changes, please let me know the specific code blocks you'd like modified, and I can make targeted adjustments.
</response>
</interactive>

For simple features, use only one phase. For complex features, break into logical phases and consolidate each phase separately.
`;

      return {
        workflow: workflow,
        status: status,
        guideline: guideline,
        examples: examples
      };
    },
    toolSetFn: () => {
      // Cast to extended context to access workspace tools
      const extendedCtx = baseContext as ICodingContext;
      const workspaceTools = createWorkspaceTools(extendedCtx);
      
      const allTools: ITool<any, any, IAgent>[] = [
        ...workspaceTools,
        ...SnapshotEditingToolSet,
        ...snapshotManagerTools,
        ...ReadToolSet,
        ...BashToolSet,
        ...GrepToolSet,
        WebSearchTool,
      ];
      
      return {
        name: 'CodingAgentTools',
        description: 'Core tools for the Coding Agent, including workspace switching, file system, code search (Grep), runtime, and editing tools.',
        tools: allTools,
        active: true,
        source: 'local',
      };
    },
    handleToolCall: (toolCallResult: ToolCallResult) => {
      const toolName = toolCallResult.name || 'Unknown';
      const callId = toolCallResult.call_id || 'Unknown';
      
      console.log(`CodingContext.onToolCall: Tool ${toolName} (ID: ${callId}) executed.`);
      
      // Log additional debug info if name/id are missing
      if (!toolCallResult.name || !toolCallResult.call_id) {
        console.warn('Tool call result missing name or call_id:', {
          name: toolCallResult.name,
          call_id: toolCallResult.call_id,
          resultKeys: Object.keys(toolCallResult.result || {})
        });
      }
      
      const resultData = toolCallResult.result as any;

      if (toolName === 'ApplyWholeFileEditTool' && resultData?.success && resultData?.diff) {
        console.log(`ApplyWholeFileEditTool succeeded. Diff generated. Path info needed for full context update.`);
      }

      if (toolName === 'ReadFileTool' && resultData?.content) {
        console.log(`ReadFileTool succeeded. Content read. Path info needed for full context update.`);
      }

      // Log workspace management operations
      if (toolName === 'SwitchWorkspaceTool') {
        if (resultData?.success) {
          console.log(`${toolName} succeeded:`, resultData.message);
        } else {
          console.log(`${toolName} failed:`, resultData?.message);
        }
      }
    }
  });

  // Extend the base context with runtime, sandbox, and snapshot functionality
  const extendedContext = baseContext as ICodingContext;
  
  extendedContext.getRuntime = () => runtime;
  extendedContext.getSandbox = () => sandbox;
  extendedContext.getSnapshotManager = () => snapshotManager;
  
  // Get current workspace
  extendedContext.getCurrentWorkspace = () => {
    const data = extendedContext.getData();
    return data.current_workspace || workspacePath;
  };
  
  // Switch workspace implementation - 极简版本
  extendedContext.switchToWorkspace = async (targetWorkspacePath: string) => {
    // Update the workspace
    extendedContext.setData({ current_workspace: targetWorkspacePath });
    
    // Close current SnapshotManager and create new one for the target workspace
    // Note: JavaScript doesn't have explicit cleanup for the old manager, 
    // but creating a new instance will replace the reference
    snapshotManager = new SnapshotManager(targetWorkspacePath);
    
    logger.info(`Switched to workspace: ${targetWorkspacePath}, SnapshotManager recreated`);
  };
  
  return extendedContext;
}

// Export a default instance factory function for backward compatibility
export const CodingContext = createCodingContext; 