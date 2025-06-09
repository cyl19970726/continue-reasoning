import { z } from 'zod';
import { IEventBus } from '../events/eventBus';
import { Logger } from '../utils/logger';
import { createTool, ContextHelper } from '../utils';
import { IAgent, IRAGEnabledContext, ToolSet } from '../interfaces';

export const ThinkingContextId = 'thinking-context';

// AgentStop 工具的输入输出 Schema
const AgentStopInputSchema = z.object({
  reason: z.string().describe("Reason for stopping the agent")
});

const AgentStopOutputSchema = z.object({
  success: z.boolean(),
  message: z.string()
});

// AgentStop 工具
export const AgentStopTool = createTool({
  id: "agent_stop",
  name: "agent_stop", 
  description: "Stop the agent execution when all tasks are completed or when user interaction is needed.",
  inputSchema: AgentStopInputSchema,
  outputSchema: AgentStopOutputSchema,
  async: false,
  execute: async (params, agent?: IAgent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    console.log(`[ThinkingContext] Agent stop requested: ${params.reason}`);
    
    // Signal the agent to stop
    if (agent.stop) {
      agent.stop();
    }

    return {
      success: true,
      message: `Agent stopped: ${params.reason}`
    };
  }
});

// 简单的数据 Schema（空的，因为这个 context 只存放工具）
const ThinkingContextDataSchema = z.object({});

/**
 * 创建思考系统控制Context
 * 只用于存放系统级控制工具（如 agent_stop）
 */
export function createThinkingContext(logger: Logger, eventBus: IEventBus): IRAGEnabledContext<typeof ThinkingContextDataSchema> {
  return ContextHelper.createContext({
    id: ThinkingContextId,
    description: 'Provides system-level control tools for the thinking system',
    dataSchema: ThinkingContextDataSchema,
    initialData: {},
    
    // 工具集函数 - 返回包含 agent_stop 的工具集
    toolSetFn: (): ToolSet => ({
      name: 'thinking-system-control',
      description: 'System control tools for thinking workflow management',
      tools: [AgentStopTool],
      active: true,
      source: 'thinking-context'
    }),
    
    // 简单的 renderPrompt - 因为 prompt 内容已经在 SystemPrompt 和 ThinkingProtocol 中
    renderPromptFn: () => ({
      workflow: '',
      status: '',
      guideline: '',
      examples: ''
    })
  });
} 