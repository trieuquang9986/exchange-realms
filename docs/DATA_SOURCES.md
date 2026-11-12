# Data sources

Status of every source. "Unclear" means not confirmed, and is treated as "no" for public display.
Nothing below was verified against the live API: the TCBS spike (Phase 1 task 2) has not run yet.

## TCBS OpenAPI (owner's choice, plan 0.4)

| Item                  | Status                                                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Cost                  | Free (per owner). Not independently verified.                                                                                                   |
| Terms URL             | Not found yet. Check developers.tcbs.com.vn.                                                                                                    |
| Redistribution        | **Unclear.** The spec read by the owner on 2026-11-11 states no terms. Public site stays fixtures-only or private until confirmed in writing.   |
| Rate limits           | Unknown. Not stated in the spec.                                                                                                                |
| Auth                  | API key + Smart OTP exchanged for a JWT at `/gaia/v1/oauth2/openapi/token`. Keys expire; expired keys cannot be extended.                       |
| Unattended daily job  | **Unverified.** Spike must find out whether an OTP is needed on every token exchange.                                                           |
| Market-data endpoints | Listed in the spec: price board, price history, foreign room, put-through, supply/demand, securities info, OHLCV. Exact paths not recorded yet. |
| Not offered           | Company profile, financial statements, officers, industry classification, trading calendar.                                                     |
| Last checked          | 2026-11-11 (by owner, from the spec). Not re-checked by the agent.                                                                              |

Safety: the same API has order, cash, margin and account endpoints. `src/lib/market-data/tcbs/allowlist.ts`
blocks every path that is not on a market-data allowlist, and the allowlist is empty until the spike
confirms real paths. Tests prove order and account paths throw.

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
