import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createDbSessionStore } from "./db-store";
import type { Db } from "./db-store";
import { syncSecurities } from "./securities-sync";
import type { SecurityDetail } from "./types";

let db: ReturnType<typeof drizzle<typeof schema>>;
let store: ReturnType<typeof createDbSessionStore>;

beforeEach(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  store = createDbSessionStore(db as unknown as Db);
});

const detail = (ticker: string, shares: number | null): SecurityDetail => ({
  ticker,
  companyName: `Fixture ${ticker}`,
  exchange: "HOSE",
  status: "trading",
  sharesOutstanding: shares,
  secType: "001",
  listingDate: "2010-01-01",
});

const fast = {
  delayMs: 0,
  retryDelayMs: 0,
  maxConsecutiveFailures: 3,
  sleep: async () => {},
};

describe("syncSecurities", () => {
  it("stores details and exposes listed shares; unknown shares stay NULL, never 0", async () => {
    const data: Record<string, SecurityDetail | null> = {
      AAA: detail("AAA", 1_000_000),
      BBB: detail("BBB", null),
      CCC: null,
    };
    const res = await syncSecurities(["AAA", "BBB", "CCC"], async (t) => data[t], store, fast);
    expect(res).toMatchObject({ stored: 2, notFound: ["CCC"], aborted: false });
    const bbb = (
      await db.select().from(schema.securities).where(eq(schema.securities.ticker, "BBB"))
    )[0];
    expect(bbb.listedShares).toBeNull();
    expect(bbb.infoFetchedAt).not.toBeNull();
    expect([...(await store.loadSharesByTicker())]).toEqual([["AAA", 1_000_000]]);
  });

  it("never overwrites a stored value with an unknown one", async () => {
    await syncSecurities(["AAA"], async () => detail("AAA", 500), store, fast);
    await syncSecurities(["AAA"], async () => detail("AAA", null), store, fast);
    expect((await store.loadSharesByTicker()).get("AAA")).toBe(500);
  });

  it("retries once, records a failed ticker and carries on", async () => {
    let calls = 0;
    const res = await syncSecurities(
      ["AAA", "BAD", "CCC"],
      async (t) => {
        if (t === "BAD") throw new Error("HTTP 500");
        if (t === "AAA" && calls++ === 0) throw new Error("blip");
        return detail(t, 10);
      },
      store,
      fast,
    );
    expect(res.stored).toBe(2);
    expect(res.failed).toEqual([{ ticker: "BAD", reason: "HTTP 500" }]);
  });

  it("aborts after consecutive failures and resumes with only the unsynced tickers", async () => {
    const tickers = ["AAA", "BBB", "CCC", "DDD", "EEE"];
    await store.upsertSecurities(
      tickers.map((ticker) => ({
        ticker,
        companyName: null,
        exchange: "HOSE",
        status: null,
        sharesOutstanding: null,
      })),
    );
    const res = await syncSecurities(
      tickers,
      async (t) => {
        if (t === "AAA") return detail(t, 1);
        throw new Error("token expired");
      },
      store,
      fast,
    );
    expect(res.aborted).toBe(true);
    expect(res.stored).toBe(1);
    const todo = await store.tickersNeedingSync(new Date(Date.now() - 60_000));
    expect(todo).toEqual(["BBB", "CCC", "DDD", "EEE"]);
  });
});
