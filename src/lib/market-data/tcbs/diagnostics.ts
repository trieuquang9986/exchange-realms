// Checks on a raw TCBS board, run by the ingest command. They report; they never change data.
// They answer questions the spikes could not: does matchPrice equal the close, does TCBS's
// changePercent match ours, and is volume in shares?

type Row = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export interface BoardDiagnostics {
  rows: number;
  withVolume: number;
  noVolume: number;
  noVolumeWithMatchPrice: number;
  closedAtCeiling: number;
  closedAtFloor: number;
  missingReference: number;
  /** Every field TCBS sent on at least one row, and the JS type(s) seen, to catch string-vs-number surprises. */
  fieldsSeen: string[];
  fieldTypes: Record<string, string>;
  changePercent: { compared: number; maxAbsDiffPct: number | null; rowsDifferingOver0_01: number };
  volumeUnit: {
    compared: number;
    medianRatio: number | null;
    verdict: "shares" | "lots-of-100?" | "unknown";
  };
}

export function diagnoseBoard(rows: Row[]): BoardDiagnostics {
  const traded = rows.filter((r) => num(r.totalVolume) !== null);
  const idle = rows.filter((r) => num(r.totalVolume) === null);

  const diffs: number[] = [];
  for (const r of traded) {
    const pct = num(r.changePercent);
    const match = num(r.matchPrice);
    const ref = num(r.refPrice);
    if (pct !== null && match !== null && ref !== null && ref > 0) {
      diffs.push(Math.abs((match / ref - 1) * 100 - pct));
    }
  }

  // totalValue / (totalVolume x price) is about 1 when volume is in shares and value in VND.
  const ratios: number[] = [];
  for (const r of traded) {
    const v = num(r.totalVolume);
    const val = num(r.totalValue);
    const price = num(r.matchPrice);
    if (v && val && price) ratios.push(val / (v * price));
  }
  ratios.sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  const verdict =
    median === null
      ? "unknown"
      : median > 0.9 && median < 1.1
        ? "shares"
        : median > 90 && median < 110
          ? "lots-of-100?"
          : "unknown";

  return {
    rows: rows.length,
    withVolume: traded.length,
    noVolume: idle.length,
    noVolumeWithMatchPrice: idle.filter((r) => num(r.matchPrice) !== null).length,
    closedAtCeiling: traded.filter(
      (r) => num(r.matchPrice) !== null && r.matchPrice === r.ceilPrice,
    ).length,
    closedAtFloor: traded.filter((r) => num(r.matchPrice) !== null && r.matchPrice === r.floorPrice)
      .length,
    missingReference: rows.filter((r) => num(r.refPrice) === null).length,
    ...describeFields(rows),
    changePercent: {
      compared: diffs.length,
      maxAbsDiffPct: diffs.length ? Math.round(Math.max(...diffs) * 10000) / 10000 : null,
      rowsDifferingOver0_01: diffs.filter((d) => d > 0.01).length,
    },
    volumeUnit: {
      compared: ratios.length,
      medianRatio: median === null ? null : Math.round(median * 1000) / 1000,
      verdict,
    },
  };
}

/** Compares closes taken from the board with closes from the daily-bars endpoint for the same date. */
export function compareCloses(
  pairs: { ticker: string; board: number | null; bars: number | null }[],
) {
  const comparable = pairs.filter((p) => p.board !== null && p.bars !== null);
  const mismatches = comparable.filter((p) => p.board !== p.bars);
  return {
    compared: comparable.length,
    mismatches: mismatches.length,
    examples: mismatches.slice(0, 5),
  };
}

function describeFields(rows: Row[]): { fieldsSeen: string[]; fieldTypes: Record<string, string> } {
  const types = new Map<string, Set<string>>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (v === null || v === undefined) continue;
      if (!types.has(k)) types.set(k, new Set());
      types.get(k)!.add(typeof v);
    }
  }
  const keys = [...types.keys()].sort();
  return {
    fieldsSeen: keys,
    fieldTypes: Object.fromEntries(keys.map((k) => [k, [...types.get(k)!].sort().join("|")])),
  };
}

/** Changes whenever a trade is added or a volume moves. Two equal signatures mean the board has settled. */
export function boardSignature(rows: Row[]): string {
  let withVolume = 0;
  let total = 0;
  for (const r of rows) {
    const v = num(r.totalVolume);
    if (v !== null) {
      withVolume += 1;
      total += v;
    }
  }
  return `${rows.length}:${withVolume}:${total}`;
}
