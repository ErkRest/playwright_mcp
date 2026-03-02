import { z } from "zod";
import { ToolRegistry } from "./tools";

const initializeSchema = z.object({
  protocolVersion: z.string().optional(),
  clientInfo: z
    .object({
      name: z.string().optional(),
      version: z.string().optional()
    })
    .optional()
});

const toolCallSchema = z.object({
  name: z.string().min(1),
  arguments: z.unknown().optional()
});

export class McpServer {
  private readonly toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  async handle(method: string, params: unknown): Promise<unknown> {
    switch (method) {
      case "initialize":
        initializeSchema.parse(params ?? {});
        return {
          protocolVersion: "2025-06-18",
          serverInfo: {
            name: "playwright-mcp-server",
            version: "0.1.0"
          },
          capabilities: {
            tools: {}
          }
        };

      case "tools/list":
        return {
          tools: this.toolRegistry.list()
        };

      case "tools/call": {
        const payload = toolCallSchema.parse(params ?? {});
        const data = await this.toolRegistry.call(payload.name, payload.arguments);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data)
            }
          ],
          structuredContent: data
        };
      }

      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }
}
