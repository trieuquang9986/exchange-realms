# Daily ingest (run by the owner)

TCBS needs a Smart OTP for every token and a token lasts 24 hours, so the daily pull cannot run unattended.
You run one command after the close. Your key and token never leave your machine; Vercel only serves pages.

## Once

1. `git pull` and `npm install` in your copy of the repo.
2. `.env.local` needs two lines:
   - `TCBS_API_KEY=...` (already there)
   - `DATABASE_URL_UNPOOLED=...` (Neon console, Connect, "Direct connection" string). Never paste it in chat.

## Every trading day, after 15:10 Vietnam time

```bash
npm run ingest -- --dry-run     # first time: validates and prints checks, writes nothing, no database needed
npm run ingest                  # the real run: writes today's session to Neon
```

It asks for the Smart OTP (hidden), checks the board, validates every row, and writes only if all rows pass.
Running it twice for the same day is safe: the second run replaces the same rows.

| Exit code | Meaning                                                                      |
| --------- | ---------------------------------------------------------------------------- |
| 0         | Session stored (or, with `--dry-run`, would be stored)                       |
| 3         | Not ready: before 15:10, before the open, a market holiday, or no trades yet |
| 1         | Failed (bad OTP, TCBS error, validation failure). Nothing was written        |

Other options: `--date=2026-11-13` (the TCBS board only describes the latest session, so older dates give
"not ready"), `--force-early` (only with `--dry-run`, to look at data before 15:10).

## What the first dry run answers

It prints three checks the earlier spikes could not make, because they ran before the open:

1. **Close cross-check**: does the board's `matchPrice` equal the close in the daily-bars endpoint? (expect 0 differences)
2. **changePercent**: does TCBS's percent change match ours against the reference price? (expect 0 rows over 0.01%)
3. **Volume unit**: is volume in shares? (expect `shares`)

Attach `spike-output/ingest-<date>-dry.json` in chat. It holds counts only, no key, OTP, token or database URL.

## Known limits

- Shares outstanding are not stored yet (needs the securities sync), so market cap shows "Chua co du lieu".
- The board is HOSE only. After the 28 Dec 2026 cutover it should grow to about 730 rows; the ingest does not assume 433.
- The token has stock scopes, so treat it like a password: the scripts never print or store it.
