// Server-only environment access. Secrets must never be imported into client components.
export type ServerEnv = {
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED?: string;
  CRON_SECRET?: string;
};

export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const DATABASE_URL = source.DATABASE_URL;
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }
  return {
    DATABASE_URL,
    DATABASE_URL_UNPOOLED: source.DATABASE_URL_UNPOOLED,
    CRON_SECRET: source.CRON_SECRET,
  };
}
