import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PLAYWRIGHT_HEADLESS: z
    .string()
    .optional()
    .transform((value) => value !== "false"),
  ALLOWED_HOSTS: z.string().optional(),
  SESSION_TTL_MS: z.coerce.number().int().positive().default(15 * 60 * 1000)
});

const parsed = configSchema.parse(process.env);

const allowedHosts = parsed.ALLOWED_HOSTS
  ? parsed.ALLOWED_HOSTS.split(",").map((host) => host.trim()).filter(Boolean)
  : [];

export const config = {
  port: parsed.PORT,
  headless: parsed.PLAYWRIGHT_HEADLESS,
  allowedHosts,
  sessionTtlMs: parsed.SESSION_TTL_MS
};
