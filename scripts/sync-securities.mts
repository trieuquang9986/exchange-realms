// Securities sync, run by the OWNER:  npm run sync-securities
//   npm run sync-securities -- --dry-run      fetch and print, write nothing, no database needed (first 5 tickers)
//   npm run sync-securities -- --all          re-sync every ticker (default: only tickers not synced in 7 days)
// Reads the HOSE ticker list from the live board, then makes ONE paced call per ticker (TCBS's bulk query fails)
// and stores listed shares, security type and listing date in Neon. Resumable: run it again after an interruption.
// Needs TCBS_API_KEY and DATABASE_URL_UNPOOLED (.env.local), and the Smart OTP typed by you.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { loadEnv } from "./prompt.mts";
import { authenticate } from "./tcbs-auth.mts";
import * as schema from "../src/lib/db/schema.ts";
import { createTcbsProvider } from "../src/lib/market-data/tcbs/provider.ts";
import { createDbSessionStore } from "../src/lib/market-data/db-store.ts";
import type { Db } from "../src/lib/market-data/db-store.ts";
import { syncSecurities } from "../src/lib/market-data/securities-sync.ts";
import type { SecurityDetail } from "../src/lib/market-data/types.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const all = args.includes("--all");
const override = process.env.TCBS_BASE_URL;
const baseUrl =
  override && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(override) ? override : undefined;
const secrets: string[] = [];

async function main() {
  const dbUrl = loadEnv("DATABASE_URL_UNPOOLED") || loadEnv("DATABASE_URL");
  if (!dryRun && !dbUrl)
    throw new Error("DATABASE_URL_UNPOOLED not found in .env.local, or use --dry-run.");
  if (dbUrl) secrets.push(dbUrl);

  const { token } = await authenticate(secrets, baseUrl);
  const provider = createTcbsProvider({ token, baseUrl });

  const board = await provider.fetchBoard();
  let tickers = board.rows.map((r) => String(r.symbol)).sort();
  console.log(`Board lists ${tickers.length} tickers.`);

  let pool: pg.Pool | null = null;
  let dbStore: ReturnType<typeof createDbSessionStore> | null = null;
  const printed: SecurityDetail[] = [];
  if (!dryRun) {
    pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
    dbStore = createDbSessionStore(drizzle(pool, { schema }) as unknown as Db);
    await dbStore.upsertSecurities(await provider.listSecurities());
    if (!all) {
      const todo = new Set(await dbStore.tickersNeedingSync(new Date(Date.now() - 7 * 86_400_000)));
      tickers = tickers.filter((t) => todo.has(t));
    }
    console.log(`${tickers.length} ticker(s) to sync.`);
  } else {
    tickers = tickers.slice(0, 5);
  }

  const result = await syncSecurities(
    tickers,
    async (t) => {
      const d = await provider.getSecurity(t);
      if (dryRun && d) printed.push(d);
      return d;
    },
    dbStore ?? { upsertSecurityDetails: async () => {} },
    {
      delayMs: 400,
      retryDelayMs: 5000,
      maxConsecutiveFailures: 5,
      onProgress: (done, total, t) => {
        if (done % 25 === 0 || done === total) console.log(`  ${done}/${total} (${t})`);
      },
    },
  );

  if (dryRun) for (const d of printed) console.log(JSON.stringify(d));
  console.log(
    `\nStored ${result.stored}, not found ${result.notFound.length}, failed ${result.failed.length}${result.aborted ? " (ABORTED after repeated failures; run again to resume)" : ""}.`,
  );
  if (result.notFound.length) console.log(`Not found: ${result.notFound.join(", ")}`);
  for (const f of result.failed.slice(0, 10)) console.log(`Failed ${f.ticker}: ${f.reason}`);
  await pool?.end();
  process.exit(result.aborted ? 1 : 0);
}

main().catch((err) => {
  console.error("Stopped:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
