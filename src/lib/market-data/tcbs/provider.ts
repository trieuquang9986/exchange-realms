// TCBS implementation of MarketDataProvider. Imports use explicit .ts extensions so plain Node can run it.
// Rules learned from the live spikes (2026-11-12 and 2026-11-13), see docs/DATA_SOURCES.md:
//  - tickerSnaps?index=1 returns the whole HOSE board in one call. TCBS omits null fields.
//  - Before the open the board already carries the NEW trading date but has no trades at all.
//  - After the close, rows that did not trade still carry a matchPrice, so a close is only taken
//    from matchPrice when the row has volume.
//  - One bars call returns at most ~250 daily bars, so longer ranges page backwards with `to`.
import { tcbsRequest } from "./client.ts";
import type { TcbsRequest } from "./client.ts";
import type {
  DailyBar,
  Exchange,
  MarketDataProvider,
  SecurityInfo,
  SessionDate,
  TradingStatus,
} from "../types.ts";

type Row = Record<string, unknown>;

export interface TcbsProviderOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Shares outstanding by ticker (from the securities sync). Missing tickers get null. */
  sharesByTicker?: ReadonlyMap<string, number>;
  /** A board counts as a finished session only if at least this share of rows traded. */
  minTradedShare?: number;
  now?: () => Date;
}

export interface Board {
  /** ISO date taken from the board's own tradingDate. */
  date: SessionDate | null;
  rows: Row[];
}

const SOURCE = "TCBS OpenAPI tickerSnaps";

