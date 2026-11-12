// Provider-independent market data types. The rest of the app depends only on these,
// never on a provider's response format. Missing values are null, never 0.

/** ISO calendar date, e.g. "2026-11-12". */
export type SessionDate = string;

export type Exchange = "HOSE" | "HNX" | "UPCOM";
export type TradingStatus = "trading" | "suspended" | "delisted";

export interface SecurityInfo {
  ticker: string;
  companyName: string | null;
  exchange: Exchange | null;
  status: TradingStatus | null;
  /** Shares outstanding, as supplied by the source. */
  sharesOutstanding: number | null;
}

/** One end-of-day bar. Prices are VND, volume is shares. null = the source gave no value. */
export interface DailyBar {
  ticker: string;
  sessionDate: SessionDate;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  /** Reference price supplied by the exchange; the basis for daily limits and % change. */
  reference: number | null;
  ceiling: number | null;
  floor: number | null;
  volume: number | null;
  sharesOutstanding: number | null;
  /** Where the value came from and when it was fetched, for the "as of" display. */
  source: string;
  fetchedAt: string;
  /** True for synthetic development data. Fixtures must never be shown as real. */
  isFixture: boolean;
}

export interface MarketDataProvider {
  readonly id: string;
  readonly isFixture: boolean;
  listSecurities(): Promise<SecurityInfo[]>;
  getDailyBars(date: SessionDate): Promise<DailyBar[]>;
  /** Dates on which the VN-Index has a daily bar. This defines the trading calendar. */
  getIndexSessions(from: SessionDate, to: SessionDate): Promise<SessionDate[]>;
}
