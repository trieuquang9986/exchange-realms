// TCBS spike (plan Phase 1, task 2). Run on the OWNER's machine:  node scripts/tcbs-spike.mts
// Reads TCBS_API_KEY from the environment or .env.local, asks for the Smart OTP with hidden input,
// calls only allowlisted TCBS endpoints (see src/lib/market-data/tcbs/allowlist.ts), and writes a report
// to spike-output/. The report holds field names, counts, timings and public market figures only.
// It never contains the API key, the OTP or the token, and is scanned for them before it is saved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { BASE_URL, API_KEY_INFO_PATH, TOKEN_PATH } from "../src/lib/market-data/tcbs/allowlist.ts";
import { tcbsRequest } from "../src/lib/market-data/tcbs/client.ts";
import type { TcbsResponse } from "../src/lib/market-data/tcbs/client.ts";

type Json = Record<string, unknown>;
interface StepResult {
  step: string;
  ok: boolean;
  status?: number;
  ms?: number;
  notes: Json;
}

const results: StepResult[] = [];
const secrets: string[] = [];

// ---------- helpers ----------
function loadApiKey(): string {
  if (process.env.TCBS_API_KEY) return process.env.TCBS_API_KEY.trim();
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*TCBS_API_KEY\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  return "";
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    let buf = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const c of chunk) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(buf.trim());
          return;
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on("data", onData);
  });
}

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const keysOf = (v: unknown): string[] => (isObj(v) ? Object.keys(v).sort() : []);

function errorText(body: unknown): string {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return (raw ?? "").slice(0, 200);
}

async function step(
  name: string,
  fn: () => Promise<{ res?: TcbsResponse; ok?: boolean; notes: Json }>,
): Promise<StepResult> {
  let r: StepResult;
  try {
    const out = await fn();
    r = {
      step: name,
      ok: out.ok ?? (out.res ? out.res.status >= 200 && out.res.status < 300 : true),
      status: out.res?.status,
      ms: out.res?.ms,
      notes: out.notes,
    };
  } catch (err) {
    r = {
      step: name,
      ok: false,
      notes: { error: err instanceof Error ? err.message : String(err) },
    };
  }
  results.push(r);
  console.log(
    `${r.ok ? "OK  " : "FAIL"} ${name}${r.status ? ` (HTTP ${r.status}, ${r.ms} ms)` : ""}`,
  );
  return r;
}

/** Per-field presence and zero counts. TCBS omits null fields, so "missing" means the key is absent. */
function coverage(rows: Json[], fields: string[]): Json {
  const out: Json = {};
  for (const f of fields) {
    const present = rows.filter((r) => r[f] !== undefined && r[f] !== null).length;
    const zero = rows.filter((r) => r[f] === 0).length;
    out[f] = { present, missing: rows.length - present, zero };
  }
  return out;
}

function jwtClaims(token: string): Json {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as Json;
    const exp = typeof payload.exp === "number" ? payload.exp : undefined;
    const iat = typeof payload.iat === "number" ? payload.iat : undefined;
    return {
      claimNames: Object.keys(payload).sort(),
      issuedAt: iat ? new Date(iat * 1000).toISOString() : null,
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      lifetimeHours: exp && iat ? Math.round(((exp - iat) / 3600) * 100) / 100 : null,
      // Permission names only (no identity claims such as email or account ids). Shows whether the
      // token could do more than read market data. stepup_exp is a timestamp, not a secret.
      permissions: Object.fromEntries(
        ["scope", "scopes", "roles"]
          .filter((k) => k in payload)
          .map((k) => [k, payload[k]])
          .filter(
            ([, v]) =>
              typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string")),
          ),
      ),
      stepUpExpiresAt:
        typeof payload.stepup_exp === "number"
          ? new Date(payload.stepup_exp * 1000).toISOString()
          : null,
    };
  } catch {
    return { decodeError: true };
  }
}

function percentile(sorted: number[], p: number): number {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : NaN;
}

