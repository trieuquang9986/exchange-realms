import { describe, expect, it } from "vitest";
import { createTcbsProvider, parseSecurityItem, parseTradingDate } from "./provider";
import { ingestSession } from "../ingest";
import { MemorySessionStore } from "../memory-store";

// SYNTHETIC payloads shaped like the TCBS responses seen in the spikes. No real market data is stored
// in this repository (TCBS redistribution terms are unknown). Tickers and numbers are made up.

const POST_CLOSE_BOARD = {
  tradingDate: "13/11/2026",
  data: [
    {
      symbol: "AAA",
      refPrice: 10000,
      ceilPrice: 10700,
      floorPrice: 9300,
      open: 10000,
      high: 10300,
      low: 9900,
      matchPrice: 10200,
      matchQtty: 100,
      change: 200,
      changePercent: 2,
      totalVolume: 5000,
      totalValue: 51000000,
      room: "100",
    },
    {
      symbol: "BBB",
      refPrice: 20000,
      ceilPrice: 21400,
      floorPrice: 18600,
      matchPrice: 21400,
      totalVolume: 800,
      totalValue: 17120000,
    },
    // Did not trade today, yet TCBS still sends a matchPrice (seen live on 44 rows).
    { symbol: "CCC", refPrice: 30000, ceilPrice: 32100, floorPrice: 27900, matchPrice: 30000 },
    { symbol: "DDD", refPrice: 40000, ceilPrice: 42800, floorPrice: 37200 },
  ],
};

const PRE_OPEN_BOARD = {
  tradingDate: "13/11/2026",
  data: POST_CLOSE_BOARD.data.map((r) => ({
    symbol: r.symbol,
    refPrice: r.refPrice,
    ceilPrice: r.ceilPrice,
    floorPrice: r.floorPrice,
  })),
};

const INDEX_BARS = ["2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map((d) => ({
  open: 1700,
  high: 1710,
  low: 1690,
  close: 1705.5,
  volume: 1,
  tradingDate: `${d}T00:00:00.000Z`,
}));

