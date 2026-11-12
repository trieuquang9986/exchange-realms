# Architecture (Phase 0)

- Next.js App Router app deployed to Vercel Hobby. Public pages read stored data only.
- Postgres on Neon free (project `exchange-realms`, region aws-ap-southeast-1). Access through Drizzle over the Neon HTTP driver.
- Planned boundaries: market-data adapter (provider-independent), world engine (UI-independent), map engine, daily ingestion job (idempotent, resumable, one Vercel cron plus backup trigger).
- Secrets live in environment variables only; read server-side via `src/lib/env.ts`.
