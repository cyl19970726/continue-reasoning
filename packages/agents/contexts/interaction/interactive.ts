import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createTool, ContextHelper, logger } from '../../../core/utils/index.js';
import { IAgent } from '../../../core/interfaces/index.js';
import { PromptCtx } from '../../../core/interfaces/index.js';

// ===== 交互上下文定义 =====

export const InteractiveContextId = 'interactive-v2';

const ApprovalSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  actionType: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'approved', 'rejected'])
});

const ApprovalHistorySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  actionType: z.string(),
  description: z.string(),
  decision: z.enum(['accept', 'reject', 'modify']),
  response: z.string().optional(),
  modification: z.string().optional()
});

const PendingRequestSchema = z.object({
  requestId: z.string(),
  type: z.string(),
  prompt: z.string(),
  timestamp: z.number()
});

export const InteractiveContextSchema = z.object({
  pendingApprovals: z.array(ApprovalSchema),
  approvalHistory: z.array(ApprovalHistorySchema),
  pendingRequests: z.array(PendingRequestSchema)
});

// ===== 交互管理工具 =====

export const InteractionManagementTool = createTool({
  name: 'interaction_management',
  description: 'Simplified interaction management (EventBus removed) - auto-approves for demonstration',
  inputSchema: z.object({
    command: z.enum(['request_approval', 'list_pending']),
    actionType: z.string().optional(),
    description: z.string().optional(),
    details: z.record(z.any()).optional(),
    timeout: z.number().optional()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string(),
    approved: z.boolean().optional(),
    requestId: z.string().optional(),
    decision: z.enum(['accept', 'reject', 'modify']).optional(),
    modification: z.string().optional(),
    pendingApprovals: z.array(ApprovalSchema).optional()
  }),
  async: false,
  execute: async (params, agent) => {
    if (!agent) {
      return { success: false, message: "Agent not available" };
    }

    const context = agent.contextManager.findContextById(InteractiveContextId);
    if (!context || !('getData' in context) || !('setData' in context)) {
      return { success: false, message: "Interactive context not available" };
    }

    try {
      switch (params.command) {
        case 'request_approval': {
          if (!params.actionType || !params.description) {
            return {
              success: false,
              message: "Action type and description are required for approval requests",
              approved: false
            };
          }

          // EventBus removed - simplified auto-approval for demonstration
          const requestId = uuidv4();
          logger.info(`Auto-approving action: ${params.actionType} - ${params.description} (EventBus removed)`);
          
          const currentData = (context as any).getData();
          
          // Add to history for tracking
          const approvalRecord = {
            id: requestId,
            timestamp: Date.now(),
            actionType: params.actionType,
            description: params.description,
            decision: 'accept' as const,
            response: 'Auto-approved (EventBus removed)'
          };

          (context as any).setData({
            ...currentData,
            approvalHistory: [...currentData.approvalHistory, approvalRecord]
          });

          return {
            success: true,
            message: "Action auto-approved (EventBus removed for simplification)",
            approved: true,
            requestId,
            decision: 'accept' as const
          };
        }

        case 'list_pending': {
          const data = (context as any).getData();
          return {
            success: true,
            message: `Found ${data.pendingApprovals?.length || 0} pending approvals`,
            pendingApprovals: data.pendingApprovals || []
          };
        }

        default:
          return { success: false, message: `Unknown command: ${params.command}` };
      }
    } catch (error) {
      logger.error(`Interaction management error: ${error}`);
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }
});

// ===== 用户输入请求工具 =====

export const RequestUserInputTool = createTool({
  name: 'request_user_input',
  description: 'Simplified user input request (EventBus removed) - returns default values',
  inputSchema: z.object({
    prompt: z.string(),
    inputType: z.enum(['text', 'choice', 'file_path', 'confirmation', 'password', 'config']),
    options: z.array(z.string()).optional(),
    validation: z.object({
      required: z.boolean(),
      pattern: z.string().optional(),
      minLength: z.number().optional(),
      maxLength: z.number().optional()
    }).optional(),
    sensitive: z.boolean().optional(),
    timeout: z.number().optional()
  }),
  outputSchema: z.object({
    success: z.boolean(),
    requestId: z.string(),
    value: z.any().optional(),
    error: z.string().optional()
  }),
  async: false,
  execute: async (params) => {
    const requestId = uuidv4();
    
    // EventBus removed - return default values based on input type
    let defaultValue: any = null;
    
    switch (params.inputType) {
      case 'confirmation':
        defaultValue = true;
        break;
      case 'choice':
        defaultValue = params.options?.[0] || 'default';
        break;
      case 'file_path':
        defaultValue = './default-path';
        break;
      case 'password':
        defaultValue = '***hidden***';
        break;
      case 'config':
        defaultValue = '{}';
        break;
      default:
        defaultValue = 'default-value';
    }

    logger.info(`Auto-responding to user input request: "${params.prompt}" with default value (EventBus removed)`);
    
    return {
      success: true,
      requestId,
      value: defaultValue
    };
  }
});

// ===== 上下文创建 =====

export function createInteractiveContext() {
  return ContextHelper.createContext({
    id: InteractiveContextId,
    description: "Simplified interactive communication (EventBus removed) - provides auto-approval functionality",
    dataSchema: InteractiveContextSchema,
    initialData: {
      pendingApprovals: [],
      approvalHistory: [],
      pendingRequests: []
    },
    promptCtx: {
      workflow: `
## SIMPLIFIED INTERACTION WORKFLOW (EventBus Removed)
1. Actions are auto-approved for demonstration purposes
2. User input requests return default values
3. All interactions are logged for tracking
`,
      status: `Interactive Status: Simplified mode (auto-approval)`,
      guideline: `
## SIMPLIFIED INTERACTION GUIDELINES
- **Auto-approval**: All actions are automatically approved
- **Default responses**: User input requests return sensible defaults
- **Logging**: All interactions are logged for reference
- Use interaction_management and request_user_input tools as before
`,
      examples: `
## EXAMPLES (Auto-Approval Mode)
Request approval: interaction_management({command: 'request_approval', actionType: 'file_write', description: 'Create new file'})
Request input: request_user_input({prompt: 'Enter filename', inputType: 'text'})
`
    },
    renderPromptFn: (data: z.infer<typeof InteractiveContextSchema>): PromptCtx => {
      const historyCount = data.approvalHistory?.length || 0;
      
      return {
        workflow: `
## SIMPLIFIED INTERACTION WORKFLOW (EventBus Removed)
1. Actions are auto-approved for demonstration purposes  
2. User input requests return default values
3. All interactions are logged for tracking
`,
        status: `Interactive Status: Simplified mode - ${historyCount} interactions completed`,
        guideline: `
## SIMPLIFIED INTERACTION GUIDELINES
- **Auto-approval**: All actions are automatically approved
- **Default responses**: User input requests return sensible defaults
- **Logging**: All interactions are logged for reference
`,
        examples: `
## EXAMPLES (Auto-Approval Mode)
Request approval: interaction_management({command: 'request_approval', actionType: 'file_write', description: 'Create new file'})
Request input: request_user_input({prompt: 'Enter filename', inputType: 'text'})
`
      };
    },
    toolSetFn: () => ({
      name: "SimplifiedInteractiveTools",
      description: "Simplified tools for interaction management (auto-approval mode)",
      tools: [InteractionManagementTool, RequestUserInputTool],
      active: true,
      source: "local"
    }),
    install: async (agent: IAgent) => {
      logger.info('Installing Simplified Interactive Context (EventBus removed)');
      
      // Add simplified requestApproval method
      (agent as any).requestApproval = async function(request: any): Promise<any> {
        logger.info(`Auto-approving request: ${JSON.stringify(request)}`);
        return {
          success: true,
          approved: true,
          decision: 'accept',
          message: 'Auto-approved (EventBus removed)'
        };
      };
      
      logger.info('Simplified Interactive Context installed');
    }
  });
}

// 导出默认实例
export const InteractiveContext = createInteractiveContext(); 