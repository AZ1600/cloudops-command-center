import { Pool } from "pg";

declare global {
  var cloudopsPool: Pool | undefined;
}

export function isPostgresEnabled() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  if (!globalThis.cloudopsPool) {
    globalThis.cloudopsPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    });
  }

  return globalThis.cloudopsPool;
}
