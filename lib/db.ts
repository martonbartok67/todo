import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/drizzle/schema";

type DrizzleDB = ReturnType<typeof drizzle>;
let _db: DrizzleDB | null = null;

/**
 * Lazily create the Drizzle client. Throws a clear, readable error if env
 * vars are missing, instead of failing with an opaque "Invalid URL" deep
 * inside the libSQL client when `createClient` is called.
 */
export function getDb(): DrizzleDB {
  if (_db) return _db;

  const url       = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  const missing = [
    !url       && "TURSO_DATABASE_URL",
    !authToken && "TURSO_AUTH_TOKEN",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    throw new Error(
      `Database unavailable: missing env var(s): ${missing.join(", ")}. ` +
      `Add them in Vercel → Settings → Environment Variables, then redeploy.`
    );
  }

  _db = drizzle(createClient({ url: url!, authToken: authToken! }), { schema });
  return _db;
}

/**
 * Lazy proxy over the Drizzle client. Defers connection until first use
 * and binds each method so Drizzle's internal `this`-chaining works.
 */
export const db = new Proxy({} as DrizzleDB, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const val  = real[prop];
    return typeof val === "function" ? (val as Function).bind(real) : val;
  },
}) as DrizzleDB;
