import { ContextHelper, createTool } from "../utils/index.js";
import { z } from "zod";
import { IAgent } from "../interfaces/index.js";

export const ToolSetContextId = "toolset-context";
export const ToolSetContext = ContextHelper.createContext({
  id: ToolSetContextId,
  description: "Manages the available tool sets, including listing, activating, and deactivating tool sets dynamically. Enables the agent to adapt its capabilities by switching between different tool collections as needed.",
  dataSchema: z.object({}),
  initialData: {},
  renderPromptFn: () => `
  --- Tool Set Management Context ---
  
  Available Tool Management Operations:
  • list_toolset: View all available tool sets
  • activate_toolset: Enable specific tool sets for use
  • deactivate_toolset: Disable specific tool sets
  
  Capability Management Guidelines:
  1. Use list_toolset to discover available capabilities
  2. Activate tool sets based on current task requirements
  3. Deactivate tool sets when no longer needed to reduce complexity
  
  Best Practices:
  • Keep only relevant tool sets active for the current task
  • Activate specialized tool sets (like WebSearch) only when needed
  • After completing a task requiring specialized tools, consider deactivating them
  • Remember that activating/deactivating affects which tools are available in subsequent steps
  
  Example Usage:
  - When starting a web research task: activate_toolset(["WebSearchToolSet"])  
  - When focusing on planning: activate_toolset(["PlanTools"])
  - When finished with a specialized task: deactivate_toolset(["WebSearchToolSet"])
  `,
  toolSetFn: () => ({
    name: "ToolSet",
    description: "This tool set is for managing tool sets themselves, including tools for listing, activating, and deactivating tool sets. Suitable for dynamic management and switching of available tool sets. Source: local.",
    tools: [ListToolSetTool, ActivateToolSetTool, DeactivateToolSetTool],
    active: true,
    source: "local"
  }),
});

export const ListToolSetTool = createTool({
  id: "list_toolset",
  name: "list_toolset",
  description: "List all tool sets, including name, description, active, and source.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    toolSets: z.array(z.object({
      name: z.string(),
      description: z.string(),
      active: z.boolean(),
      source: z.string().optional(),
    })),
    success: z.boolean(),
    message: z.string().optional()
  }),
  async: false,
  execute: async (_params, agent?: IAgent) => {
    if (!agent || !('listToolSets' in agent)) return { toolSets: [], success: false};
    // @ts-ignore
    const sets = agent.listToolSets();
    return { toolSets: sets, success: true };
  }
}); 

export const ActivateToolSetTool = createTool({
  id: "activate_toolset",
  name: "activate_toolset",
  description: "Activate the specified tool sets. Supports multiple.",
  inputSchema: z.object({
    toolSetNames: z.array(z.string())
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent || !('activateToolSets' in agent)) return { success: false };
    // @ts-ignore
    agent.activateToolSets(params.toolSetNames);
    return { success: true };
  }
}); 

export const DeactivateToolSetTool = createTool({
  id: "deactivate_toolset",
  name: "deactivate_toolset",
  description: "Deactivate the specified tool sets. Supports multiple.",
  inputSchema: z.object({
    toolSetNames: z.array(z.string())
  }),
  outputSchema: z.object({
    success: z.boolean()
  }),
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent || !('deactivateToolSets' in agent)) return { success: false };
    // @ts-ignore
    agent.deactivateToolSets(params.toolSetNames);
    return { success: true };
  }
}); 
