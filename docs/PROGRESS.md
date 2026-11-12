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

- [ ] TCBS spike (plan Phase 1 task 2): needs the owner's API key and a network that can reach TCBS
- [ ] Real adapter and recorded contract fixtures (after the spike)
- [ ] Acceptance checks on 20 real HOSE tickers (after the spike)
- [ ] Checkpoints C2 (spike findings) and C3 (end of Phase 1)

Independent work that can continue: Phase 2 universe model and Phase 3 world engine on fixtures.
