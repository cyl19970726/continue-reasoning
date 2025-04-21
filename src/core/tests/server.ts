import express, { Request, Response } from "express";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z, ZodRawShape } from "zod";
import bodyParser from "body-parser";

// Create an MCP server
const server = new McpServer({
  name: "example-server",
  version: "1.0.0"
});

// Add an addition tool
server.tool("add",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => {
    console.error("[Server] Processing add tool request:", { a, b });
    return {
      content: [{ type: "text", text: String(a + b) }]
    };
  }
);

// complex arguments tool
server.tool("complex-args",
  { a: z.number(), b: z.object({ c: z.number(), d: z.number() }) },
  async ({ a, b }) => {
    console.error("[Server] Processing complex-args tool request:", { a, b });
    return {
      content: [{ type: "text", text: String(a + b.c + b.d) }]
    };
  }
);


export const ToolDefinition = z.object({
  name: z.string(),
  paramsSchema: z.record(z.any()),
  cb: z.function()
    .args(z.record(z.any()))
    .returns(z.promise(z.object({
      content: z.array(z.object({
        type: z.literal("text"),
        text: z.string()
      }))
    })))
});

export const ToolDefinitionType = ToolDefinition._type


// Register tool for dynamically registering new tools
server.tool("register_tool",
  {
    newTool: ToolDefinition
  },
  async ({ newTool }) => {
    try {
      // add the new tool into mcp server
      // IMPORTANT: The SDK's server.tool method expects a concrete Zod schema,
      // not z.record(z.any()). We might need to adjust how dynamic tools are handled
      // or the schema here if this causes issues.
      // For now, assuming the SDK handles z.record(z.any()) appropriately for params.
      // Also, the callback (cb) type might need careful handling/casting depending on SDK usage.
      server.tool(newTool.name, newTool.paramsSchema as any, newTool.cb as any);
      
      return {
        content: [{
          type: "text",
          text: `Successfully registered tool: ${newTool.name}`
        }]
      };
    } catch (error: any) {
      return {
        content: [{
          type: "text",
          text: `Failed to register tool: ${error.message}`
        }],
        isError: true
      };
    }
  }
);

// Add a dynamic greeting resource
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => {
    console.error("[Server] Processing greeting resource request:", { uri: uri.href, name });
    return {
      contents: [{
        uri: uri.href,
        text: `Hello, ${name}!`
      }]
    };
  }
);

server.resource("test",
  new ResourceTemplate("test://{name}", { list: undefined }),
  async (uri, { name }) => {
    return {
      contents: [{ uri: uri.href, text: `Hello, ${name}!` }]
    };
  }
);

server.prompt(
  "review-code",
  { code: z.string() },
  ({ code }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please review this code:\n\n${code}`
      }
    }]
  })
);

const app = express();
// app.use(bodyParser.json());  // Add body-parser middleware

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: {[sessionId: string]: SSEServerTransport} = {};

app.get("/sse", async (_: Request, res: Response) => {
  try {
    console.error("[Server] New SSE connection request");
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;
    
    res.on("close", () => {
      console.error("[Server] SSE connection closed for session:", transport.sessionId);
      delete transports[transport.sessionId];
    });

    await server.connect(transport);
    console.error("[Server] SSE connection established for session:", transport.sessionId);
  } catch (error) {
    console.error("[Server] Error establishing SSE connection:", error);
    // Avoid sending response headers again if already sent by SSEServerTransport error handling
    if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
    }
  }
});

app.post("/messages", async (req: Request, res: Response) => {
  try {
    const sessionId = req.query.sessionId as string;
    const transport = transports[sessionId];
    
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      console.error("[Server] No transport found for sessionId:", sessionId);
      res.status(400).send('No transport found for sessionId');
    }
  } catch (error) {
    console.error("[Server] Error handling message:", error);
     if (!res.headersSent) {
        res.status(500).send('Internal Server Error');
    }
  }
});

const port = 3001;
app.listen(port, () => {
  console.error(`[Server] SSE server listening on port ${port}`);
}); 