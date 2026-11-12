// Phase 1 market-data schema. Companies and classification arrive in Phase 2.
// Missing values are NULL, never 0. Prices are VND integers; volume and shares are share counts.
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const appMeta = pgTable("app_meta", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Trading calendar: a session exists for a date if the VN-Index has a daily bar for it. */
export const tradingSessions = pgTable("trading_sessions", {
  sessionDate: date("session_date").primaryKey(),
  /** True once every bar for the date is committed. Pages only show complete sessions. */
  isComplete: boolean("is_complete").notNull().default(false),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

/** A listed security. Exchange history is effective-dated in Phase 2 (HNX to HOSE cutover). */
export const securities = pgTable("securities", {
  ticker: text("ticker").primaryKey(),
  companyName: text("company_name"),
  exchange: text("exchange"),
  status: text("status"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const dailyPrices = pgTable(
  "daily_prices",
  {
    ticker: text("ticker")
      .notNull()
      .references(() => securities.ticker),
    sessionDate: date("session_date")
      .notNull()
      .references(() => tradingSessions.sessionDate),
    open: integer("open"),
    high: integer("high"),
    low: integer("low"),
    close: integer("close"),
    /** Exchange reference price: basis for the daily limits and % change. */
    reference: integer("reference"),
    ceiling: integer("ceiling"),
    floor: integer("floor"),
    volume: bigint("volume", { mode: "number" }),
    sharesOutstanding: bigint("shares_outstanding", { mode: "number" }),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    /** Synthetic development data. Must never be presented as real. */
    isFixture: boolean("is_fixture").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.ticker, t.sessionDate] }),
    index("daily_prices_session_idx").on(t.sessionDate),
  ],
);

/** Every failed or rejected ingestion, kept for the "last successful update" and debugging views. */
export const ingestionErrors = pgTable("ingestion_errors", {
  id: serial("id").primaryKey(),
  sessionDate: date("session_date").notNull(),
  detail: jsonb("detail").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