function fakeTcbs(board: unknown) {
  const calls: { method: string; path: string; query: string }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    calls.push({ method: String(init.method), path: u.pathname, query: u.search });
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (u.pathname.endsWith("/tickerSnaps")) return json(board);
    if (u.pathname.endsWith("/bars-long-term")) {
      const to = Number(u.searchParams.get("to"));
      return json({ data: INDEX_BARS.filter((b) => Date.parse(b.tradingDate) / 1000 <= to) });
    }
    if (u.pathname.endsWith("/securities")) return json({ content: [] });
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const NOW = () => new Date("2026-11-13T09:00:00Z");

describe("parseTradingDate", () => {
  it("converts dd/MM/yyyy and rejects other text", () => {
    expect(parseTradingDate("13/11/2026")).toBe("2026-11-13");
    expect(parseTradingDate("2026-11-13")).toBeNull();
    expect(parseTradingDate(undefined)).toBeNull();
  });
});

describe("TCBS provider: getDailyBars", () => {
  it("maps a finished board, taking a close only from rows that traded", async () => {
    const { fetchImpl } = fakeTcbs(POST_CLOSE_BOARD);
    const p = createTcbsProvider({
      token: "t",
      fetchImpl,
      now: NOW,
      sharesByTicker: new Map([["AAA", 1_000_000]]),
      minTradedShare: 0.5,
    });
    const bars = await p.getDailyBars("2026-11-13");
    const by = Object.fromEntries(bars.map((b) => [b.ticker, b]));
    expect(by.AAA).toMatchObject({
      close: 10200,
      reference: 10000,
      ceiling: 10700,
      floor: 9300,
      volume: 5000,
      sharesOutstanding: 1_000_000,
      isFixture: false,
    });
    expect(by.BBB.close).toBe(21400);
    expect(by.BBB.sharesOutstanding).toBeNull(); // no shares known: null, never 0
    expect(by.CCC.close).toBeNull(); // matchPrice present but no volume
    expect(by.CCC.volume).toBeNull();
    expect(by.DDD.close).toBeNull();
    expect(by.CCC.reference).toBe(30000);
  });

  it("returns nothing for a pre-open board that already shows the new date", async () => {
    const { fetchImpl } = fakeTcbs(PRE_OPEN_BOARD);
    const p = createTcbsProvider({ token: "t", fetchImpl, now: NOW });
    expect(await p.getDailyBars("2026-11-13")).toEqual([]);
  });

  it("returns nothing when the board is for a different date than asked", async () => {
    const { fetchImpl } = fakeTcbs(POST_CLOSE_BOARD);
    const p = createTcbsProvider({ token: "t", fetchImpl, now: NOW, minTradedShare: 0.1 });
    expect(await p.getDailyBars("2026-11-12")).toEqual([]);
  });

  it("only sends allowlisted GET requests", async () => {
    const { fetchImpl, calls } = fakeTcbs(POST_CLOSE_BOARD);
    const p = createTcbsProvider({ token: "t", fetchImpl, now: NOW, minTradedShare: 0.1 });
    await p.getDailyBars("2026-11-13");
    await p.getIndexSessions("2026-11-10", "2026-11-13");
    await p.getSecurity("AAA");
    expect(calls.length).toBeGreaterThan(2);
    for (const c of calls) {
      expect(c.method).toBe("GET");
      expect([
        "/tartarus/v1/tickerSnaps",
        "/nyx/v2/stock/bars-long-term",
        "/ananke/v1/securities",
      ]).toContain(c.path);
    }
  });
});

describe("TCBS provider: calendar and securities", () => {
  it("takes trading sessions from VN-Index bars within the range", async () => {
    const { fetchImpl } = fakeTcbs(POST_CLOSE_BOARD);
    const p = createTcbsProvider({ token: "t", fetchImpl, now: NOW });
    expect(await p.getIndexSessions("2026-11-11", "2026-11-13")).toEqual([
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
  });

  it("lists the board symbols as HOSE securities with unknown details as null", async () => {
    const { fetchImpl } = fakeTcbs(POST_CLOSE_BOARD);
    const p = createTcbsProvider({ token: "t", fetchImpl, now: NOW });
    const list = await p.listSecurities();
    expect(list.map((s) => s.ticker)).toEqual(["AAA", "BBB", "CCC", "DDD"]);
    expect(list[0]).toMatchObject({ exchange: "HOSE", companyName: null, sharesOutstanding: null });
  });

  it("parses a securities item, keeping unknowns null", () => {
    const parsed = parseSecurityItem({
      symbol: "AAA",
      secType: "001",
      tradePlace: "001",
      halt: "N",
      issuerName: "Cong ty mau",
      securitiesInfo: {
        listingQtty: 1_000_000,
        status: "001",
        listingDate: "2015-06-01T00:00:00.000+07:00",
      },
    });
    expect(parsed).toMatchObject({
      ticker: "AAA",
      companyName: "Cong ty mau",
      exchange: "HOSE",
      status: "trading",
      sharesOutstanding: 1_000_000,
      secType: "001",
      listingDate: "2015-06-01",
    });
    const bare = parseSecurityItem({ symbol: "ZZZ" });
    expect(bare).toMatchObject({
      exchange: null,
      status: null,
      sharesOutstanding: null,
      listingDate: null,
    });
    expect(parseSecurityItem({ symbol: "Y", halt: "Y" }).status).toBe("suspended");
  });
});

describe("TCBS provider with the ingest step", () => {
  it("is not-ready before the open and commits after the close", async () => {
    const store = new MemorySessionStore();
    const pre = createTcbsProvider({
      token: "t",
      fetchImpl: fakeTcbs(PRE_OPEN_BOARD).fetchImpl,
      now: NOW,
    });
    expect((await ingestSession(pre, store, "2026-11-13")).status).toBe("not-ready");
    expect(store.sessions.size).toBe(0);

    const post = createTcbsProvider({
      token: "t",
      fetchImpl: fakeTcbs(POST_CLOSE_BOARD).fetchImpl,
      now: NOW,
      minTradedShare: 0.1,
    });
    expect(await ingestSession(post, store, "2026-11-13")).toEqual({
      status: "committed",
      date: "2026-11-13",
      count: 4,
    });
  });
});
