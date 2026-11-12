// Schema grows in Phase 1 (market data) and Phase 2 (companies). Phase 0 keeps one table
// so the migration and connection path can be verified end to end.
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const appMeta = pgTable("app_meta", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
