# Data dictionary

Phase 1 market data. Missing values are stored as NULL, never 0. Every figure shown carries an "as of" date.
Update time for all tables below: written once per completed session by the daily ingestion job (Phase 7).
Source: whichever provider is active (`daily_prices.source`); fixtures are flagged by `is_fixture`.

## daily_prices

One row per ticker per trading session.

| Field              | Type        | Unit     | Meaning                                                                                                               |
| ------------------ | ----------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| ticker             | text        |          | Ticker symbol (uppercase letters and digits). Part of primary key.                                                    |
| session_date       | date        | ISO date | Trading session. Part of primary key. Must exist in `trading_sessions`.                                               |
| open, high, low    | integer     | VND      | Session prices. NULL if not supplied. Unadjusted as stored; adjustment status per source is recorded after the spike. |
| close              | integer     | VND      | Closing price. NULL if not supplied (e.g. suspended).                                                                 |
| reference          | integer     | VND      | Exchange reference price. Basis of the daily limits and of % change.                                                  |
| ceiling, floor     | integer     | VND      | Daily price limits as supplied by the source. Effective-dated band (HOSE currently +/-7%).                            |
| volume             | bigint      | shares   | Matched volume. NULL if not supplied.                                                                                 |
| shares_outstanding | bigint      | shares   | As supplied by the source on that date.                                                                               |
| source             | text        |          | Provider name and basis.                                                                                              |
| fetched_at         | timestamptz | UTC      | When the row was fetched. Used for the "as of" display.                                                               |
| is_fixture         | boolean     |          | True for synthetic development data.                                                                                  |

## trading_sessions

| Field        | Type        | Meaning                                                                           |
| ------------ | ----------- | --------------------------------------------------------------------------------- |
| session_date | date        | A session exists if the VN-Index has a daily bar for the date.                    |
| is_complete  | boolean     | True once every bar for the date is committed. Pages show only complete sessions. |
| committed_at | timestamptz | When the session was committed.                                                   |

## securities

| Field            | Type | Meaning                                                                   |
| ---------------- | ---- | ------------------------------------------------------------------------- |
| ticker           | text | Primary key. Companies are separate from securities (Phase 2).            |
| company_name     | text | NULL if unknown.                                                          |
| exchange, status | text | Current values only; effective-dated exchange history arrives in Phase 2. |

## ingestion_errors

Every failed or rejected ingestion: `session_date`, `detail` (jsonb), `created_at`.

## Derived values (computed, not stored)

| Value             | Formula                                                  | When NULL                                  |
| ----------------- | -------------------------------------------------------- | ------------------------------------------ |
| Market cap        | close x shares_outstanding (full cap, not free float)    | close or shares is NULL                    |
| Daily % change    | (close - reference) / reference x 100                    | close or reference is NULL or reference 0  |
| Limit state       | close equals ceiling (limit-up) or floor (limit-down)    | close, ceiling or floor is NULL: "unknown" |
| Market data stale | newest stored session is older than latest completed one | no stored session counts as stale          |

Empire totals built from market cap are labelled "tổng vốn hóa niêm yết" and are not de-duplicated for
cross-holdings between listed parents and subsidiaries.

## Not yet covered

Fundamentals, corporate information, corporate actions and adjusted prices: no source chosen yet (see DATA_SOURCES.md).
