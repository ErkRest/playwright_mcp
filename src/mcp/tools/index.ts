import { z } from "zod";
import { config } from "../../config";
import { BrowserManager } from "../../playwright/browserManager";
import { AppError } from "../../shared/errors";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (argumentsValue: unknown) => Promise<unknown>;
}

export const createTools = (browserManager: BrowserManager): ToolDefinition[] => {
  const newSessionInput = z.object({}).strict();
  const navigateInput = z.object({
    sessionId: z.string().min(1),
    url: z.string().min(1),
    waitUntil: z.enum(["domcontentloaded", "load", "networkidle", "commit"]).optional(),
    timeoutMs: z.number().int().positive().optional()
  });
  const screenshotInput = z.object({
    sessionId: z.string().min(1),
    fullPage: z.boolean().optional()
  });
  const clickInput = z.object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  });
  const fillInput = z.object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    value: z.string(),
    timeoutMs: z.number().int().positive().optional()
  });
  const queryTextInput = z.object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  });
  const frameQueryTextInput = z.object({
    sessionId: z.string().min(1),
    frameName: z.string().min(1),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  });
  const evaluateInput = z.object({
    sessionId: z.string().min(1),
    expression: z.string().min(1)
  });
  const waitForInput = z.object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional(),
    state: z.enum(["attached", "detached", "visible", "hidden"]).optional()
  });
  const pressInput = z.object({
    sessionId: z.string().min(1),
    selector: z.string().min(1),
    key: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  });
  const frameClickInput = z.object({
    sessionId: z.string().min(1),
    frameName: z.string().min(1),
    selector: z.string().min(1),
    timeoutMs: z.number().int().positive().optional()
  });
  const closeSessionInput = z.object({
    sessionId: z.string().min(1)
  });

  return [
    {
      name: "browser_new_session",
      description: "Create a new isolated Playwright browser session",
      inputSchema: z.toJSONSchema(newSessionInput),
      execute: async (argumentsValue) => {
        newSessionInput.parse(argumentsValue ?? {});
        return browserManager.createSession();
      }
    },
    {
      name: "browser_navigate",
      description: "Navigate current session page to a target URL",
      inputSchema: z.toJSONSchema(navigateInput),
      execute: async (argumentsValue) => {
        const args = navigateInput.parse(argumentsValue ?? {});
        return browserManager.navigate(args.sessionId, args.url, args.waitUntil, args.timeoutMs);
      }
    },
    {
      name: "browser_screenshot",
      description: "Take screenshot of current session page and return a download URL",
      inputSchema: z.toJSONSchema(screenshotInput),
      execute: async (argumentsValue) => {
        const args = screenshotInput.parse(argumentsValue ?? {});
        const shot = await browserManager.screenshot(args.sessionId, args.fullPage ?? false);
        const downloadPath = `/mcp/screenshot/${shot.id}`;
        return {
          mimeType: shot.mimeType,
          fileId: shot.id,
          downloadPath,
          downloadUrl: `${config.publicBaseUrl}${downloadPath}`,
          expiresAt: new Date(shot.expiresAt).toISOString()
        };
      }
    },
    {
      name: "browser_fill",
      description: "Fill an input/textarea element by CSS selector",
      inputSchema: z.toJSONSchema(fillInput),
      execute: async (argumentsValue) => {
        const args = fillInput.parse(argumentsValue ?? {});
        return browserManager.fill(args.sessionId, args.selector, args.value, args.timeoutMs);
      }
    },
    {
      name: "dom_query_text",
      description: "Read text content of an element by CSS selector",
      inputSchema: z.toJSONSchema(queryTextInput),
      execute: async (argumentsValue) => {
        const args = queryTextInput.parse(argumentsValue ?? {});
        return browserManager.queryText(args.sessionId, args.selector, args.timeoutMs);
      }
    },
    {
      name: "frame_query_text",
      description: "Read text content inside target frame by CSS selector",
      inputSchema: z.toJSONSchema(frameQueryTextInput),
      execute: async (argumentsValue) => {
        const args = frameQueryTextInput.parse(argumentsValue ?? {});
        return browserManager.frameQueryText(
          args.sessionId,
          args.frameName,
          args.selector,
          args.timeoutMs
        );
      }
    },
    {
      name: "browser_evaluate",
      description: "Evaluate a JavaScript expression in page context",
      inputSchema: z.toJSONSchema(evaluateInput),
      execute: async (argumentsValue) => {
        const args = evaluateInput.parse(argumentsValue ?? {});
        return browserManager.evaluate(args.sessionId, args.expression);
      }
    },
    {
      name: "browser_wait_for",
      description: "Wait for a selector to reach target state",
      inputSchema: z.toJSONSchema(waitForInput),
      execute: async (argumentsValue) => {
        const args = waitForInput.parse(argumentsValue ?? {});
        return browserManager.waitFor(
          args.sessionId,
          args.selector,
          args.timeoutMs,
          args.state
        );
      }
    },
    {
      name: "browser_press",
      description: "Focus selector and press a keyboard key",
      inputSchema: z.toJSONSchema(pressInput),
      execute: async (argumentsValue) => {
        const args = pressInput.parse(argumentsValue ?? {});
        return browserManager.press(args.sessionId, args.selector, args.key, args.timeoutMs);
      }
    },
    {
      name: "frame_click",
      description: "Click an element inside target frame by CSS selector",
      inputSchema: z.toJSONSchema(frameClickInput),
      execute: async (argumentsValue) => {
        const args = frameClickInput.parse(argumentsValue ?? {});
        return browserManager.frameClick(
          args.sessionId,
          args.frameName,
          args.selector,
          args.timeoutMs
        );
      }
    },
    {
      name: "browser_close_session",
      description: "Close and cleanup a Playwright session",
      inputSchema: z.toJSONSchema(closeSessionInput),
      execute: async (argumentsValue) => {
        const args = closeSessionInput.parse(argumentsValue ?? {});
        await browserManager.closeSession(args.sessionId);
        return { closed: true };
      }
    }
  ];
};

export class ToolRegistry {
  private readonly tools: ToolDefinition[];

  constructor(tools: ToolDefinition[]) {
    this.tools = tools;
  }

  list(): Array<Pick<ToolDefinition, "name" | "description" | "inputSchema">> {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    }));
  }

  async call(name: string, argumentsValue: unknown): Promise<unknown> {
    const target = this.tools.find((tool) => tool.name === name);

    if (!target) {
      throw new AppError(`Tool not found: ${name}`, "TOOL_NOT_FOUND", 404);
    }

    return target.execute(argumentsValue);
  }
}
