import type { DailyBar, SessionDate } from "./types";

/** Market capitalization = close x shares outstanding (full cap, not free float). null if either is missing. */
export function marketCap(bar: Pick<DailyBar, "close" | "sharesOutstanding">): number | null {
  if (bar.close === null || bar.sharesOutstanding === null) return null;
  return bar.close * bar.sharesOutstanding;
}

/**
 * Daily % change against the source's reference price, never a recomputed previous close
 * (the exchange adjusts the reference on corporate-action dates).
 */
export function pctChange(bar: Pick<DailyBar, "close" | "reference">): number | null {
  if (bar.close === null || bar.reference === null || bar.reference === 0) return null;
  return ((bar.close - bar.reference) / bar.reference) * 100;
}

export type LimitState = "limit-up" | "limit-down" | "none" | "unknown";

/** Uses the ceiling and floor the source supplied (effective-dated band). Never guesses a band. */
export function limitState(bar: Pick<DailyBar, "close" | "ceiling" | "floor">): LimitState {
  if (bar.close === null || bar.ceiling === null || bar.floor === null) return "unknown";
  if (bar.close === bar.ceiling) return "limit-up";
  if (bar.close === bar.floor) return "limit-down";
  return "none";
}

/** Market data is stale when the newest stored session is older than the latest completed session. */
export function isMarketDataStale(
  newestStored: SessionDate | null,
  latestCompleted: SessionDate,
): boolean {
  if (newestStored === null) return true;
  return newestStored < latestCompleted;
}
