# Actions that need you

1. Create or confirm free accounts: Vercel Hobby, a source-control host (GitHub). No card, no trial.
2. Add environment variables yourself in Vercel and `.env.local`. Never paste secrets in chat.
3. Phase 1: generate a TCBS API key in TCInvest (market-data-only if offered) and supply it via environment secrets. The Smart OTP is entered only by you.
4. Rotate the Neon database password if it was ever shown outside `.env.local`.

## Added 2026-11-12

5. Add `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel (Settings, Environment Variables) when the app starts reading the database. Copy them from `.env.local`.
6. Add `TCBS_API_KEY` yourself (last line of `.env.local`, and Vercel as Sensitive). Never paste it in chat. Enter the Smart OTP yourself.
7. Decide how the TCBS spike runs: the agent workspace cannot reach TCBS, so run it on your machine or in a Vercel function.

## Added 2026-11-20

8. `git pull`, then `npm run db:migrate` (migration 0002; run from your machine, the agent never writes to Neon).
9. `npm run sync-securities -- --dry-run`, then `npm run sync-securities` (Smart OTP), then the first real `npm run ingest` after 15:10 (docs/DAILY_INGEST.md). Send back `spike-output/*.json` for the dry runs (counts only).
10. Still pending from the handoff: send TCBS the message in docs/TCBS_SPIKE.md, and check whether TCInvest can issue a market-data-only key.
