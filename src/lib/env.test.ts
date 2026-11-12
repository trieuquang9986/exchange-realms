import { describe, expect, it } from "vitest";
import { readServerEnv } from "./env";

describe("readServerEnv", () => {
  it("throws a clear error when DATABASE_URL is missing", () => {
    expect(() => readServerEnv({})).toThrow(/DATABASE_URL is not set/);
  });

  it("returns values when present and leaves optional ones undefined", () => {
    const env = readServerEnv({ DATABASE_URL: "postgresql://example" });
    expect(env.DATABASE_URL).toBe("postgresql://example");
    expect(env.CRON_SECRET).toBeUndefined();
  });
});
