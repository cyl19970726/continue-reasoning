import { ToolExecutionOptions } from "ai";
import { Tool } from "../type";
import { z } from "zod";
import { SystemContext } from "../type";


export class WhetherTool implements Tool<z.ZodObject<{city: z.ZodString}> , string>{
    name(): string {
        return "whether-tool";
    }
    description(): string{
        return "Query the weather for every city";
    }

    parameters = z.object({
        city: z.string()
    });
    
    async execute(parameters: z.infer<typeof this.parameters>, options?: ToolExecutionOptions, systemContext?: SystemContext<any>): Promise<string>{

        
        console.log("toolCallId:",options?.toolCallId);
        console.log("messages:",options?.messages);

        return `the weather at ${parameters.city} is sunny`;
    }
}