// ---------- main ----------
async function main() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error(
      "TCBS_API_KEY not found. Put it in .env.local (TCBS_API_KEY=...) or the environment.",
    );
    process.exit(1);
  }
  secrets.push(apiKey);

  // Test hook: a local mock server only. Real runs always use the fixed TCBS base URL.
  const override = process.env.TCBS_SPIKE_BASE_URL;
  const baseUrl =
    override && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(override) ? override : BASE_URL;
  const call = (r: Parameters<typeof tcbsRequest>[0]) => tcbsRequest({ baseUrl, ...r });

  console.log(`TCBS spike against ${baseUrl}. Only allowlisted endpoints are called.\n`);

  await step("1. API key expiry", async () => {
    const res = await call({ method: "POST", path: API_KEY_INFO_PATH, body: { apiKey } });
    const expire = isObj(res.body) ? res.body.expireDate : undefined;
    const days =
      typeof expire === "string"
        ? Math.round((Date.parse(expire) - Date.now()) / 86_400_000)
        : null;
    return {
      res,
      notes:
        res.status < 300
          ? { responseKeys: keysOf(res.body), expireDate: expire ?? null, daysLeft: days }
          : { error: errorText(res.body) },
    };
  });

  const otp = await promptHidden("Smart OTP from TCInvest (input hidden): ");
  secrets.push(otp);

  let token = "";
  await step("2. Token exchange (OTP + API key -> JWT)", async () => {
    const res = await call({ method: "POST", path: TOKEN_PATH, body: { apiKey, otp } });
    const t = isObj(res.body) && typeof res.body.token === "string" ? res.body.token : "";
    if (t) {
      token = t;
      secrets.push(t);
    }
    return {
      res,
      ok: Boolean(t),
      notes: t
        ? {
            responseKeys: keysOf(res.body),
            ...jwtClaims(t),
            refreshTokenInResponse: keysOf(res.body).some((k) => /refresh/i.test(k)),
          }
        : { error: errorText(res.body) },
    };
  });
  if (!token) {
    finish(
      "Token exchange failed, so no data calls were made. Check the OTP and key, then run again.",
    );
    return;
  }

  const get = (path: string, query: Record<string, string | number> = {}) =>
    call({ method: "GET", path, query, token });

  // 3 and 4: whole-board snapshots for HOSE (index=1)
  let hoseSymbols: string[] = [];
  let hoseRows: Json[] = [];
  const snapFields = [
    "refPrice",
    "ceilPrice",
    "floorPrice",
    "matchPrice",
    "matchQtty",
    "change",
    "changePercent",
    "totalVolume",
    "totalValue",
    "room",
  ];
  await step("3. tickerSnaps, all HOSE in one call", async () => {
    const res = await get("/tartarus/v1/tickerSnaps", { index: 1 });
    const rows = isObj(res.body) && Array.isArray(res.body.data) ? (res.body.data as Json[]) : [];
    hoseSymbols = rows.map((r) => String(r.symbol)).filter(Boolean);
    hoseRows = rows;
    const noVolume = rows.filter((r) => r.totalVolume === undefined);
    const noChange = rows.filter((r) => r.change === undefined);
    return {
      res,
      ok: res.status < 300 && rows.length > 0,
      notes: {
        tradingDate: isObj(res.body) ? res.body.tradingDate : null,
        rowCount: rows.length,
        fieldsSeenOnRows: [...new Set(rows.flatMap((r) => Object.keys(r)))].sort(),
        coverage: coverage(rows, snapFields),
        firstSymbols: hoseSymbols.slice(0, 5),
        // How to read rows with no trades or no change: are they "unchanged at the reference price"?
        noVolumeRows: noVolume.length,
        noVolumeRowsWithMatchPrice: noVolume.filter((r) => r.matchPrice !== undefined).length,
        noVolumeRowsMatchPriceEqualsRef: noVolume.filter(
          (r) => r.matchPrice !== undefined && r.matchPrice === r.refPrice,
        ).length,
        noChangeRows: noChange.length,
        noChangeRowsMatchPriceEqualsRef: noChange.filter((r) => r.matchPrice === r.refPrice).length,
        // Plan acceptance: our % change (against refPrice) vs the figure TCBS publishes.
        changePercentCheck: (() => {
          const both = rows.filter(
            (r) =>
              typeof r.changePercent === "number" &&
              typeof r.matchPrice === "number" &&
              typeof r.refPrice === "number" &&
              r.refPrice > 0,
          );
          const diffs = both.map((r) =>
            Math.abs(
              ((r.matchPrice as number) / (r.refPrice as number) - 1) * 100 -
                (r.changePercent as number),
            ),
          );
          return {
            compared: both.length,
            maxAbsDiffPct: diffs.length ? Math.round(Math.max(...diffs) * 10000) / 10000 : null,
            rowsDifferingOver0_01: diffs.filter((d) => d > 0.01).length,
          };
        })(),
        closedAtCeiling: rows.filter(
          (r) => r.matchPrice !== undefined && r.matchPrice === r.ceilPrice,
        ).length,
        closedAtFloor: rows.filter(
          (r) => r.matchPrice !== undefined && r.matchPrice === r.floorPrice,
        ).length,
        error: rows.length ? undefined : errorText(res.body),
      },
    };
  });

  await step("4. tickerCommons, all HOSE in one call", async () => {
    const res = await get("/tartarus/v1/tickerCommons", { index: 1 });
    const rows = isObj(res.body) && Array.isArray(res.body.data) ? (res.body.data as Json[]) : [];
    const symbols = new Set(rows.map((r) => String(r.symbol)));
    return {
      res,
      ok: res.status < 300 && rows.length > 0,
      notes: {
        tradingDate: isObj(res.body) ? res.body.tradingDate : null,
        rowCount: rows.length,
        fieldsSeenOnRows: [...new Set(rows.flatMap((r) => Object.keys(r)))].sort(),
        coverage: coverage(rows, [
          "refPrice",
          "ceilPrice",
          "floorPrice",
          "open",
          "high",
          "low",
          "totalVol",
        ]),
        symbolsOnlyInCommons: [...symbols].filter((s) => !hoseSymbols.includes(s)).length,
        symbolsOnlyInSnaps: hoseSymbols.filter((s) => !symbols.has(s)).length,
        error: rows.length ? undefined : errorText(res.body),
      },
    };
  });

  // 5: securities info, page 0 of everything
  let sampleStocks: string[] = [];
  await step("5. securities info (page 0, all fields)", async () => {
    let res = await get("/ananke/v1/securities", { fields: "all" });
    const attempts: Json[] = [{ query: "fields=all", status: res.status }];
    if (res.status >= 300 && hoseSymbols[0]) {
      // Diagnose: does a single-symbol filter work when the bulk query does not?
      const one = await get("/ananke/v1/securities", {
        fields: "all",
        filter: `symbol=${hoseSymbols[0]}`,
      });
      attempts.push({
        query: "fields=all&filter=symbol=<one symbol>",
        status: one.status,
        error: one.status >= 300 ? errorText(one.body) : undefined,
      });
      if (one.status < 300) res = one;
    }
    const b = isObj(res.body) ? res.body : {};
    const items = Array.isArray(b.content) ? (b.content as Json[]) : [];
    const tally = (f: string) =>
      items.reduce<Record<string, number>>((acc, it) => {
        const k = String(it[f]);
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});
    const hoseCommon = items.filter((i) => i.tradePlace === "001" && i.secType === "001");
    sampleStocks = hoseCommon
      .map((i) => String(i.symbol))
      .filter((s) => hoseSymbols.includes(s))
      .filter((_, i, a) => i === 0 || i === Math.floor(a.length / 2) || i === a.length - 1);
    const info = (items.find((i) => isObj(i.securitiesInfo))?.securitiesInfo ?? {}) as Json;
    return {
      res,
      ok: res.status < 300 && items.length > 0,
      notes: {
        attempts,
        wrapperKeys: Object.keys(b)
          .filter((k) => k !== "content")
          .sort(),
        totalElements: b.totalElements ?? null,
        totalPages: b.totalPages ?? null,
        pageSize: b.size ?? null,
        itemCount: items.length,
        itemKeys: [...new Set(items.flatMap((i) => Object.keys(i)))].sort(),
        securitiesInfoKeys: Object.keys(info).sort(),
        byTradePlace: tally("tradePlace"),
        bySecType: tally("secType"),
        hoseCommonStockCount: hoseCommon.length,
        industryLikeKeys: [...new Set(items.flatMap((i) => Object.keys(i)))].filter((k) =>
          /industry|sector|icb|nganh/i.test(k),
        ),
        shareCountFieldPresentOnHoseStocks: hoseCommon.filter(
          (i) => isObj(i.securitiesInfo) && (i.securitiesInfo as Json).listingQtty !== undefined,
        ).length,
        sampleHoseStocks: sampleStocks,
        error: items.length ? undefined : errorText(res.body),
      },
    };
  });

  // 6: index bars
  const now = Math.floor(Date.now() / 1000);
  let indexTicker = "";
  await step("6. VN-Index daily bars", async () => {
    const tried: Json[] = [];
    for (const ticker of ["VNINDEX", "VN-INDEX"]) {
      const res = await get("/nyx/v2/stock/bars-long-term", {
        ticker,
        type: "index",
        resolution: "D",
        to: now,
        countBack: 10,
      });
      const rows = isObj(res.body) && Array.isArray(res.body.data) ? (res.body.data as Json[]) : [];
      tried.push({ ticker, status: res.status, bars: rows.length });
      if (rows.length) {
        indexTicker = ticker;
        return {
          res,
          notes: {
            tickerThatWorked: ticker,
            tried,
            barKeys: keysOf(rows[0]),
            firstDate: rows[0].tradingDate,
            lastDate: rows[rows.length - 1].tradingDate,
          },
        };
      }
    }
    return {
      ok: false,
      notes: {
        tried,
        note: "Neither guessed index ticker returned bars. Ask TCBS which ticker to use for VN-Index.",
      },
    };
  });

  // 7: history depth (paged backwards because one call returns at most ~250 bars), units, adjustment
  await step("7. History depth and adjustment check (10 liquid stocks + index)", async () => {
    const byValue = [...hoseRows]
      .sort((x, y) => Number(y.totalValue ?? 0) - Number(x.totalValue ?? 0))
      .map((r) => String(r.symbol));
    const stocks = [...new Set([...sampleStocks, ...byValue])].slice(0, 10);
    const targets = [
      ...stocks.map((ticker) => ({ ticker, type: "stock" })),
      ...(indexTicker ? [{ ticker: indexTicker, type: "index" }] : []),
    ];
    const out: Json[] = [];
    let stopped = "";
    for (const t of targets) {
      if (stopped) break;
      let bars: { date: string; close: number }[] = [];
      let to = now;
      const pageSizes: number[] = [];
      for (let page = 0; page < 16; page++) {
        const res = await get("/nyx/v2/stock/bars-long-term", {
          ...t,
          resolution: "D",
          to,
          countBack: 1000,
        });
        if (res.status === 429) {
          stopped = `HTTP 429 while paging ${t.ticker}`;
          break;
        }
        const rows =
          isObj(res.body) && Array.isArray(res.body.data) ? (res.body.data as Json[]) : [];
        pageSizes.push(rows.length);
        if (!rows.length) break;
        const chunk = rows.map((r) => ({
          date: String(r.tradingDate).slice(0, 10),
          close: Number(r.close),
        }));
        bars = [...chunk, ...bars.filter((x) => x.date > chunk[chunk.length - 1].date)];
        const nextTo = Math.floor(Date.parse(`${chunk[0].date}T00:00:00Z`) / 1000) - 86400;
        if (nextTo >= to) break;
        to = nextTo;
        await new Promise((r) => setTimeout(r, 400));
      }
      const closes = bars.map((x) => x.close);
      const jumps = closes
        .map((c, i) =>
          i && closes[i - 1]
            ? {
                date: bars[i].date,
                pct: Math.round((c / closes[i - 1] - 1) * 100 * 100) / 100,
              }
            : null,
        )
        .filter((j): j is { date: string; pct: number } => j !== null)
        .sort((x, y) => Math.abs(y.pct) - Math.abs(x.pct));
      out.push({
        ticker: t.ticker,
        type: t.type,
        pagesFetched: pageSizes.length,
        barsPerPage: pageSizes,
        barsTotal: bars.length,
        earliest: bars[0]?.date ?? null,
        latest: bars.length ? bars[bars.length - 1].date : null,
        latestClose: closes.length ? closes[closes.length - 1] : null,
        daysOver7_5pct: jumps.filter((j) => Math.abs(j.pct) > 7.5).length,
        biggestMoves: jumps.slice(0, 5),
        interpretation:
          t.type === "stock"
            ? "HOSE limit is +/-7%. Isolated moves well above 7% suggest UNADJUSTED history around splits or dividends. None across a long history suggests adjusted prices (or no corporate actions). Heuristic only."
            : undefined,
      });
    }
    return {
      ok: out.length > 0 && !stopped,
      notes: { stoppedEarly: stopped || null, samples: out },
    };
  });

  // 8: gentle rate-limit probe (20 light calls, 250 ms apart, stops on HTTP 429)
  await step("8. Rate-limit probe (20 light calls, stops on HTTP 429)", async () => {
    const statuses: Record<string, number> = {};
    const times: number[] = [];
    const limitHeaders: Record<string, string> = {};
    const ticker = sampleStocks[0] ?? hoseSymbols[0] ?? "";
    for (let i = 0; i < 20; i++) {
      const res = await get("/nyx/v2/stock/bars-long-term", {
        ticker,
        type: "stock",
        resolution: "D",
        to: now,
        countBack: 5,
      });
      statuses[res.status] = (statuses[res.status] ?? 0) + 1;
      times.push(res.ms);
      for (const [k, v] of Object.entries(res.headers))
        if (/rate|limit|retry|quota/i.test(k)) limitHeaders[k] = v;
      if (res.status === 429) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const sorted = [...times].sort((a, b) => a - b);
    return {
      ok: !statuses["429"],
      notes: {
        calls: times.length,
        statuses,
        p50Ms: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        rateLimitLikeHeaders: limitHeaders,
      },
    };
  });

  finish();
}

