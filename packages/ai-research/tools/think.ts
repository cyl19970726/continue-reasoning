import z from "zod";
import { ITool, ToolCallDefinition } from "../interfaces";

export class ThinkTool implements ITool {
    name = 'think';
    description = '用于记录思考过程和推理步骤，可以进行复杂的工具调用分析，并给出下一步的行动计划';
    params = z.object({ 
      thought: z.string().describe('当前的思考内容，包括问题分析、执行计划或推理过程')
    });
  
    async execute_func(params: { thought: string }) {
      // 思考工具不需要实际执行，只是记录思考过程
      return {
        thought: params.thought,
        timestamp: new Date().toISOString(),
        action: 'thinking_recorded'
      };
    }
  
    toCallDefinition(): ToolCallDefinition {
      return {
        type: 'function',
        name: this.name,
        description: this.description,
        paramSchema: this.params,
        strict: false
      };
    }
  }