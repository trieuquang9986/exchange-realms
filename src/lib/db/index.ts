import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { readServerEnv } from "@/lib/env";
import * as schema from "./schema";

export function getDb() {
  const { DATABASE_URL } = readServerEnv();
  return drizzle(neon(DATABASE_URL), { schema });
}
