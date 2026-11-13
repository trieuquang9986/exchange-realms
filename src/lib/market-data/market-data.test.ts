import { describe, expect, it } from "vitest";
import { createFixtureProvider } from "./fixtures/fixture-provider";
import { ingestSession } from "./ingest";
import { MemorySessionStore } from "./memory-store";
import { isMarketDataStale, limitState, marketCap, pctChange } from "./metrics";
import { validateBar } from "./validation";
import type { DailyBar, MarketDataProvider } from "./types";

const provider = createFixtureProvider();

async function bars(date: string): Promise<DailyBar[]> {
  return provider.getDailyBars(date);
}

describe("metrics", () => {
  it("market cap equals close x shares, and is null when either is missing", async () => {
    const [fix1, , fix3] = await bars("2026-11-12");
    expect(marketCap(fix1)).toBe(21400 * 1_000_000);
    expect(marketCap(fix3)).toBeNull();
  });

  it("percent change uses the source reference price", async () => {
    const [fix1, fix2, fix3] = await bars("2026-11-12");
    expect(pctChange(fix1)).toBeCloseTo(7, 10);
    expect(pctChange(fix2)).toBeCloseTo(1, 10);
    expect(pctChange(fix3)).toBeNull();
  });

  it("detects limit-up, limit-down, none and unknown from source ceiling and floor", async () => {
    const [fix1, fix2, fix3, fix4] = await bars("2026-11-12");
    expect(limitState(fix1)).toBe("limit-up");
    expect(limitState(fix4)).toBe("limit-down");
    expect(limitState(fix2)).toBe("none");
    expect(limitState(fix3)).toBe("unknown");
    expect(limitState({ close: 100, ceiling: null, floor: null })).toBe("unknown");
  });

  it("flags stale market data", () => {
    expect(isMarketDataStale("2026-11-11", "2026-11-12")).toBe(true);
    expect(isMarketDataStale("2026-11-12", "2026-11-12")).toBe(false);
    expect(isMarketDataStale(null, "2026-11-12")).toBe(true);
  });
});

describe("validation", () => {
  it("accepts every fixture bar", async () => {
    for (const d of ["2026-11-11", "2026-11-12"]) {
      for (const b of await bars(d)) expect(validateBar(b)).toEqual([]);
    }
  });

  it("rejects 0 used as a stand-in for missing data", async () => {
    const [fix1] = await bars("2026-11-12");
    expect(validateBar({ ...fix1, close: 0 })).not.toEqual([]);
    expect(validateBar({ ...fix1, volume: -1 })).not.toEqual([]);
    expect(validateBar({ ...fix1, close: null })).toEqual([]);
  });

  it("rejects fractional VND prices (TCBS prices are whole VND)", async () => {
    const [fix1] = await bars("2026-11-12");
    expect(validateBar({ ...fix1, close: 21400.5 })).not.toEqual([]);
  });

  it("rejects inconsistent prices", async () => {
    const [fix1] = await bars("2026-11-12");
    expect(validateBar({ ...fix1, high: 100, low: 200 })).not.toEqual([]);
    expect(validateBar({ ...fix1, close: 99999 })).not.toEqual([]);
    expect(validateBar({ ...fix1, floor: 99999 })).not.toEqual([]);
  });

  it("keeps missing fixture data as null, not 0", async () => {
    const fix3 = (await bars("2026-11-12"))[2];
    expect(fix3.close).toBeNull();
    expect(fix3.volume).toBeNull();
    expect(fix3.sharesOutstanding).toBeNull();
  });
});

describe("ingestion", () => {
  it("commits a valid session and is idempotent when run twice", async () => {
    const store = new MemorySessionStore();
    const first = await ingestSession(provider, store, "2026-11-12");
    const after1 = store.snapshot();
    const second = await ingestSession(provider, store, "2026-11-12");
    expect(first).toEqual({ status: "committed", date: "2026-11-12", count: 4 });
    expect(second.status).toBe("committed");
    expect(store.snapshot()).toBe(after1);
  });

  it("reports not-ready for a date with no session or no data", async () => {
    const store = new MemorySessionStore();
    expect((await ingestSession(provider, store, "2026-11-08")).status).toBe("not-ready"); // weekend, no index bar
    expect((await ingestSession(provider, store, "2026-11-10")).status).toBe("not-ready"); // session, but no bars yet
    expect(store.sessions.size).toBe(0);
  });

  it("a forced commit failure leaves previously stored data unchanged", async () => {
    const store = new MemorySessionStore();
    await ingestSession(provider, store, "2026-11-11");
    const before = store.snapshot();
    store.failNextCommit = true;
    const result = await ingestSession(provider, store, "2026-11-12");
    expect(result.status).toBe("failed");
    expect(store.snapshot()).toBe(before);
    expect(store.errors).toHaveLength(1);
  });

  it("a provider failure leaves stored data unchanged and records the error", async () => {
    const store = new MemorySessionStore();
    await ingestSession(provider, store, "2026-11-11");
    const before = store.snapshot();
    const broken: MarketDataProvider = {
      ...provider,
      getDailyBars: async () => {
        throw new Error("upstream timeout");
      },
    };
    const result = await ingestSession(broken, store, "2026-11-12");
    expect(result).toEqual({ status: "failed", date: "2026-11-12", reason: "upstream timeout" });
    expect(store.snapshot()).toBe(before);
  });

  it("invalid data is rejected whole, never partly committed", async () => {
    const store = new MemorySessionStore();
    const good = await bars("2026-11-12");
    const bad: MarketDataProvider = {
      ...provider,
      getDailyBars: async () => [good[0], { ...good[1], close: 0 }],
    };
    const result = await ingestSession(bad, store, "2026-11-12");
    expect(result.status).toBe("failed");
    expect(store.sessions.size).toBe(0);
  });
});