function finish(message?: string) {
  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    baseUrl: BASE_URL,
    message: message ?? null,
    steps: results,
    notCheckable: [
      "Terms of use and redistribution: not stated on the developer portal pages read on 2026-11-12. Ask TCBS in writing.",
      "Whether the Smart OTP is needed on EVERY exchange: the docs say the token is valid up to 8 hours from iOTP confirmation. Compare lifetimeHours above.",
    ],
  };

  let json = JSON.stringify(report, null, 2);
  // Long secrets (key, token) are searched anywhere. A short OTP is searched as a quoted string so a
  // number in the report (a price, a timing) cannot trigger a false alarm.
  const leaked = secrets.filter(
    (s) => s && (s.length >= 12 ? json.includes(s) : json.includes(`"${s}"`)),
  );
  if (leaked.length) {
    console.error("Report contains a secret value, so it was NOT saved. Nothing was written.");
    process.exit(2);
  }
  mkdirSync("spike-output", { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const file = `spike-output/tcbs-spike-${stamp}.json`;
  writeFileSync(file, (json += "\n"));
  if (message) console.log(`\n${message}`);
  const failed = results.filter((r) => !r.ok).map((r) => r.step);
  console.log(`\nReport saved to ${file}`);
  console.log(failed.length ? `Steps that failed: ${failed.join("; ")}` : "All steps succeeded.");
  console.log("Attach that file in chat. It contains no key, OTP or token.");
}

main().catch((err) => {
  console.error("Spike stopped:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
