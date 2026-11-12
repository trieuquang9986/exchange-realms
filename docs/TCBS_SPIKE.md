# TCBS spike: how to run it

A one-off script that checks what the TCBS OpenAPI really does, so the data pipeline is built on facts.
It runs on your machine because the agent's workspace cannot reach TCBS and your key stays with you.

## Before you start

- Node 22.18 or newer (`node -v`). On older Node, run `npx tsx scripts/tcbs-spike.mts` instead.
- The repo on your machine: `git clone https://github.com/trieuquang9986/exchange-realms` then `npm install`.
- A file `.env.local` in the repo root containing one line: `TCBS_API_KEY=your-key`
  (or set `TCBS_API_KEY` in your terminal). Never paste the key in chat.
- The TCInvest app open, ready to show your Smart OTP.
- Best time: after the HOSE close (after 15:00 Vietnam time) on a trading day, so the data is for a full session.

## Run

```bash
node scripts/tcbs-spike.mts
```

A "Module type of file is not specified" warning is harmless. The script asks for your Smart OTP once, with the
characters hidden. It takes about a minute.

## What it does and does not do

- One token exchange. If the OTP is wrong it stops; it never retries and never sends an empty or fake OTP.
- Calls only the allowlisted market-data endpoints (GET), the token exchange and the read-only key-expiry lookup.
  It cannot reach orders, money, accounts, margin or derivatives, and it does not extend your key.
- Makes about 30 requests, including a gentle burst of 20 small calls, 250 ms apart, that stops at the first HTTP 429.
- Saves `spike-output/tcbs-spike-<date>.json` (ignored by git). Before saving it scans the report for your key,
  OTP and token; if any appears, nothing is written.

## What the report answers

| Question                               | Where in the report                                                |
| -------------------------------------- | ------------------------------------------------------------------ |
| Token lifetime, refresh token present? | Step 2: `lifetimeHours`, `refreshTokenInResponse`                  |
| API key expiry                         | Step 1: `expireDate`, `daysLeft`                                   |
| Can one call cover all HOSE tickers?   | Steps 3 and 4: `rowCount`, `ms`                                    |
| Reference, ceiling, floor present?     | Steps 3 and 4: `coverage` (present, missing, zero per field)       |
| Shares outstanding, exchange, status   | Step 5: `securitiesInfoKeys`, `shareCountFieldPresentOnHoseStocks` |
| Industry in the data?                  | Step 5: `industryLikeKeys` (empty means none)                      |
| VN-Index bars (trading calendar)       | Step 6: `tickerThatWorked`                                         |
| History depth, adjusted or not         | Step 7: `earliest`, `barsReturned`, `daysOver7_5pct`               |
| Rate limits, latency                   | Step 8: `statuses`, `p50Ms`, `p95Ms`, `rateLimitLikeHeaders`       |

Then attach the JSON file in chat. I will turn it into the C2 findings and fill in DATA_SOURCES.md.

## One thing the script cannot answer: redistribution

TCBS's pages state no terms of use, no rate limits and nothing on redistribution. Until TCBS confirms in
writing, the public site stays on sample data or private. Suggested message to TCBS (their contact channel is in
the TCInvest app or on the developer portal):

> Chào TCBS, tôi dùng iFlash Open API để làm một website thông tin thị trường phi thương mại, miễn phí, hiển thị
> dữ liệu cuối ngày (không trực tuyến). Xin cho biết: (1) điều khoản có cho phép hiển thị công khai dữ liệu
> giá cuối ngày lấy từ API này trên website không, và cần ghi nguồn thế nào; (2) giới hạn tần suất gọi API;
> (3) có loại khóa dịch vụ (không cần OTP mỗi lần) chỉ dành cho dữ liệu thị trường không. Xin cảm ơn.
>
> English: I use the iFlash Open API for a free, non-commercial website showing end-of-day market data. Does your
> licence allow public display of that data, and what credit is needed? What are the rate limits? Is there a
> service key (no OTP per call) limited to market data?

## If something fails

| Message                                | Likely cause                                                            |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `TCBS_API_KEY not found`               | Missing `.env.local` line or not run from the repo root                 |
| Step 1 fails with 401/403              | Key expired or revoked: create a new key in TCInvest                    |
| Step 2 fails                           | Wrong or expired OTP: run again with a fresh one                        |
| Step 6 "neither guessed ticker worked" | Index ticker code unknown: the report says so; tell me, I will ask TCBS |
| Everything times out                   | Network or VPN blocking `openapi.tcbs.com.vn`                           |

## Run 2 (after the first live run)

The first run confirmed login, the whole-board snapshot, VN-Index bars and rate-limit headers. Two things
need a second run, which uses the same steps: securities info failed (fixed by sending a JSON Content-Type)
and the stock history and adjustment check only ran on the index. Run 2 also pages history backwards
(one call returns about 250 bars), tests 10 liquid stocks, compares TCBS's published % change with ours,
and records the token's permission names so we can see whether it can do more than read market data.
Same command, one fresh OTP. About two minutes.
