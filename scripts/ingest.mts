// Daily end-of-day ingest, run by the OWNER after the HOSE close:  npm run ingest
//   npm run ingest -- --dry-run                 validate and print diagnostics, write nothing, no database needed
//   npm run ingest -- --dry-run --force-early   same, but allowed before 15:10 (never combined with a real write)
//   npm run ingest -- --date=2026-11-13         a specific session (TCBS's board only describes the latest one)
// Reads TCBS_API_KEY (and DATABASE_URL_UNPOOLED for a real run) from the environment or .env.local, asks for
// the Smart OTP with hidden input, and writes only after validation passes. Safe to run twice.
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { promptHidden, loadEnv } from "./prompt.mts";
import * as schema from "../src/lib/db/schema.ts";
import { API_KEY_INFO_PATH, TOKEN_PATH } from "../src/lib/market-data/tcbs/allowlist.ts";
import { tcbsRequest } from "../src/lib/market-data/tcbs/client.ts";
import { createTcbsProvider } from "../src/lib/market-data/tcbs/provider.ts";
import { compareCloses, diagnoseBoard } from "../src/lib/market-data/tcbs/diagnostics.ts";
import { ingestSession } from "../src/lib/market-data/ingest.ts";
import { createDbSessionStore } from "../src/lib/market-data/db-store.ts";
import type { Db } from "../src/lib/market-data/db-store.ts";
import { MemorySessionStore } from "../src/lib/market-data/memory-store.ts";
import { isAfterMarketClose, vietnamClock } from "../src/lib/market-data/schedule.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const dateArg = args.find((a) => a.startsWith("--date="))?.slice(7);
const dryRun = flag("dry-run");
const forceEarly = flag("force-early");

const secrets: string[] = [];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const say = (s = "") => console.log(s);

// Test hook for local rehearsals only: a localhost URL. Real runs always use TCBS's fixed address.
const override = process.env.TCBS_BASE_URL;
const baseUrl =
  override && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(override) ? override : undefined;

function fail(message: string, code = 1): never {
  console.error(`\n${message}`);
  process.exit(code);
}

