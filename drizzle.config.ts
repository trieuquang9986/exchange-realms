import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env.local on its own, so load it here (Node 20.12+). Real environment variables win.
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: rely on the real environment
}

// Migrations use the direct (unpooled) connection. Value comes from the environment, never hard-coded.
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
