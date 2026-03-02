import Koa from "koa";
import bodyParser from "koa-bodyparser";
import { config } from "./config";
import { McpServer } from "./mcp/server";
import { createTools, ToolRegistry } from "./mcp/tools";
import { BrowserManager } from "./playwright/browserManager";
import { logger } from "./shared/logger";
import { createMcpHttpRouter } from "./transport/mcpHttpRouter";

const bootstrap = async (): Promise<void> => {
  const app = new Koa();
  const browserManager = new BrowserManager();
  await browserManager.init();

  const toolRegistry = new ToolRegistry(createTools(browserManager));
  const mcpServer = new McpServer(toolRegistry);
  const router = createMcpHttpRouter(mcpServer);

  app.use(bodyParser({ enableTypes: ["json"] }));
  app.use(router.routes());
  app.use(router.allowedMethods());

  const server = app.listen(config.port, () => {
    logger.info(`MCP server listening on http://localhost:${config.port}/mcp`);
  });

  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down MCP server...");
    server.close();
    await browserManager.dispose();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    shutdown().catch((error) => {
      logger.error("Failed to shutdown gracefully", error);
      process.exit(1);
    });
  });

  process.on("SIGTERM", () => {
    shutdown().catch((error) => {
      logger.error("Failed to shutdown gracefully", error);
      process.exit(1);
    });
  });
};

bootstrap().catch((error) => {
  logger.error("Bootstrap failed", error);
  process.exit(1);
});
