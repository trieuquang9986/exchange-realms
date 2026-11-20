// Securities sync: one paced lookup per ticker (TCBS's bulk query returns HTTP 500). Provider-independent:
// it only needs a function that returns the details for one ticker. Resumable: tickers already synced
// recently are skipped, so an interrupted run (OTP expiry, closed laptop) continues where it stopped.
import type { SecurityDetail } from "./types.ts";

export interface SyncStore {
  upsertSecurityDetails(details: SecurityDetail[], fetchedAt: Date): Promise<void>;
}

export interface SyncOptions {
  /** Pause between calls, in milliseconds. */
  delayMs: number;
  /** Stop after this many failures in a row (likely a dead token or a block, not a bad ticker). */
  maxConsecutiveFailures: number;
  /** Wait before the single retry of a failed call. */
  retryDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  onProgress?: (done: number, total: number, ticker: string) => void;
}

export interface SyncResult {
  stored: number;
  notFound: string[];
  failed: { ticker: string; reason: string }[];
  /** True when the run stopped early because of consecutive failures. */
  aborted: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function syncSecurities(
  tickers: string[],
  fetchOne: (ticker: string) => Promise<SecurityDetail | null>,
  store: SyncStore,
  opts: SyncOptions,
): Promise<SyncResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? (() => new Date());
  const result: SyncResult = { stored: 0, notFound: [], failed: [], aborted: false };
  let streak = 0;

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];
    let detail: SecurityDetail | null = null;
    let error: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        detail = await fetchOne(ticker);
        error = null;
        break;
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
        if (attempt === 0) await sleep(opts.retryDelayMs);
      }
    }

    if (error !== null) {
      result.failed.push({ ticker, reason: error });
      if (++streak >= opts.maxConsecutiveFailures) {
        result.aborted = true;
        break;
      }
    } else {
      streak = 0;
      if (detail === null) result.notFound.push(ticker);
      else {
        // One row per call keeps an interruption cheap: everything fetched so far is already stored.
        await store.upsertSecurityDetails([detail], now());
        result.stored++;
      }
    }
    opts.onProgress?.(i + 1, tickers.length, ticker);
    if (i < tickers.length - 1) await sleep(opts.delayMs);
  }
  return result;
}
