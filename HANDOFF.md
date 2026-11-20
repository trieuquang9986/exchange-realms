# Handoff: The Exchange Realms (written 2026-11-17)

Repo: github.com/trieuquang9986/exchange-realms (Vercel auto-deploys, private behind Vercel Auth).
Plan: EXCHANGE_REALMS_PLAN.md (owner's). Read docs/PROGRESS.md, docs/DECISIONS.md, docs/DATA_SOURCES.md first.
Local workspace path was /home/claude/exchange-realms; re-clone if it is gone.

## Done

- Neon project `exchange-realms` (patient-pond-41368945, Singapore). Migrations 0000, 0001 applied. Connection strings only in the owner's .env.local / Vercel env.
- Phase 0 scaffold; Phase 1: market-data types, validation, atomic idempotent ingest, TCBS allowlisted client, TCBS provider, Postgres store (PGlite-tested), owner-run `npm run ingest`. 50 tests pass; typecheck, lint, build clean.
- Live checks on a post-close board (2026-11-17, dry run): 434 rows, 396 traded; matchPrice = close (10/10 vs daily bars); TCBS changePercent = ours; volume in shares; board numbers arrive as STRINGS (handled in tcbs/numeric.ts).
- Owner decision C2: owner runs ingest by hand after each close with a manual daily Smart OTP (no unattended job possible).

## Not done yet (in order)

1. First REAL ingest: owner adds DATABASE_URL_UNPOOLED to local .env.local, then `npm run ingest -- --wait` (or plain `npm run ingest`) after 15:10 VN time. Dry run was already "committed" in memory.
2. Securities sync: one `filter=symbol=XXX` call per ticker (bulk query returns HTTP 500), paced by rate-limit headers; needs migration 0002 (listed_shares, sec_type, trade_place, listing_date, info_fetched_at); load shares outstanding into bars; 20-ticker market-cap check.
3. History backfill and the adjusted-vs-unadjusted question (unsettled: CCL +53% on 2015-05-06, HTG days of +/-14%). Use a liquid-stock, full-universe scan.
4. C3 approval, then Phase 2 (company universe/classification; TCBS has no industry field, so a source is needed, gate C4), Phase 3 world engine, Phase 7 automation (adapt the plan: owner-run ingest, Vercel only revalidates), phases 4-6, 8, 9, gates A-F.

## Owner actions pending

- Send TCBS the message in docs/TCBS_SPIKE.md (redistribution rights, market-data-only key, rate limits). Until answered the site stays private.
- Check whether TCInvest can issue a market-data-only key (current key's token also carries trading-capable scopes; treat as a password).
- API key expires 2027-11-11.

## Rules to keep

Cost $0 (no payments or trials). Never ask for or log keys, OTPs, tokens, DB URLs in chat; never commit secrets. Never invent data: missing = NULL / "Chưa có dữ liệu", never 0. No trading features. Allowlist only market-data endpoints. Visual/UX decisions belong to the owner (gates A-F). Stop at checkpoints C1-C8. Build for >=750 kingdoms (HOSE merges HNX 28 Dec 2026). Never run a real DB write from the agent workspace.
