import express, { Request, Response } from "express";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Create an MCP server
const server = new McpServer({
  name: "test-mcp-server",
  version: "1.0.0"
});

// Add basic tools for testing
server.tool("add",
  { a: z.number(), b: z.number() },
  async ({ a, b }) => {
    console.error("[Server] Processing add tool request:", { a, b });
    return {
      content: [{ type: "text", text: String(a + b) }]
    };
  }
);

server.tool("echo",
  { message: z.string() },
  async ({ message }) => {
    console.error("[Server] Processing echo tool request:", { message });
    return {
      content: [{ type: "text", text: message }]
    };
  }
);

server.tool("test_search",
  { query: z.string(), limit: z.number().optional() },
  async ({ query, limit }) => {
    console.error("[Server] Processing test_search tool request:", { query, limit });
    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify({ 
          results: [`Result for: ${query}`, `Found ${limit || 5} items`] 
        }) 
      }]
    };
  }
);

// Add a sample resource
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

// Sample documentation resource
server.resource(
  "docs",
  new ResourceTemplate("docs://{topic}", { list: undefined }),
  async (uri, { topic }) => {
    console.error("[Server] Processing docs resource request:", { uri: uri.href, topic });
    return {
      contents: [{
        uri: uri.href,
        text: `Documentation for ${topic}: This is sample documentation content for testing purposes.`
      }]
    };
  }
);

// Add a sample prompt template
server.prompt(
  "analyze-code",
  { code: z.string(), language: z.string().optional() },
  ({ code, language }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please analyze this ${language || 'code'}:\n\n${code}`
      }
    }]
  })
);

// Check if running in stdio mode
const isStdioMode = process.argv.includes('--stdio');

if (isStdioMode) {
  // stdio mode: use standard input/output
  console.error("[Server] Starting in stdio mode");
  
  // Create stdio transport
  const stdioTransport = new StdioServerTransport();
  
  // Connect to server
  server.connect(stdioTransport).catch(error => {
    console.error("[Server] Error connecting stdio transport:", error);
    process.exit(1);
  });
  
  console.error("[Server] Stdio server ready");
} else {
  // SSE mode: start Express server
  const app = express();

  // Track transports by session ID
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
} 