async function main() {
  const now = new Date();
  const date = dateArg ?? vietnamClock(now).date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail("--date must look like 2026-11-13");
  if (forceEarly && !dryRun) fail("--force-early only works together with --dry-run.");
  if (!isAfterMarketClose(date, now) && !forceEarly) {
    fail(
      `The ${date} session is not over yet (HOSE closes at 15:00; this waits until 15:10 Vietnam time).\n` +
        "Run again after the close, or add --dry-run --force-early to only look at the data.",
      3,
    );
  }

  const apiKey = loadEnv("TCBS_API_KEY");
  if (!apiKey) fail("TCBS_API_KEY not found. Put it in .env.local or the environment.");
  secrets.push(apiKey);
  const dbUrl = loadEnv("DATABASE_URL_UNPOOLED") || loadEnv("DATABASE_URL");
  if (!dryRun && !dbUrl) {
    fail(
      "DATABASE_URL_UNPOOLED not found in .env.local. Copy it from the Neon console, or use --dry-run.",
    );
  }
  if (dbUrl) secrets.push(dbUrl);

  say(`Ingest for ${date}${dryRun ? " (DRY RUN: nothing is written)" : ""}.`);

  const info = await tcbsRequest({
    method: "POST",
    path: API_KEY_INFO_PATH,
    body: { apiKey },
    baseUrl,
  });
  const expire = (info.body as { expireDate?: string } | null)?.expireDate;
  if (info.status !== 200)
    fail(`API key check failed (HTTP ${info.status}). The key may be expired or revoked.`);
  const daysLeft = expire ? Math.round((Date.parse(expire) - Date.now()) / 86_400_000) : null;
  say(
    `API key valid${daysLeft !== null ? `, ${daysLeft} days left` : ""}.${daysLeft !== null && daysLeft < 30 ? " RENEW SOON." : ""}`,
  );

  const otp = await promptHidden("Smart OTP from TCInvest (input hidden): ");
  secrets.push(otp);
  const tokenRes = await tcbsRequest({
    method: "POST",
    path: TOKEN_PATH,
    body: { apiKey, otp },
    baseUrl,
  });
  const token =
    typeof (tokenRes.body as { token?: unknown } | null)?.token === "string"
      ? (tokenRes.body as { token: string }).token
      : "";
  if (!token)
    fail(
      `Token exchange failed (HTTP ${tokenRes.status}). Check the OTP and run again; the script does not retry.`,
    );
  secrets.push(token);

  const provider = createTcbsProvider({ token, baseUrl });

  // Diagnostics on the raw board, before anything is stored.
  const board = await provider.fetchBoard();
  const diag = diagnoseBoard(board.rows);
  say(
    `\nBoard: trading date ${board.date ?? "unknown"}, ${diag.rows} rows, ${diag.withVolume} traded, ${diag.noVolume} without trades.`,
  );
  say(
    `  rows without trades that still carry a matchPrice (ignored as close): ${diag.noVolumeWithMatchPrice}`,
  );
  say(
    `  closed at ceiling ${diag.closedAtCeiling}, at floor ${diag.closedAtFloor}, missing reference ${diag.missingReference}`,
  );
  say(
    `  TCBS changePercent vs ours: ${diag.changePercent.compared} compared, max difference ${diag.changePercent.maxAbsDiffPct}%, ${diag.changePercent.rowsDifferingOver0_01} differ by more than 0.01%`,
  );
  say(
    `  volume unit check: median value/(volume x price) = ${diag.volumeUnit.medianRatio} -> ${diag.volumeUnit.verdict}`,
  );

  let pool: pg.Pool | null = null;
  const memory = new MemorySessionStore();
  let store: Pick<MemorySessionStore, "commitSession" | "recordError"> = memory;
  let dbStore: ReturnType<typeof createDbSessionStore> | null = null;
  if (!dryRun) {
    pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
    dbStore = createDbSessionStore(drizzle(pool, { schema }) as unknown as Db);
    store = dbStore;
    await dbStore.upsertSecurities(await provider.listSecurities());
  }

  const result = await ingestSession(provider, store, date);
  say(
    `\nResult: ${JSON.stringify(result)}${dryRun ? "  (dry run: validated only, nothing was written)" : ""}`,
  );

  const report: Record<string, unknown> = {
    generatedAt: now.toISOString(),
    date,
    dryRun,
    result,
    board: { date: board.date, ...diag },
  };

  if (result.status === "committed") {
    // Cross-check: closes taken from the board vs the daily-bars endpoint, for up to 10 traded tickers.
    const bars = (await provider.getDailyBars(date)).filter((b) => b.close !== null);
    const step = Math.max(1, Math.floor(bars.length / 10));
    const sample = bars.filter((_, i) => i % step === 0).slice(0, 10);
    const pairs: { ticker: string; board: number | null; bars: number | null }[] = [];
    for (const b of sample) {
      const got = await provider.fetchBars(b.ticker, "stock", date, 1);
      const last = got[got.length - 1];
      pairs.push({
        ticker: b.ticker,
        board: b.close,
        bars: last?.date === date ? last.close : null,
      });
      await sleep(300);
    }
    const cmp = compareCloses(pairs);
    say(
      `Close cross-check (board vs daily bars): ${cmp.compared} compared, ${cmp.mismatches} differ.`,
    );
    report.closeCrossCheck = cmp;
    if (pool) {
      const { rows } = await pool.query(
        "select count(*)::int as n from daily_prices where session_date = $1",
        [date],
      );
      say(`Database now holds ${rows[0].n} price rows for ${date}.`);
      report.rowsInDatabase = rows[0].n;
    }
  } else if (result.status === "not-ready") {
    say(
      "Not ready: before the open, a market holiday, or the board has no trades yet. Nothing was written.",
    );
  } else {
    say(
      `Failed: ${result.reason}. Nothing was written${dryRun ? "" : "; the error is recorded in ingestion_errors"}.`,
    );
  }
  await pool?.end();

  const json = JSON.stringify(report, null, 2);
  if (secrets.some((s) => s && (s.length >= 12 ? json.includes(s) : json.includes(`"${s}"`)))) {
    fail("The report contained a secret value, so it was not saved.", 2);
  }
  mkdirSync("spike-output", { recursive: true });
  const file = `spike-output/ingest-${date}${dryRun ? "-dry" : ""}.json`;
  writeFileSync(file, `${json}\n`);
  say(`\nReport saved to ${file} (no key, OTP, token or database URL inside).`);
  process.exit(result.status === "committed" ? 0 : result.status === "not-ready" ? 3 : 1);
}

main().catch((err) => {
  console.error("Stopped:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
