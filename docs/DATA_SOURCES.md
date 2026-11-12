# Data sources

Status of every source. "Unclear" means not confirmed, and is treated as "no" for public display.
Nothing below was verified against the live API: the TCBS spike (Phase 1 task 2) has not run yet.

## TCBS OpenAPI (owner's choice, plan 0.4)

Findings below come from TCBS's developer portal and OpenAPI spec v1.0.0, read by the agent on 2026-11-12.
"Docs say" means documented, not yet confirmed against the live API. The spike (docs/TCBS_SPIKE.md) checks them.

| Item                  | Status                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost                  | Docs say registration is free (workflow page). Not independently verified.                                                                                                                                                                                       |
| Base URL              | `https://openapi.tcbs.com.vn` (introduction page, "URL gốc").                                                                                                                                                                                                    |
| Terms URL             | None found. The introduction page states no terms of use.                                                                                                                                                                                                        |
| Redistribution        | **Unclear.** No statement on any page read. Treated as "no" for public display until TCBS confirms in writing.                                                                                                                                                   |
| Rate limits           | **Exists, undocumented.** Responses carry `x-ratelimit-limit: 100` with `x-ratelimit-remain`, `x-ratelimit-reset` (6) and `x-ratelimit-retry`. The window length is unknown. 20 calls at 250 ms: no HTTP 429, latency p50 86 ms, p95 143 ms (spike, 2026-11-12). |
| Auth                  | POST `/gaia/v1/oauth2/openapi/token` with `apiKey` and `otp` (Smart OTP / iOTP from TCInvest) returns `token`, a JWT used as a Bearer token.                                                                                                                     |
| Token lifetime        | **Live: 24 hours** (JWT exp minus iat). The docs said up to 8 hours. No refresh token in the response. The token carries identity and OTP-session claims, so it is never stored or logged.                                                                       |
| OTP on every exchange | Yes by design: the token request takes an OTP and the token embeds OTP-session claims. Not tested by sending a wrong or empty OTP (risks locking the key). Net: a daily job still needs a human-entered OTP once per 24 h. Decision at C2.                       |
| API key expiry        | Key expiry is queryable (`/apikey/info`); keys can be extended with an OTP (not used here). An expired key cannot be extended. No durations stated.                                                                                                              |
| Units and formats     | Prices are whole VND (int64). Dates `yyyy-MM-dd`; datetimes ISO 8601 with +07:00. **Null fields are omitted from responses**: absent key = missing value. Volume unit not stated.                                                                                |
| Last checked          | 2026-11-12: docs read by the agent; live spike run by the owner at 20:03 Vietnam time (after the close).                                                                                                                                                         |

### Live findings (spike run 2026-11-12, after the close)

| Topic                     | Finding                                                                                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API key                   | Valid, expires 2027-11-11 (364 days left at the run).                                                                                                                                                                            |
| Whole HOSE board          | `tickerSnaps?index=1` returned 433 rows in one call (168 ms), trading date 12/11/2026. `tickerCommons` returned the same 433 symbols (101 ms) and adds next-session reference, ceiling and floor prices.                         |
| Reference, ceiling, floor | Present on all 433 rows. Never 0.                                                                                                                                                                                                |
| Rows with no trades       | 44 rows have no volume, value or quantity. `matchPrice` is still present on them, so **a close must only be taken from `matchPrice` when volume is present** (check pending).                                                    |
| Change fields             | `change` and `changePercent` present on 323 rows; 110 missing (44 no-trade plus about 66 apparently unchanged). Zero values are omitted, so a missing change is not "unknown". We compute % change ourselves against `refPrice`. |
| Foreign room              | Missing on 7 rows.                                                                                                                                                                                                               |
| VN-Index                  | Ticker `VNINDEX` with `type=index` works; the latest bar was 2026-11-12. This is the trading calendar source.                                                                                                                    |
| History per call          | 250 daily bars at most per call (asked for 5000, got one year back to 2025-11-11). Longer history needs paging backwards with `to`. Depth beyond one year is untested.                                                           |
| Securities info           | HTTP 500, code 579000, "Content-Type text/plain is not supported". Cause: no `Content-Type: application/json` header on the GET. The client now always sends it. **Retest pending.**                                             |
| Adjusted vs unadjusted    | Untested: step 7 only ran on the index because step 5 failed.                                                                                                                                                                    |
| Industry                  | Not available from TCBS (no field in the documented securities response).                                                                                                                                                        |
| Terms, redistribution     | Still unknown. Nothing on the portal; the message to TCBS is in docs/TCBS_SPIKE.md.                                                                                                                                              |

Market-data endpoints the app may call (all GET, allowlisted in `src/lib/market-data/tcbs/allowlist.ts`):

| Path                           | Gives                                                                                                                                  | Notes                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `/tartarus/v1/tickerSnaps`     | Per symbol: refPrice, ceilPrice, floorPrice, matchPrice, change, changePercent, totalVolume, room                                      | `index=1` is HOSE. One call can cover the whole board (to verify).                                                 |
| `/tartarus/v1/tickerCommons`   | Same plus open, high, low, avg, totalVol, totalVal, order-book levels                                                                  | `tickers=` or `index=`.                                                                                            |
| `/ananke/v1/securities`        | Security type, exchange (`tradePlace`: 001 HOSE, 002 HNX, 005 UPCOM), status, `listingQtty` (listed shares), ceiling, floor, reference | Paginated, default 1000 per page. **No industry field.** No listing date.                                          |
| `/nyx/v2/stock/bars-long-term` | Daily/weekly/monthly OHLCV (`type=stock` or `index`)                                                                                   | Adjusted or unadjusted: not stated. Max history and max `countBack`: not stated. VN-Index ticker code: not stated. |

Not used: intraday bars, put-through deals, WebSocket streams (intraday is out of the MVP), and every order,
money, account, margin and derivatives endpoint. The same API exposes those, so the allowlist blocks them and
tests prove it. Token exchange and the read-only key-expiry lookup are the only POSTs allowed.

Not offered by TCBS: company profile, financial statements, officers, industry classification, trading calendar.

## Gaps still to research (no source chosen)

| Need                      | Candidate sources to check                                | Status      |
| ------------------------- | --------------------------------------------------------- | ----------- |
| Company profile, officers | Exchange and regulator publications                       | Not started |
| Financial statements      | Exchange and regulator publications                       | Not started |
| Industry classification   | Source industry codes, else draft for owner approval (C4) | Not started |
| Trading calendar          | VN-Index daily bars (primary), published holiday schedule | Not started |

SSI FastConnect Data is another candidate but needs an SSI trading account and a registered fixed IP;
cost and redistribution terms are not verified. Paid providers are excluded ($0 constraint).

## Fixtures

`src/lib/market-data/fixtures/fixture-provider.ts` holds synthetic data (tickers FIX1 to FIX4). Every row
carries `isFixture = true`. It is for development and tests only and must be labelled as sample data
wherever shown.
