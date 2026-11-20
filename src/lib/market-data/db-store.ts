// Postgres SessionStore. commitSession is one transaction: it replaces everything stored for the date,
// so a failure leaves earlier data untouched and a re-run gives the same rows.
// Imports use explicit .ts extensions so plain Node can run it.
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { dailyPrices, ingestionErrors, securities, tradingSessions } from "../db/schema.ts";
import type * as schema from "../db/schema.ts";
import type { SessionStore } from "./ingest.ts";
import type { BarIssue } from "./validation.ts";
import type { DailyBar, SecurityDetail, SecurityInfo, SessionDate } from "./types.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbSessionStore extends SessionStore {
  upsertSecurities(infos: SecurityInfo[]): Promise<void>;
  /** Stores per-ticker details from the securities sync. Unknown (null) values never overwrite stored ones. */
  upsertSecurityDetails(details: SecurityDetail[], fetchedAt: Date): Promise<void>;
  /** Listed shares by ticker, for tickers where the sync found a positive count. */
  loadSharesByTicker(): Promise<Map<string, number>>;
  /** Tickers never synced, or last synced before `olderThan`, so a sync can resume after an interruption. */
  tickersNeedingSync(olderThan: Date): Promise<string[]>;
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

    async upsertSecurityDetails(details, fetchedAt) {
      for (let i = 0; i < details.length; i += 200) {
        await db
          .insert(securities)
          .values(
            details.slice(i, i + 200).map((d) => ({
              ticker: d.ticker,
              companyName: d.companyName,
              exchange: d.exchange,
              status: d.status,
              listedShares: d.sharesOutstanding,
              secType: d.secType,
              listingDate: d.listingDate,
              infoFetchedAt: fetchedAt,
            })),
          )
          .onConflictDoUpdate({
            target: securities.ticker,
            set: {
              companyName: sql`coalesce(excluded.company_name, ${securities.companyName})`,
              exchange: sql`coalesce(excluded.exchange, ${securities.exchange})`,
              status: sql`coalesce(excluded.status, ${securities.status})`,
              listedShares: sql`coalesce(excluded.listed_shares, ${securities.listedShares})`,
              secType: sql`coalesce(excluded.sec_type, ${securities.secType})`,
              listingDate: sql`coalesce(excluded.listing_date, ${securities.listingDate})`,
              infoFetchedAt: sql`excluded.info_fetched_at`,
              updatedAt: sql`now()`,
            },
          });
      }
    },

    async loadSharesByTicker() {
      const rows = await db
        .select({ ticker: securities.ticker, shares: securities.listedShares })
        .from(securities)
        .where(sql`${securities.listedShares} > 0`);
      return new Map(rows.map((r) => [r.ticker, Number(r.shares)]));
    },

    async tickersNeedingSync(olderThan) {
      const rows = await db
        .select({ ticker: securities.ticker })
        .from(securities)
        .where(
          sql`${securities.infoFetchedAt} is null or ${securities.infoFetchedAt} < ${olderThan.toISOString()}`,
        )
        .orderBy(securities.ticker);
      return rows.map((r) => r.ticker);
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
