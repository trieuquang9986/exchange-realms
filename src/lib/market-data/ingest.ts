import { validateBars } from "./validation.ts";
import type { BarIssue } from "./validation.ts";
import type { DailyBar, MarketDataProvider, SessionDate } from "./types.ts";

/** Storage the ingest step writes to. commitSession must be atomic and replace any prior data for that date. */
export interface SessionStore {
  commitSession(date: SessionDate, bars: DailyBar[]): Promise<void>;
  recordError(date: SessionDate, issues: BarIssue[] | string): Promise<void>;
}

export type IngestResult =
  | { status: "committed"; date: SessionDate; count: number }
  | { status: "not-ready"; date: SessionDate }
  | { status: "failed"; date: SessionDate; reason: string };

/**
 * Fetch, validate, then commit one session. Nothing is written unless every bar validates,
 * so a failure leaves previously stored data unchanged. Safe to run repeatedly for the same date.
 */
export async function ingestSession(
  provider: MarketDataProvider,
  store: SessionStore,
  date: SessionDate,
): Promise<IngestResult> {
  let bars: DailyBar[];
  try {
    const sessions = await provider.getIndexSessions(date, date);
    if (!sessions.includes(date)) return { status: "not-ready", date };
    bars = await provider.getDailyBars(date);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await store.recordError(date, reason);
    return { status: "failed", date, reason };
  }

  if (bars.length === 0) return { status: "not-ready", date };

  const issues = validateBars(bars);
  if (issues.length > 0) {
    await store.recordError(date, issues);
    return { status: "failed", date, reason: `${issues.length} validation issue(s)` };
  }

  try {
    await store.commitSession(date, bars);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await store.recordError(date, reason);
    return { status: "failed", date, reason };
  }
  return { status: "committed", date, count: bars.length };
}
