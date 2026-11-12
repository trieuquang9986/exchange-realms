import type { DailyBar } from "./types";

export interface BarIssue {
  ticker: string;
  field: string;
  message: string;
}

const PRICE_FIELDS = ["open", "high", "low", "close", "reference", "ceiling", "floor"] as const;

/** Returns every problem with a bar. An empty list means the bar may be stored. */
export function validateBar(bar: DailyBar): BarIssue[] {
  const issues: BarIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ ticker: bar.ticker, field, message });

  if (!/^[A-Z0-9]{1,10}$/.test(bar.ticker)) add("ticker", "unexpected ticker format");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bar.sessionDate)) add("sessionDate", "not an ISO date");

  // Missing must be null. A 0 or negative price means the source or adapter filled a gap.
  for (const f of PRICE_FIELDS) {
    const v = bar[f];
    if (v !== null && !(Number.isFinite(v) && v > 0))
      add(f, "price must be null or a positive number");
  }
  if (bar.volume !== null && !(Number.isFinite(bar.volume) && bar.volume >= 0)) {
    add("volume", "volume must be null or >= 0");
  }
  if (
    bar.sharesOutstanding !== null &&
    !(Number.isFinite(bar.sharesOutstanding) && bar.sharesOutstanding > 0)
  ) {
    add("sharesOutstanding", "shares must be null or > 0");
  }

  const { open, high, low, close, ceiling, floor, reference } = bar;
  if (high !== null && low !== null && high < low) add("high", "high is below low");
  for (const [name, v] of [
    ["open", open],
    ["close", close],
  ] as const) {
    if (v !== null && high !== null && v > high) add(name, `${name} is above high`);
    if (v !== null && low !== null && v < low) add(name, `${name} is below low`);
  }
  if (floor !== null && ceiling !== null && floor > ceiling) add("floor", "floor is above ceiling");
  if (reference !== null && ceiling !== null && reference > ceiling)
    add("reference", "reference above ceiling");
  if (reference !== null && floor !== null && reference < floor)
    add("reference", "reference below floor");

  return issues;
}

export function validateBars(bars: DailyBar[]): BarIssue[] {
  const issues = bars.flatMap(validateBar);
  const seen = new Set<string>();
  for (const b of bars) {
    const key = `${b.ticker}|${b.sessionDate}`;
    if (seen.has(key)) issues.push({ ticker: b.ticker, field: "ticker", message: "duplicate bar" });
    seen.add(key);
  }
  return issues;
}
