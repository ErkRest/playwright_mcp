import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { Browser, BrowserContext, chromium, Page } from "playwright";
import { config } from "../config";
import { SessionStore } from "../domain/sessions/sessionStore";
import { AppError } from "../shared/errors";

interface SessionRuntime {
  context: BrowserContext;
  page: Page;
}

interface ScreenshotEntry {
  id: string;
  filePath: string;
  mimeType: string;
  createdAt: number;
  expiresAt: number;
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
  private readonly screenshots = new Map<string, ScreenshotEntry>();

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
  ): Promise<{ id: string; mimeType: string; filePath: string; expiresAt: number }> {
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

    const directory = await this.ensureScreenshotDir();
    const id = randomBytes(16).toString("hex");
    const filePath = path.join(directory, `${id}.png`);
    await fs.writeFile(filePath, buffer);

    const now = Date.now();
    const entry: ScreenshotEntry = {
      id,
      filePath,
      mimeType: "image/png",
      createdAt: now,
      expiresAt: now + config.screenshotTtlMs
    };
    this.screenshots.set(id, entry);

    this.sessions.touch(sessionId);
    await this.pruneExpiredScreenshots();

    return {
      id: entry.id,
      mimeType: entry.mimeType,
      filePath: entry.filePath,
      expiresAt: entry.expiresAt
    };
  }

  async getScreenshotFile(id: string): Promise<{ filePath: string; mimeType: string }> {
    await this.pruneExpiredScreenshots();

    const entry = this.screenshots.get(id);
    if (!entry) {
      throw new AppError("Screenshot not found", "SCREENSHOT_NOT_FOUND", 404);
    }

    if (Date.now() >= entry.expiresAt) {
      await this.deleteScreenshot(entry);
      this.screenshots.delete(id);
      throw new AppError("Screenshot expired", "SCREENSHOT_EXPIRED", 404);
    }

    return { filePath: entry.filePath, mimeType: entry.mimeType };
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

    await this.disposeScreenshots();

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async ensureScreenshotDir(): Promise<string> {
    await fs.mkdir(config.screenshotDir, { recursive: true });
    return config.screenshotDir;
  }

  private async pruneExpiredScreenshots(): Promise<void> {
    const now = Date.now();
    const expired = Array.from(this.screenshots.values()).filter(
      (entry) => now >= entry.expiresAt
    );
    if (expired.length === 0) {
      return;
    }

    await Promise.all(expired.map((entry) => this.deleteScreenshot(entry)));
    for (const entry of expired) {
      this.screenshots.delete(entry.id);
    }
  }

  private async deleteScreenshot(entry: ScreenshotEntry): Promise<void> {
    try {
      await fs.unlink(entry.filePath);
    } catch {
      // Ignore missing files; metadata will be cleared by caller.
    }
  }

  private async disposeScreenshots(): Promise<void> {
    const entries = Array.from(this.screenshots.values());
    await Promise.all(entries.map((entry) => this.deleteScreenshot(entry)));
    this.screenshots.clear();
  }
}
