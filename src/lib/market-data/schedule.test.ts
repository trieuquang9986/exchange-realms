import { describe, expect, it } from "vitest";
import { isAfterMarketClose, vietnamClock } from "./schedule";
import { boardSignature, compareCloses, diagnoseBoard } from "./tcbs/diagnostics";

describe("Vietnam clock and the after-close guard", () => {
  it("converts UTC to Vietnam time (UTC+7)", () => {
    expect(vietnamClock(new Date("2026-11-13T08:09:00Z"))).toEqual({
      date: "2026-11-13",
      minutes: 15 * 60 + 9,
    });
    expect(vietnamClock(new Date("2026-11-13T18:30:00Z")).date).toBe("2026-11-14"); // 01:30 next day
  });

  it("is false before 15:10, true from 15:10, on the same day", () => {
    expect(isAfterMarketClose("2026-11-13", new Date("2026-11-13T08:09:00Z"))).toBe(false);
    expect(isAfterMarketClose("2026-11-13", new Date("2026-11-13T08:10:00Z"))).toBe(true);
    expect(isAfterMarketClose("2026-11-13", new Date("2026-11-13T02:00:00Z"))).toBe(false); // 09:00, the pre-open case
  });

  it("past days are over and future days are not", () => {
    expect(isAfterMarketClose("2026-11-12", new Date("2026-11-13T02:00:00Z"))).toBe(true);
    expect(isAfterMarketClose("2026-11-14", new Date("2026-11-13T10:00:00Z"))).toBe(false);
  });
});

describe("board diagnostics", () => {
  const rows = [
    {
      symbol: "A",
      refPrice: 10000,
      ceilPrice: 10700,
      floorPrice: 9300,
      matchPrice: 10700,
      changePercent: 7,
      totalVolume: 100,
      totalValue: 1070000,
    },
    {
      symbol: "B",
      refPrice: 20000,
      ceilPrice: 21400,
      floorPrice: 18600,
      matchPrice: 18600,
      changePercent: -7,
      totalVolume: 50,
      totalValue: 930000,
    },
    { symbol: "C", refPrice: 30000, ceilPrice: 32100, floorPrice: 27900, matchPrice: 30000 }, // no volume
    { symbol: "D", refPrice: 40000, ceilPrice: 42800, floorPrice: 37200 },
  ];

  it("counts traded and idle rows and limit closes", () => {
    const d = diagnoseBoard(rows);
    expect(d).toMatchObject({
      rows: 4,
      withVolume: 2,
      noVolume: 2,
      noVolumeWithMatchPrice: 1,
      closedAtCeiling: 1,
      closedAtFloor: 1,
      missingReference: 0,
    });
  });

  it("checks our percent change against TCBS's and flags differences", () => {
    expect(diagnoseBoard(rows).changePercent).toEqual({
      compared: 2,
      maxAbsDiffPct: 0,
      rowsDifferingOver0_01: 0,
    });
    const off = diagnoseBoard([{ ...rows[0], changePercent: 6.5 }]);
    expect(off.changePercent.rowsDifferingOver0_01).toBe(1);
  });

  it("recognises volume in shares and flags other units", () => {
    expect(diagnoseBoard(rows).volumeUnit.verdict).toBe("shares");
    const lots = diagnoseBoard([{ ...rows[0], totalVolume: 1 }]); // value is 100x volume x price
    expect(lots.volumeUnit.verdict).toBe("lots-of-100?");
    expect(diagnoseBoard([rows[3]]).volumeUnit.verdict).toBe("unknown");
  });

  it("compares board closes with daily-bar closes", () => {
    const r = compareCloses([
      { ticker: "A", board: 10, bars: 10 },
      { ticker: "B", board: 20, bars: 21 },
      { ticker: "C", board: null, bars: 5 },
    ]);
    expect(r).toMatchObject({ compared: 2, mismatches: 1 });
  });
});

describe("board field report and settle signature", () => {
  it("lists the fields TCBS sent with their types, so numbers arriving as strings are visible", () => {
    const d = diagnoseBoard([
      { symbol: "A", refPrice: "10000", ceilPrice: 10700, totalVolume: null },
      { symbol: "B", refPrice: 20000, room: "5" },
    ]);
    expect(d.fieldsSeen).toEqual(["ceilPrice", "refPrice", "room", "symbol"]);
    expect(d.fieldTypes.refPrice).toBe("number|string");
    expect(d.fieldTypes.ceilPrice).toBe("number");
    expect(d.missingReference).toBe(1); // the string "10000" does not count as a usable price
  });

  it("signature is equal for an unchanged board and different once a trade arrives", () => {
    const rows = [{ symbol: "A", totalVolume: 100 }, { symbol: "B" }];
    expect(boardSignature(rows)).toBe(boardSignature([...rows]));
    expect(boardSignature(rows)).not.toBe(
      boardSignature([{ symbol: "A", totalVolume: 150 }, { symbol: "B" }]),
    );
  });
});
