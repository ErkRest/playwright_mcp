import { Browser, BrowserContext, chromium, Page } from "playwright";
import { config } from "../config";
import { SessionStore } from "../domain/sessions/sessionStore";
import { AppError } from "../shared/errors";

interface SessionRuntime {
  context: BrowserContext;
  page: Page;
}

type NavigateWaitUntil = "domcontentloaded" | "load" | "networkidle" | "commit";

const ensureAllowedUrl = (url: string): void => {
  let target: URL;

  try {
    target = new URL(url);
  } catch {
    throw new AppError("Invalid URL", "INVALID_URL", 400);
  }

  if (!["http:", "https:"].includes(target.protocol)) {
    throw new AppError("Only http/https URLs are allowed", "INVALID_PROTOCOL", 400);
  }

  if (target.hostname === "localhost" || target.hostname === "127.0.0.1") {
    throw new AppError("Access to localhost is blocked", "HOST_BLOCKED", 403);
  }

  if (config.allowedHosts.length > 0 && !config.allowedHosts.includes(target.hostname)) {
    throw new AppError("Host is not allowlisted", "HOST_BLOCKED", 403, {
      host: target.hostname,
      allowedHosts: config.allowedHosts
    });
  }
};

export class BrowserManager {
  private browser: Browser | null = null;
  private readonly sessions = new SessionStore();
  private readonly runtime = new Map<string, SessionRuntime>();

  async init(): Promise<void> {
    if (this.browser) {
      return;
    }

    this.browser = await chromium.launch({
      headless: config.headless
    });
  }

  private assertBrowser(): Browser {
    if (!this.browser) {
      throw new AppError("Browser is not initialized", "BROWSER_NOT_READY", 500);
    }
    return this.browser;
  }

  async createSession(): Promise<{ sessionId: string }> {
    const browser = this.assertBrowser();
    const session = this.sessions.create();
    const context = await browser.newContext();
    const page = await context.newPage();

    this.runtime.set(session.id, { context, page });

    return { sessionId: session.id };
  }

  async navigate(
    sessionId: string,
    url: string,
    waitUntil: NavigateWaitUntil = "domcontentloaded",
    timeoutMs = 30_000
  ): Promise<{ url: string; title: string }> {
    this.collectExpiredSessions().catch(() => undefined);
    ensureAllowedUrl(url);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    await target.page.goto(url, {
      waitUntil,
      timeout: timeoutMs
    });

    this.sessions.touch(sessionId);

    return {
      url: target.page.url(),
      title: await target.page.title()
    };
  }

  async screenshot(
    sessionId: string,
    fullPage = false
  ): Promise<{ mimeType: string; data: string }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    const buffer = await target.page.screenshot({
      type: "png",
      fullPage,
      timeout: 30_000
    });

    this.sessions.touch(sessionId);

    return {
      mimeType: "image/png",
      data: buffer.toString("base64")
    };
  }

  async click(
    sessionId: string,
    selector: string,
    timeoutMs = 30_000
  ): Promise<{ clicked: true; selector: string }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    await target.page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
    await target.page.click(selector, { timeout: timeoutMs });
    this.sessions.touch(sessionId);

    return { clicked: true, selector };
  }

  async fill(
    sessionId: string,
    selector: string,
    value: string,
    timeoutMs = 30_000
  ): Promise<{ filled: true; selector: string }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    await target.page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
    await target.page.fill(selector, value, { timeout: timeoutMs });
    this.sessions.touch(sessionId);

    return { filled: true, selector };
  }

  async queryText(
    sessionId: string,
    selector: string,
    timeoutMs = 30_000
  ): Promise<{ selector: string; text: string | null }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    await target.page.waitForSelector(selector, { timeout: timeoutMs });
    const text = await target.page.textContent(selector, { timeout: timeoutMs });
    this.sessions.touch(sessionId);

    return { selector, text };
  }

  async frameQueryText(
    sessionId: string,
    frameName: string,
    selector: string,
    timeoutMs = 30_000
  ): Promise<{ frameName: string; selector: string; text: string | null }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    const frame = target.page.frame({ name: frameName });
    if (!frame) {
      throw new AppError("Frame not found", "FRAME_NOT_FOUND", 404, { frameName });
    }

    await frame.waitForSelector(selector, { timeout: timeoutMs });
    const text = await frame.textContent(selector, { timeout: timeoutMs });
    this.sessions.touch(sessionId);

    return { frameName, selector, text };
  }

  async evaluate(
    sessionId: string,
    expression: string
  ): Promise<{ value: unknown }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    const value = await target.page.evaluate((source: string) => {
      return (0, eval)(source);
    }, expression);

    this.sessions.touch(sessionId);

    return { value };
  }

  async waitFor(
    sessionId: string,
    selector: string,
    timeoutMs = 30_000,
    state: "attached" | "detached" | "visible" | "hidden" = "visible"
  ): Promise<{ ready: true; selector: string; state: string }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    await target.page.waitForSelector(selector, { timeout: timeoutMs, state });
    this.sessions.touch(sessionId);

    return { ready: true, selector, state };
  }

  async press(
    sessionId: string,
    selector: string,
    key: string,
    timeoutMs = 30_000
  ): Promise<{ pressed: true; selector: string; key: string }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    await target.page.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
    await target.page.focus(selector);
    await target.page.keyboard.press(key);
    this.sessions.touch(sessionId);

    return { pressed: true, selector, key };
  }

  async frameClick(
    sessionId: string,
    frameName: string,
    selector: string,
    timeoutMs = 30_000
  ): Promise<{ clicked: true; frameName: string; selector: string }> {
    this.collectExpiredSessions().catch(() => undefined);

    const target = this.runtime.get(sessionId);
    if (!target) {
      throw new AppError("Session not found", "SESSION_NOT_FOUND", 404);
    }

    const frame = target.page.frame({ name: frameName });
    if (!frame) {
      throw new AppError("Frame not found", "FRAME_NOT_FOUND", 404, { frameName });
    }

    await frame.waitForSelector(selector, { timeout: timeoutMs, state: "visible" });
    await frame.click(selector, { timeout: timeoutMs });
    this.sessions.touch(sessionId);

    return { clicked: true, frameName, selector };
  }

  async closeSession(sessionId: string): Promise<void> {
    const target = this.runtime.get(sessionId);
    if (!target) {
      return;
    }

    await target.page.close();
    await target.context.close();
    this.runtime.delete(sessionId);
    this.sessions.delete(sessionId);
  }

  async collectExpiredSessions(): Promise<void> {
    const expired = this.sessions.expired(config.sessionTtlMs);
    for (const session of expired) {
      await this.closeSession(session.id);
    }
  }

  async dispose(): Promise<void> {
    const ids = Array.from(this.runtime.keys());
    for (const sessionId of ids) {
      await this.closeSession(sessionId);
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
