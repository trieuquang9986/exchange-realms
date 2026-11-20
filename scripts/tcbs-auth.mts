// Shared by the owner-run scripts: checks the API key, asks for the Smart OTP (hidden) and returns a token.
// Every secret it handles is added to `secrets` so the caller can scan reports before saving them.
import { API_KEY_INFO_PATH, TOKEN_PATH } from "../src/lib/market-data/tcbs/allowlist.ts";
import { tcbsRequest } from "../src/lib/market-data/tcbs/client.ts";
import { loadEnv, promptHidden } from "./prompt.mts";

export async function authenticate(
  secrets: string[],
  baseUrl: string | undefined,
): Promise<{ token: string; apiKey: string }> {
  const apiKey = loadEnv("TCBS_API_KEY");
  if (!apiKey) throw new Error("TCBS_API_KEY not found. Put it in .env.local or the environment.");
  secrets.push(apiKey);
  const info = await tcbsRequest({
    method: "POST",
    path: API_KEY_INFO_PATH,
    body: { apiKey },
    baseUrl,
  });
  if (info.status !== 200) {
    throw new Error(
      `API key check failed (HTTP ${info.status}). The key may be expired or revoked.`,
    );
  }
  const otp = await promptHidden("Smart OTP from TCInvest (input hidden): ");
  secrets.push(otp);
  const res = await tcbsRequest({
    method: "POST",
    path: TOKEN_PATH,
    body: { apiKey, otp },
    baseUrl,
  });
  const token =
    typeof (res.body as { token?: unknown } | null)?.token === "string"
      ? (res.body as { token: string }).token
      : "";
  if (!token)
    throw new Error(`Token exchange failed (HTTP ${res.status}). Check the OTP; no retry.`);
  secrets.push(token);
  return { token, apiKey };
}
