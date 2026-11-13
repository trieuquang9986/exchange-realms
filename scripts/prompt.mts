// Shared terminal helpers for the owner-run scripts.
import { existsSync, readFileSync } from "node:fs";

/** Reads a line from the terminal without echoing it (for the Smart OTP). */
export function promptHidden(question: string): Promise<string> {
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

/** Reads NAME from the environment, else from .env.local in the current folder. Empty string if absent. */
export function loadEnv(name: string): string {
  const fromEnv = process.env[name];
  if (fromEnv) return fromEnv.trim();
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`));
      if (m) return m[1].replace(/^["']|["']$/g, "").trim();
    }
  }
  return "";
}
