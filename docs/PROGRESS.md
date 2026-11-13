# Progress

## Phase 0: project setup (done, C1 treated as approved 2026-11-12)

Scaffold, TypeScript, ESLint, Prettier, Vitest, Drizzle, env handling, README, docs, Neon project,
GitHub repo and Vercel project (deploys on push; site private behind Vercel Auth).

## Phase 1: market data foundation (in progress)

Done, on fixtures:

- [x] Provider-independent types and `MarketDataProvider` interface (`src/lib/market-data`)
- [x] Metrics: market cap, % change vs reference price, limit state, staleness
- [x] Validation (null never 0, price consistency, duplicates)
- [x] Atomic, idempotent `ingestSession`; failure leaves stored data unchanged (tested)
- [x] TCBS endpoint allowlist; order/account paths blocked (tested)
- [x] Schema and migration 0001 applied to Neon (trading_sessions, securities, daily_prices, ingestion_errors)
- [x] DATA_DICTIONARY.md, DATA_SOURCES.md

Blocked on the owner:

- [x] TCBS spike script written and rehearsed against a local mock (docs/TCBS_SPIKE.md)
- [x] TCBS spike run 1 (2026-11-12): auth, board, calendar and rate limits confirmed; securities info failed (missing Content-Type)
- [x] TCBS spike run 2 (2026-11-13, pre-open): history depth and paging, rate-limit headers, token permissions confirmed; securities bulk query still fails (single-symbol works); adjustment not settled
- [x] C2 decided: owner runs the ingest after each close with a daily OTP
- [x] TCBS adapter (`tcbs/provider.ts`), Postgres store (`db-store.ts`, tested on PGlite), `npm run ingest` with `--dry-run`, after-close guard, diagnostics
- [ ] First post-close dry run, then first real ingest (docs/DAILY_INGEST.md); answers: does matchPrice equal the close, does changePercent match ours, is volume in shares
- [ ] Securities sync (shares outstanding, security type, listing date; about 433 paced single-symbol calls) and migration for the extra columns
- [ ] 20-ticker market-cap check and a corporate-action date check
- [ ] Real adapter and recorded contract fixtures (after the spike)
- [ ] Acceptance checks on 20 real HOSE tickers (after the spike)
- [ ] Checkpoints C2 (spike findings) and C3 (end of Phase 1)

Independent work that can continue: Phase 2 universe model and Phase 3 world engine on fixtures.
