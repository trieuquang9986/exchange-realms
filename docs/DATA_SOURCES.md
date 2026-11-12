# Data sources

Status of every source. "Unclear" means not confirmed, and is treated as "no" for public display.
Nothing below was verified against the live API: the TCBS spike (Phase 1 task 2) has not run yet.

## TCBS OpenAPI (owner's choice, plan 0.4)

Findings below come from TCBS's developer portal and OpenAPI spec v1.0.0, read by the agent on 2026-11-12.
"Docs say" means documented, not yet confirmed against the live API. The spike (docs/TCBS_SPIKE.md) checks them.

| Item                  | Status                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost                  | Docs say registration is free (workflow page). Not independently verified.                                                                                                        |
| Base URL              | `https://openapi.tcbs.com.vn` (introduction page, "URL gốc").                                                                                                                     |
| Terms URL             | None found. The introduction page states no terms of use.                                                                                                                         |
| Redistribution        | **Unclear.** No statement on any page read. Treated as "no" for public display until TCBS confirms in writing.                                                                    |
| Rate limits           | **Not stated** on any page read. The spike measures what it can.                                                                                                                  |
| Auth                  | POST `/gaia/v1/oauth2/openapi/token` with `apiKey` and `otp` (Smart OTP / iOTP from TCInvest) returns `token`, a JWT used as a Bearer token.                                      |
| Token lifetime        | Docs say valid up to 8 hours from iOTP confirmation. No refresh token is described; after expiry "a new token is needed".                                                         |
| OTP on every exchange | Docs imply yes (iOTP is part of every exchange), but do not say so explicitly. **Unattended daily job is therefore unlikely**; decision at checkpoint C2.                         |
| API key expiry        | Key expiry is queryable (`/apikey/info`); keys can be extended with an OTP (not used here). An expired key cannot be extended. No durations stated.                               |
| Units and formats     | Prices are whole VND (int64). Dates `yyyy-MM-dd`; datetimes ISO 8601 with +07:00. **Null fields are omitted from responses**: absent key = missing value. Volume unit not stated. |
| Last checked          | 2026-11-12 (agent, from docs). Not yet verified live.                                                                                                                             |

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
