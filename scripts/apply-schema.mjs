import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required to apply the schema.");
  process.exit(1);
}

const schemaPath = join(process.cwd(), "db", "schema.sql");
const schema = await readFile(schemaPath, "utf8");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(schema);
  console.log("CloudOps database schema applied.");
} finally {
  await client.end();
}
