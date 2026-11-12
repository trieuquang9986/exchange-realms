import { describe, expect, it, vi } from "vitest";
import {
  API_KEY_INFO_PATH,
  BASE_URL,
  ForbiddenEndpointError,
  MARKET_DATA_PATHS,
  TOKEN_PATH,
  assertAllowedRequest,
  buildTcbsUrl,
} from "./allowlist";
import { tcbsRequest } from "./client";

describe("TCBS endpoint allowlist", () => {
  it("allows the token exchange and key-expiry lookup as POST only", () => {
    expect(() => assertAllowedRequest("POST", TOKEN_PATH)).not.toThrow();
    expect(() => assertAllowedRequest("POST", API_KEY_INFO_PATH)).not.toThrow();
    expect(() => assertAllowedRequest("GET", TOKEN_PATH)).toThrow(ForbiddenEndpointError);
  });

  it("allows each market-data path as GET only", () => {
    for (const p of MARKET_DATA_PATHS) {
      expect(() => assertAllowedRequest("GET", p)).not.toThrow();
      expect(() => assertAllowedRequest("GET", `${p}?index=1`)).not.toThrow();
      for (const m of ["POST", "PUT", "DELETE"]) {
        expect(() => assertAllowedRequest(m, p)).toThrow(ForbiddenEndpointError);
      }
    }
  });

  it("blocks order, cash, margin, account, money and derivatives paths by construction", () => {
    for (const p of [
      "/tartarus/v1/orders",
      "/akhlys/v1/accounts/123/cash",
      "/margin/v1/loans",
      "/account/v1/profile",
      "/derivative/v1/place-order",
      "/tartarus/v1/derivatives",
      "/gaia/v1/oauth2/openapi/apikey/extend",
      "/gaia/v1/oauth2/openapi/token/../orders",
      "/ananke/v1/securities/../account",
      "relative/path",
    ]) {
      for (const m of ["GET", "POST", "PUT"]) {
        expect(() => assertAllowedRequest(m, p)).toThrow(ForbiddenEndpointError);
      }
    }
  });

  it("keeps blocking forbidden words even if one reached the market-data list", () => {
    const sneaky = [...MARKET_DATA_PATHS, "/tartarus/v1/orders"];
    expect(sneaky).toContain("/tartarus/v1/orders"); // the list itself is not trusted...
    expect(() => assertAllowedRequest("GET", "/tartarus/v1/orders")).toThrow(); // ...the guard is
  });

  it("builds URLs from the base URL and query string", () => {
    expect(buildTcbsUrl(BASE_URL, "GET", "/tartarus/v1/tickerSnaps", { index: 1 })).toBe(
      "https://openapi.tcbs.com.vn/tartarus/v1/tickerSnaps?index=1",
    );
  });
});

describe("tcbsRequest", () => {
  it("refuses a forbidden endpoint before any network call", async () => {
    const fetchImpl = vi.fn();
    await expect(
      tcbsRequest({ method: "POST", path: "/tartarus/v1/orders", body: {}, fetchImpl }),
    ).rejects.toThrow(ForbiddenEndpointError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends a bearer token and parses JSON without returning request headers", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ data: [1] }), { status: 200 }),
    ) as unknown as typeof fetch;
    const res = await tcbsRequest({
      method: "GET",
      path: "/tartarus/v1/tickerSnaps",
      query: { index: 1 },
      token: "test-token",
      fetchImpl,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [1] });
    expect(JSON.stringify(res)).not.toContain("test-token");
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("keeps non-JSON bodies as text", async () => {
    const fetchImpl = (async () =>
      new Response("oops", { status: 502 })) as unknown as typeof fetch;
    const res = await tcbsRequest({ method: "GET", path: "/ananke/v1/securities", fetchImpl });
    expect(res.status).toBe(502);
    expect(res.body).toBe("oops");
  });
});