/** "13/11/2026" to "2026-11-13". null when the text is not a dd/MM/yyyy date. */
export function parseTradingDate(text: unknown): SessionDate | null {
  if (typeof text !== "string") return null;
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** One board row to a DailyBar. Absent or non-numeric fields become null, never 0. */
export function boardRowToBar(
  row: Row,
  date: SessionDate,
  fetchedAt: string,
  shares: number | null,
): DailyBar {
  const volume = num(row.totalVolume);
  return {
    ticker: String(row.symbol),
    sessionDate: date,
    open: num(row.open),
    high: num(row.high),
    low: num(row.low),
    // matchPrice is present even on rows that never traded, so it only counts when volume exists.
    close: volume === null ? null : num(row.matchPrice),
    reference: num(row.refPrice),
    ceiling: num(row.ceilPrice),
    floor: num(row.floorPrice),
    volume,
    sharesOutstanding: shares,
    source: SOURCE,
    fetchedAt,
    isFixture: false,
  };
}

const EXCHANGES: Record<string, Exchange> = { "001": "HOSE", "002": "HNX", "005": "UPCOM" };
const STATUSES: Record<string, TradingStatus> = {
  "001": "trading",
  "002": "suspended",
  "003": "suspended",
};

export interface ParsedSecurity extends SecurityInfo {
  /** TCBS secType: 001 common stock, 002 preferred, 003 convertible bond, 006 bond. */
  secType: string | null;
  listingDate: SessionDate | null;
}

/** Parses one item of /ananke/v1/securities. listingQtty is the listed share count. */
export function parseSecurityItem(item: Row): ParsedSecurity {
  const info = (
    typeof item.securitiesInfo === "object" && item.securitiesInfo !== null
      ? item.securitiesInfo
      : {}
  ) as Row;
  const listing = typeof info.listingDate === "string" ? info.listingDate.slice(0, 10) : null;
  const qty = num(info.listingQtty);
  return {
    ticker: String(item.symbol),
    companyName: typeof item.issuerName === "string" ? item.issuerName : null,
    exchange: EXCHANGES[String(item.tradePlace)] ?? null,
    status: item.halt === "Y" ? "suspended" : (STATUSES[String(info.status)] ?? null),
    sharesOutstanding: qty !== null && qty > 0 ? qty : null,
    secType: typeof item.secType === "string" ? item.secType : null,
    listingDate: listing && /^\d{4}-\d{2}-\d{2}$/.test(listing) ? listing : null,
  };
}

export interface TcbsProvider extends MarketDataProvider {
  fetchBoard(): Promise<Board>;
  /** Daily bars for one ticker or index, newest last, paged backwards from `to`. */
  fetchBars(
    ticker: string,
    type: "stock" | "index",
    to: SessionDate,
    count: number,
  ): Promise<{ date: SessionDate; close: number | null }[]>;
  getSecurity(ticker: string): Promise<ParsedSecurity | null>;
}

export function createTcbsProvider(opts: TcbsProviderOptions): TcbsProvider {
  const now = opts.now ?? (() => new Date());
  const minTraded = opts.minTradedShare ?? 0.5;
  const call = (r: Omit<TcbsRequest, "token" | "baseUrl" | "fetchImpl">) =>
    tcbsRequest({ ...r, token: opts.token, baseUrl: opts.baseUrl, fetchImpl: opts.fetchImpl });

  function endOfDayEpoch(d: SessionDate): number {
    return Math.floor(Date.parse(`${d}T23:59:59Z`) / 1000);
  }

  async function fetchBars(
    ticker: string,
    type: "stock" | "index",
    to: SessionDate,
    count: number,
  ) {
    const out: { date: SessionDate; close: number | null }[] = [];
    let cursor = endOfDayEpoch(to);
    for (let page = 0; page < 20 && out.length < count; page++) {
      const res = await call({
        method: "GET",
        path: "/nyx/v2/stock/bars-long-term",
        query: {
          ticker,
          type,
          resolution: "D",
          to: cursor,
          countBack: Math.min(250, count - out.length),
        },
      });
      if (res.status !== 200) throw new Error(`bars ${ticker}: HTTP ${res.status}`);
      const data = (res.body as Row | null)?.data;
      const rows = Array.isArray(data) ? (data as Row[]) : [];
      if (!rows.length) break;
      const chunk = rows.map((r) => ({
        date: String(r.tradingDate).slice(0, 10),
        close: num(r.close),
      }));
      const seen = new Set(out.map((b) => b.date));
      out.unshift(...chunk.filter((b) => !seen.has(b.date)));
      const next = Math.floor(Date.parse(`${chunk[0].date}T00:00:00Z`) / 1000) - 1;
      if (next >= cursor) break;
      cursor = next;
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  async function fetchBoard(): Promise<Board> {
    const res = await call({
      method: "GET",
      path: "/tartarus/v1/tickerSnaps",
      query: { index: 1 },
    });
    if (res.status !== 200) throw new Error(`tickerSnaps: HTTP ${res.status}`);
    const body = (res.body ?? {}) as Row;
    const rows = Array.isArray(body.data) ? (body.data as Row[]) : [];
    return {
      date: parseTradingDate(body.tradingDate),
      rows: rows.filter((r) => typeof r.symbol === "string"),
    };
  }

  return {
    id: "tcbs",
    isFixture: false,
    fetchBoard,
    fetchBars,

    async listSecurities() {
      // The board is the HOSE list. Names, share counts and types come from getSecurity (one call each).
      const board = await fetchBoard();
      return board.rows.map((r) => ({
        ticker: String(r.symbol),
        companyName: null,
        exchange: "HOSE" as const,
        status: null,
        sharesOutstanding: null,
      }));
    },

    async getSecurity(ticker) {
      const res = await call({
        method: "GET",
        path: "/ananke/v1/securities",
        query: { fields: "all", filter: `symbol=${ticker}` },
      });
      if (res.status !== 200) throw new Error(`securities ${ticker}: HTTP ${res.status}`);
      const content = (res.body as Row | null)?.content;
      const item = Array.isArray(content) ? (content as Row[])[0] : undefined;
      return item ? parseSecurityItem(item) : null;
    },

    async getDailyBars(date) {
      const board = await fetchBoard();
      // The board only ever describes the latest session. Any other date is not available here.
      if (board.date !== date || board.rows.length === 0) return [];
      const traded = board.rows.filter((r) => num(r.totalVolume) !== null).length;
      // Pre-open boards carry the new date with no trades at all. Not a finished session.
      if (traded / board.rows.length < minTraded) return [];
      const fetchedAt = now().toISOString();
      return board.rows.map((r) =>
        boardRowToBar(r, date, fetchedAt, opts.sharesByTicker?.get(String(r.symbol)) ?? null),
      );
    },

    async getIndexSessions(from, to) {
      const count = Math.min(5000, Math.ceil((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1);
      const bars = await fetchBars("VNINDEX", "index", to, count);
      return bars.map((b) => b.date).filter((d) => d >= from && d <= to);
    },
  };
}
