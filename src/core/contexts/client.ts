// import { CliClient } from "./client/cli";
import { MessageSchema, Message, IAgent, IClient, IContext, ITool, ToolCallDefinitionSchema, ClientSendFnType } from "../interfaces";
import { z } from "zod";
import readline from "readline";
import { IMemoryManager } from "../interfaces";
import { createTool, ContextHelper,render } from '../utils';
import { logger } from "../utils/logger";
import { SystemToolNames } from "./index";

// 先声明工具名称常量
export const cliResponseToolId = "cli-response-tool";
export const cliResponseToolName = "cli-response-tool";

// 客户端上下文数据 Schema
const ClientContextDataSchema = z.object({
    clientId: z.string().describe("the unique client id"),
    userId: z.string().describe("the unique userId"),
    messagesHistory: z.array(MessageSchema).describe("the history messages of the user at this client"),
    responseToolName: z.string().describe("Generate the response to the user using the responseTool if you think is necessary"),
    incomingMessages: z.optional(MessageSchema).describe("the incoming messages from the user to the client"),
});
type ClientContextData = z.infer<typeof ClientContextDataSchema>;
export const ClientContextId = "client-context";

// 添加客户端内存 Schema
const ClientMemorySchema = z.object({
    clientId: z.string(),
    userId: z.string(),
    messagesHistory: z.array(MessageSchema),
    metadata: z.record(z.unknown()).optional()
});

export const ClientContext = ContextHelper.createContext({
    id: ClientContextId,
    description: "Stores the context for CLI-based user interactions, including message history and the latest incoming user message. Guides the agent to analyze user input, maintain conversation state, and determine when to respond or invoke tools in a command-line environment.",
    dataSchema: ClientContextDataSchema,
    initialData: {
        clientId: "cli-client",
        userId: "admin01",
        messagesHistory: [],
        responseToolName: cliResponseToolName,
        incomingMessages: undefined
    },
    renderPromptFn: (data: z.infer<typeof ClientContextDataSchema>) => {
        // Format message history (chronological)
        const history = data.messagesHistory.map(msg => 
            `  [${msg.timestamp}] ${msg.role}: ${msg.text}`
        ).join("\n");

        // Format incoming message if present
        const incoming = data.incomingMessages 
            ? `
        New Incoming Message from User [${data.incomingMessages.timestamp}]:
        ${data.incomingMessages.text}
        `
            : `
        No new incoming message - this means the user is waiting or the previous request has been completed.
        If you've already responded to the last user message and there are no pending tasks, call ${SystemToolNames.stopResponse}.
        `;

        // Construct the prompt
        const clientContextPrompt = `
        ------ CLI Client Interaction Context (${data.clientId} / ${data.userId}) ------
        Your goal is to fulfill the user's requests and respond appropriately via the command line.

${incoming}

        Conversation History:
${history || "  (No message history yet)"}

        Instructions:
        1.  Analyze the 'New Incoming Message' and 'Conversation History' to understand the user's latest request or context.
        2.  Decide if any tools (besides the response tool) are needed to fulfill the request. Call necessary sync or async tools.
        3.  **Only if a direct response to the user is required *after* fulfilling the request (or if clarification is needed), use the tool named '${data.responseToolName}'.**
        4.  Avoid responding if you are performing background tasks (using async tools) unless providing a status update.
        5.  Keep responses concise and relevant to the CLI environment.
        6.  IMPORTANT: After responding to a simple user request (like greetings, simple questions, or acknowledgments):
            - Call the '${SystemToolNames.stopResponse}' tool to prevent unnecessary processing
            - Don't call tools repeatedly if you've already responded to the current request
            - Always check if there's a new incoming message before responding again
        
        Simple Request Flow:
        1. User message received → You analyze and respond → Call ${SystemToolNames.stopResponse}
        2. Wait for next user message (system will pause until next input)
        `;
        
        // Note: We are not rendering the raw 'data' object anymore, just the formatted parts.
        return clientContextPrompt; 
    },
    toolSetFn: () => {
        return {
            name: '',
            description: '',
            tools: [],
            active: true
        }
    }
});
// 工具输入输出 Schema
export const cliResponseToolInputSchema = z.object({
    message: z.string(),
});
export const cliResponseToolOutputSchema = z.object({
    success: z.boolean(),
    text: z.string(),
});

// 使用工厂函数创建CLI响应工具
export const cliResponseTool = createTool({
  id: cliResponseToolId,
  name: cliResponseToolName,
  description: "This tool is used to respond to the user at the cli client",
  inputSchema: cliResponseToolInputSchema,
  outputSchema: cliResponseToolOutputSchema,
  async: false,
  execute: (parameters, agent) => {
    console.log("=========== \n Agent: " + parameters.message + "\n ============ ");
    
    if (!agent) {
      return {
        success: false,
        text: parameters.message
      };
    }
    
    try {
      // 使用上下文辅助函数获取客户端上下文
      const clientContext = ContextHelper.findContext(agent, ClientContextId);
      
      // 更新上下文数据
      const currentData = clientContext.getData();
      if (currentData.incomingMessages) {
        // 将当前的输入消息添加到历史记录
        ContextHelper.updateContextData(clientContext, {
          messagesHistory: [...currentData.messagesHistory, currentData.incomingMessages],
          incomingMessages: undefined
        });
      }
      
      // 添加代理响应到历史记录
      ContextHelper.updateContextData(clientContext, {
        messagesHistory: [
          ...clientContext.getData().messagesHistory,
          {
            role: "agent",
            text: parameters.message,
            timestamp: new Date().toISOString()
          }
        ]
      });
    
      logger.info(`Agent response sent: ${parameters.message.substring(0, 100)}${parameters.message.length > 100 ? '...' : ''}`);
      return {
        success: true,
        text: parameters.message
      };
    } catch (error) {
      logger.error("CLI response tool execution error:", error);
      return {
        success: false,
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
});

export const cliClientId = "cliClient";
export class CliClient implements IClient<typeof cliResponseToolInputSchema, typeof cliResponseToolOutputSchema> {
    id: string;
    name: string;
    description: string;
    input: {
        subscribe: (sendfn: ClientSendFnType) => void;
    };
    output: {
        paramsSchema: typeof cliResponseToolOutputSchema;
        responseTool?: ITool<typeof cliResponseToolInputSchema, typeof cliResponseToolOutputSchema, IAgent>;
        dealResponseResult?: (response: z.infer<typeof cliResponseToolOutputSchema>, context: IContext<any>) => void;
    };

    constructor() {
        this.id = cliClientId;
        this.name = cliClientId;
        this.description = "A command line interface client";
        this.input = {
            subscribe: (sendfn) => {
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                const controller = new AbortController();

                const processInput = async () => {
                    while (!controller.signal.aborted) {
                        const question = await new Promise<string>((resolve) => {
                            rl.question("> ", (answer) => {
                                resolve(answer);
                            });
                        });

                        if (question.toLowerCase() === "exit") {
                            break;
                        }

                        console.log("User:", question);
                        sendfn(
                            {
                                clientId: ClientContextId,
                                userId: "admin01",
                            },
                            {
                                role: "user",
                                text: question,
                                timestamp: new Date().toISOString(),
                            }
                        );
                    }
                    rl.close();
                };

                processInput();

                return () => {
                    controller.abort();
                    rl.close();
                };
            }
        };
        this.output = {
            paramsSchema: cliResponseToolOutputSchema,
            responseTool: cliResponseTool,
        };
    }
}