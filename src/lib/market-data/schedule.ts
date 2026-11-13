// Vietnam-time helpers. HOSE closes at 15:00; the ingest waits a margin so closing prices are final.
// The margin is a choice, not a TCBS rule.

const FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function vietnamClock(now: Date): { date: string; minutes: number } {
  const p = Object.fromEntries(FORMAT.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

export const CLOSE_MARGIN_MINUTES = 15 * 60 + 10;

/** True when the session on `date` is over: an earlier day, or today after the close margin. */
export function isAfterMarketClose(date: string, now: Date): boolean {
  const vn = vietnamClock(now);
  if (date < vn.date) return true;
  if (date > vn.date) return false;
  return vn.minutes >= CLOSE_MARGIN_MINUTES;
}
