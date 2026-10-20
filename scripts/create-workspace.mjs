import pg from "pg";

const [id, name, plan = "starter"] = process.argv.slice(2);
if (!id || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id) || !name?.trim() ||
    !["demo", "starter", "team", "enterprise"].includes(plan) || !process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL and run: npm run workspace:create -- workspace-id 'Workspace name' [starter|team|enterprise|demo]");
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});
try {
  await client.connect();
  const result = await client.query(
    "insert into workspaces (id, name, plan) values ($1, $2, $3) on conflict (id) do nothing returning id",
    [id, name.trim(), plan],
  );
  console.log(result.rowCount ? "Workspace created. Assign authorized users in Clerk." : "Workspace already exists; its details were left unchanged.");
} finally {
  await client.end();
}
