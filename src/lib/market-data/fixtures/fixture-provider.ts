import type { DailyBar, MarketDataProvider, SecurityInfo, SessionDate } from "../types";

// SYNTHETIC DEVELOPMENT DATA. Tickers FIX1..FIX4 do not exist and the numbers are made up.
// Everything here carries isFixture = true and must be labelled as sample data wherever shown.

const SOURCE = "FIXTURE (dữ liệu mẫu, không phải dữ liệu thật)";
const FETCHED_AT = "2026-11-12T10:00:00.000Z";

export const FIXTURE_SESSIONS: SessionDate[] = [
  "2026-11-09",
  "2026-11-10",
  "2026-11-11",
  "2026-11-12",
];

const SECURITIES: SecurityInfo[] = [
  {
    ticker: "FIX1",
    companyName: "Công ty mẫu 1 (dữ liệu mẫu)",
    exchange: "HOSE",
    status: "trading",
    sharesOutstanding: 1_000_000,
  },
  {
    ticker: "FIX2",
    companyName: "Công ty mẫu 2 (dữ liệu mẫu)",
    exchange: "HOSE",
    status: "trading",
    sharesOutstanding: 2_500_000,
  },
  {
    ticker: "FIX3",
    companyName: "Công ty mẫu 3 (dữ liệu mẫu)",
    exchange: "HOSE",
    status: "suspended",
    sharesOutstanding: null,
  },
  {
    ticker: "FIX4",
    companyName: "Công ty mẫu 4 (dữ liệu mẫu)",
    exchange: "HOSE",
    status: "trading",
    sharesOutstanding: 800_000,
  },
];

function bar(
  ticker: string,
  sessionDate: SessionDate,
  v: Partial<DailyBar> & Pick<DailyBar, "reference" | "ceiling" | "floor">,
): DailyBar {
  const shares = SECURITIES.find((s) => s.ticker === ticker)?.sharesOutstanding ?? null;
  return {
    ticker,
    sessionDate,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    sharesOutstanding: shares,
    source: SOURCE,
    fetchedAt: FETCHED_AT,
    isFixture: true,
    ...v,
  };
}

/** Day 2026-11-12: FIX1 closes limit-up (+7%), FIX2 ordinary, FIX3 suspended (no prices), FIX4 limit-down. */
const BARS: Record<SessionDate, DailyBar[]> = {
  "2026-11-12": [
    bar("FIX1", "2026-11-12", {
      reference: 20000,
      ceiling: 21400,
      floor: 18600,
      open: 20500,
      high: 21400,
      low: 20400,
      close: 21400,
      volume: 300000,
    }),
    bar("FIX2", "2026-11-12", {
      reference: 50000,
      ceiling: 53500,
      floor: 46500,
      open: 50000,
      high: 51000,
      low: 49500,
      close: 50500,
      volume: 120000,
    }),
    bar("FIX3", "2026-11-12", { reference: 10000, ceiling: 10700, floor: 9300 }),
    bar("FIX4", "2026-11-12", {
      reference: 30000,
      ceiling: 32100,
      floor: 27900,
      open: 29500,
      high: 29600,
      low: 27900,
      close: 27900,
      volume: 450000,
    }),
  ],
  "2026-11-11": [
    bar("FIX1", "2026-11-11", {
      reference: 19800,
      ceiling: 21186,
      floor: 18414,
      open: 19800,
      high: 20100,
      low: 19700,
      close: 20000,
      volume: 200000,
    }),
    bar("FIX2", "2026-11-11", {
      reference: 50200,
      ceiling: 53714,
      floor: 46686,
      open: 50200,
      high: 50600,
      low: 49800,
      close: 50000,
      volume: 90000,
    }),
  ],
};

export function createFixtureProvider(): MarketDataProvider {
  return {
    id: "fixture",
    isFixture: true,
    async listSecurities() {
      return SECURITIES.map((s) => ({ ...s }));
    },
    async getDailyBars(date) {
      return (BARS[date] ?? []).map((b) => ({ ...b }));
    },
    async getIndexSessions(from, to) {
      return FIXTURE_SESSIONS.filter((d) => d >= from && d <= to);
    },
  };
}
