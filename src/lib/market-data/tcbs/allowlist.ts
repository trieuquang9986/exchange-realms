// TCBS OpenAPI endpoint guard. The API key belongs to the owner's brokerage account and the same API
// exposes order, cash, margin and account endpoints. Only the requests below may ever be sent.
// Imports in this folder use explicit .ts extensions so the spike script can run under plain Node.

/** From developers.tcbs.com.vn, "URL gốc". */
export const BASE_URL = "https://openapi.tcbs.com.vn";

/** POST. Exchanges the API key plus a Smart OTP for a JWT (valid up to 8 hours per the docs). */
export const TOKEN_PATH = "/gaia/v1/oauth2/openapi/token";

/** POST. Read-only: returns only the API key's expiry date. The key-extend endpoint is NOT allowed. */
export const API_KEY_INFO_PATH = "/gaia/v1/oauth2/openapi/apikey/info";

/**
 * GET only. End-of-day market data. Paths come from TCBS's OpenAPI spec v1.0.0 (read 2026-11-12).
 * Intraday bars, put-through deals and WebSocket streams are out of the MVP and not listed.
 */
export const MARKET_DATA_PATHS: readonly string[] = [
  "/tartarus/v1/tickerCommons",
  "/tartarus/v1/tickerSnaps",
  "/ananke/v1/securities",
  "/nyx/v2/stock/bars-long-term",
];

/** Defence in depth: refused even if one of these ever slips into the lists above. */
const FORBIDDEN =
  /order|cash|margin|account|derivative|transfer|withdraw|deposit|payment|portfolio|extend/i;

export type HttpMethod = "GET" | "POST";

export class ForbiddenEndpointError extends Error {
  constructor(method: string, path: string) {
    super(`Blocked TCBS request (not on the allowlist): ${method} ${path}`);
    this.name = "ForbiddenEndpointError";
  }
}

export function assertAllowedRequest(method: string, path: string): void {
  const clean = path.split("?")[0].replace(/\/+$/, "");
  if (clean.includes("..") || !clean.startsWith("/") || FORBIDDEN.test(clean)) {
    throw new ForbiddenEndpointError(method, path);
  }
  const m = method.toUpperCase();
  if (m === "POST" && (clean === TOKEN_PATH || clean === API_KEY_INFO_PATH)) return;
  if (m === "GET" && MARKET_DATA_PATHS.includes(clean)) return;
  throw new ForbiddenEndpointError(method, path);
}

export function buildTcbsUrl(
  baseUrl: string,
  method: string,
  path: string,
  query?: Record<string, string | number>,
): string {
  assertAllowedRequest(method, path);
  const url = new URL(path, baseUrl);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
  return url.toString();
}
