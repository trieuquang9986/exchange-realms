// TCBS OpenAPI endpoint guard. The API key belongs to the owner's brokerage account and the same API
// exposes order, cash, margin and account endpoints. Only market-data paths may ever be called.

/** Token exchange path, from TCBS's OpenAPI spec v1.0.0. */
export const TOKEN_PATH = "/gaia/v1/oauth2/openapi/token";

/**
 * Market-data paths. Intentionally empty until the Phase 1 spike confirms the real paths against
 * the owner's key. Do not guess or copy paths from third-party libraries.
 */
export const MARKET_DATA_PATHS: readonly string[] = [];

/** Defence in depth: refused even if one of these ever slips into MARKET_DATA_PATHS. */
const FORBIDDEN =
  /order|cash|margin|account|derivative|transfer|withdraw|deposit|payment|portfolio/i;

export class ForbiddenEndpointError extends Error {
  constructor(path: string) {
    super(`Blocked TCBS endpoint (not on the market-data allowlist): ${path}`);
    this.name = "ForbiddenEndpointError";
  }
}

export function assertAllowedPath(path: string): void {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  if (clean.includes("..") || !clean.startsWith("/")) throw new ForbiddenEndpointError(path);
  if (clean === TOKEN_PATH) return;
  if (FORBIDDEN.test(clean)) throw new ForbiddenEndpointError(path);
  const allowed = MARKET_DATA_PATHS.some((p) => clean === p || clean.startsWith(`${p}/`));
  if (!allowed) throw new ForbiddenEndpointError(path);
}

export function buildTcbsUrl(baseUrl: string, path: string): string {
  assertAllowedPath(path);
  return new URL(path, baseUrl).toString();
}
