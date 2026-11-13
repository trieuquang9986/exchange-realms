import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema";
import { createDbSessionStore } from "./db-store";
import type { Db } from "./db-store";
import { ingestSession } from "./ingest";
import { createFixtureProvider } from "./fixtures/fixture-provider";
import type { DailyBar } from "./types";

// A real Postgres (PGlite, in memory) running the project's own migrations.
let db: ReturnType<typeof drizzle<typeof schema>>;
let store: ReturnType<typeof createDbSessionStore>;

beforeEach(async () => {
  db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  store = createDbSessionStore(db as unknown as Db);
});

const provider = createFixtureProvider();

async function rows(date: string) {
  return db
    .select()
    .from(schema.dailyPrices)
    .where(eq(schema.dailyPrices.sessionDate, date))
    .orderBy(schema.dailyPrices.ticker);
}

describe("DbSessionStore", () => {
  it("stores a session, keeps missing values as NULL and marks the session complete", async () => {
    expect((await ingestSession(provider, store, "2026-11-12")).status).toBe("committed");
    const stored = await rows("2026-11-12");
    expect(stored).toHaveLength(4);
    const fix3 = stored.find((r) => r.ticker === "FIX3")!;
    expect(fix3.close).toBeNull();
    expect(fix3.volume).toBeNull();
    expect(fix3.sharesOutstanding).toBeNull();
    expect(fix3.isFixture).toBe(true);
    const [session] = await db.select().from(schema.tradingSessions);
    expect(session.isComplete).toBe(true);
    expect(session.committedAt).not.toBeNull();
  });

  it("is idempotent: committing the same session twice leaves identical data", async () => {
    await ingestSession(provider, store, "2026-11-12");
    const first = JSON.stringify(await rows("2026-11-12"));
    await ingestSession(provider, store, "2026-11-12");
    expect(JSON.stringify(await rows("2026-11-12"))).toBe(first);
    const [{ n }] = await db.select({ n: count() }).from(schema.dailyPrices);
    expect(n).toBe(4);
  });

  it("a failure in the middle of a commit rolls everything back", async () => {
    await ingestSession(provider, store, "2026-11-11");
    await ingestSession(provider, store, "2026-11-12");
    const before = JSON.stringify(await rows("2026-11-12"));
    const good = await provider.getDailyBars("2026-11-12");
    // 3 billion does not fit the integer column, so the insert fails after the old rows were deleted.
    const bad: DailyBar[] = [good[0], { ...good[1], open: 3_000_000_000 }];
    await expect(store.commitSession("2026-11-12", bad)).rejects.toThrow();
    expect(JSON.stringify(await rows("2026-11-12"))).toBe(before);
    const [session] = await db
      .select()
      .from(schema.tradingSessions)
      .where(eq(schema.tradingSessions.sessionDate, "2026-11-12"));
    expect(session.isComplete).toBe(true);
  });

  it("upsertSecurities fills details and never overwrites knowledge with null", async () => {
    await store.upsertSecurities([
      {
        ticker: "FIX1",
        companyName: "Ten mau",
        exchange: "HOSE",
        status: "trading",
        sharesOutstanding: null,
      },
    ]);
    await store.upsertSecurities([
      { ticker: "FIX1", companyName: null, exchange: null, status: null, sharesOutstanding: null },
    ]);
    const [s] = await db
      .select()
      .from(schema.securities)
      .where(eq(schema.securities.ticker, "FIX1"));
    expect(s).toMatchObject({ companyName: "Ten mau", exchange: "HOSE", status: "trading" });
  });

  it("records ingestion errors", async () => {
    await store.recordError("2026-11-12", "upstream timeout");
    await store.recordError("2026-11-12", [{ ticker: "FIX1", field: "close", message: "bad" }]);
    const errs = await db.select().from(schema.ingestionErrors);
    expect(errs).toHaveLength(2);
    expect(errs[0].detail).toBe("upstream timeout");
  });
});
