import os from "node:os";
import pg from "pg";
import { parse } from "pg-connection-string";
import { config } from "./config.js";

// Socket URLs like postgresql:///db?host=/var/run/postgresql carry no user name; default to the OS user (peer auth).
const parsed = parse(config.databaseUrl);
const connection: pg.PoolConfig = parsed.user
  ? { connectionString: config.databaseUrl }
  : {
      host: parsed.host ?? undefined,
      port: parsed.port ? Number(parsed.port) : undefined,
      database: parsed.database ?? undefined,
      user: process.env.PGUSER || os.userInfo().username,
    };

export const pool = new pg.Pool({
  ...connection,
  max: 10,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
});

export async function query<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const r = await pool.query<T>(text, params);
  return r.rows[0];
}
