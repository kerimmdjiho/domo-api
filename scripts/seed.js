import { pool } from "../src/db.js";

const SAMPLE_TASKS = ["Write a Dockerfile", "Set up docker compose", "Scale the api service"];

async function main() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM tasks");
  if (rows[0].count > 0) {
    console.log("tasks table already has data, skipping seed");
    return;
  }

  for (const title of SAMPLE_TASKS) {
    await pool.query("INSERT INTO tasks (title) VALUES ($1)", [title]);
  }
  console.log(`seeded ${SAMPLE_TASKS.length} tasks`);
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error(`seed failed: ${err.message}`);
  exitCode = 1;
}
await pool.end();
process.exit(exitCode);
