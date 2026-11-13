// Postgres SessionStore. commitSession is one transaction: it replaces everything stored for the date,
// so a failure leaves earlier data untouched and a re-run gives the same rows.
// Imports use explicit .ts extensions so plain Node can run it.
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { dailyPrices, ingestionErrors, securities, tradingSessions } from "../db/schema.ts";
import type * as schema from "../db/schema.ts";
import type { SessionStore } from "./ingest.ts";
import type { BarIssue } from "./validation.ts";
import type { DailyBar, SecurityInfo, SessionDate } from "./types.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbSessionStore extends SessionStore {
  upsertSecurities(infos: SecurityInfo[]): Promise<void>;
}

export function createDbSessionStore(db: Db): DbSessionStore {
  return {
    async upsertSecurities(infos) {
      if (!infos.length) return;
      for (let i = 0; i < infos.length; i += 500) {
        await db
          .insert(securities)
          .values(
            infos.slice(i, i + 500).map((s) => ({
              ticker: s.ticker,
              companyName: s.companyName,
              exchange: s.exchange,
              status: s.status,
            })),
          )
          .onConflictDoUpdate({
            target: securities.ticker,
            // Keep a stored value when the new one is unknown; never overwrite knowledge with null.
            set: {
              companyName: sql`coalesce(excluded.company_name, ${securities.companyName})`,
              exchange: sql`coalesce(excluded.exchange, ${securities.exchange})`,
              status: sql`coalesce(excluded.status, ${securities.status})`,
              updatedAt: sql`now()`,
            },
          });
      }
    },

    async commitSession(date: SessionDate, bars: DailyBar[]) {
      await db.transaction(async (tx) => {
        // Tickers must exist before their prices (foreign key). Unknown details stay null.
        const tickers = [...new Set(bars.map((b) => b.ticker))];
        for (let i = 0; i < tickers.length; i += 500) {
          await tx
            .insert(securities)
            .values(tickers.slice(i, i + 500).map((ticker) => ({ ticker })))
            .onConflictDoNothing();
        }
        await tx
          .insert(tradingSessions)
          .values({ sessionDate: date, isComplete: false })
          .onConflictDoUpdate({ target: tradingSessions.sessionDate, set: { isComplete: false } });
        await tx.delete(dailyPrices).where(eq(dailyPrices.sessionDate, date));
        for (let i = 0; i < bars.length; i += 200) {
          await tx.insert(dailyPrices).values(
            bars.slice(i, i + 200).map((b) => ({
              ticker: b.ticker,
              sessionDate: b.sessionDate,
              open: b.open,
              high: b.high,
              low: b.low,
              close: b.close,
              reference: b.reference,
              ceiling: b.ceiling,
              floor: b.floor,
              volume: b.volume,
              sharesOutstanding: b.sharesOutstanding,
              source: b.source,
              fetchedAt: new Date(b.fetchedAt),
              isFixture: b.isFixture,
            })),
          );
        }
        await tx
          .update(tradingSessions)
          .set({ isComplete: true, committedAt: new Date() })
          .where(eq(tradingSessions.sessionDate, date));
      });
    },

    async recordError(date: SessionDate, detail: BarIssue[] | string) {
      await db.insert(ingestionErrors).values({ sessionDate: date, detail });
    },
  };
}
