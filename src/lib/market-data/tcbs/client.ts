import { BASE_URL, buildTcbsUrl } from "./allowlist.ts";
import type { HttpMethod } from "./allowlist.ts";

export interface TcbsResponse {
  status: number;
  ms: number;
  headers: Record<string, string>;
  /** Parsed JSON, or the raw text if the body was not JSON. */
  body: unknown;
}

export interface TcbsRequest {
  method: HttpMethod;
  path: string;
  query?: Record<string, string | number>;
  body?: unknown;
  /** Bearer token. Never logged. */
  token?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * The only way the app talks to TCBS. The allowlist check runs before any network call, and this
 * function never logs or returns the request headers or body, so secrets cannot leak through it.
 */
export async function tcbsRequest(req: TcbsRequest): Promise<TcbsResponse> {
  const url = buildTcbsUrl(req.baseUrl ?? BASE_URL, req.method, req.path, req.query);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.token) headers.Authorization = `Bearer ${req.token}`;

  const started = Date.now();
  const res = await (req.fetchImpl ?? fetch)(url, {
    method: req.method,
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  });
  const text = await res.text();
  const ms = Date.now() - started;

  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // keep raw text
  }
  const outHeaders: Record<string, string> = {};
  res.headers.forEach((value, key) => {
    outHeaders[key.toLowerCase()] = value;
  });
  return { status: res.status, ms, headers: outHeaders, body };
}
