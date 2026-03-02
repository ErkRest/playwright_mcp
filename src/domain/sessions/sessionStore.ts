import { randomUUID } from "node:crypto";

export interface SessionRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, SessionRecord>();

  create(): SessionRecord {
    const now = Date.now();
    const session: SessionRecord = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now
    };
    this.sessions.set(session.id, session);
    return session;
  }

  touch(sessionId: string): void {
    const target = this.sessions.get(sessionId);
    if (!target) {
      return;
    }

    target.updatedAt = Date.now();
    this.sessions.set(sessionId, target);
  }

  get(sessionId: string): SessionRecord | undefined {
    return this.sessions.get(sessionId);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  expired(ttlMs: number): SessionRecord[] {
    const now = Date.now();
    return Array.from(this.sessions.values()).filter((session) => now - session.updatedAt > ttlMs);
  }
}
