import Router from "@koa/router";
import { z } from "zod";
import { McpServer } from "../mcp/server";
import { normalizeError } from "../shared/errors";
import { jsonRpcFailure, jsonRpcSuccess, JsonRpcRequest } from "../types/mcp";

const requestSchema: z.ZodType<JsonRpcRequest> = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
});

export const createMcpHttpRouter = (mcpServer: McpServer): Router => {
  const router = new Router();

  router.post("/mcp", async (ctx) => {
    const parsed = requestSchema.safeParse(ctx.request.body);
    if (!parsed.success) {
      ctx.status = 400;
      ctx.body = jsonRpcFailure(null, -32600, "Invalid Request", parsed.error.flatten());
      return;
    }

    const request = parsed.data;

    try {
      const result = await mcpServer.handle(request.method, request.params);
      ctx.status = 200;
      ctx.body = jsonRpcSuccess(request.id ?? null, result);
    } catch (error) {
      const normalized = normalizeError(error);
      ctx.status = normalized.status;
      ctx.body = jsonRpcFailure(
        request.id ?? null,
        -32000,
        normalized.message,
        normalized.details ?? normalized.code
      );
    }
  });

  return router;
};
