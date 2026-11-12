import { defineConfig } from "drizzle-kit";

// Migrations use the direct (unpooled) connection. Value comes from the environment, never hard-coded.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
