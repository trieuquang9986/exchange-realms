import type { BarIssue } from "./validation";
import type { SessionStore } from "./ingest";
import type { DailyBar, SessionDate } from "./types";

/** In-memory SessionStore used by tests. commitSession swaps whole days, so it is atomic and idempotent. */
export class MemorySessionStore implements SessionStore {
  sessions = new Map<SessionDate, DailyBar[]>();
  errors: { date: SessionDate; detail: BarIssue[] | string }[] = [];
  /** Test hook: make the next commit throw, simulating a database failure. */
  failNextCommit = false;

  async commitSession(date: SessionDate, bars: DailyBar[]): Promise<void> {
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new Error("simulated commit failure");
    }
    this.sessions.set(
      date,
      bars.map((b) => ({ ...b })),
    );
  }

  async recordError(date: SessionDate, detail: BarIssue[] | string): Promise<void> {
    this.errors.push({ date, detail });
  }

  snapshot(): string {
    return JSON.stringify([...this.sessions.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
}
