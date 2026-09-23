import { config } from "./config.js";
import { pool } from "./db.js";
import { redis, useRuntimeReconnectStrategy } from "./cache.js";
import { createApp } from "./app.js";

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;
const SHUTDOWN_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(name, connectFn) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await connectFn();
      console.log(`${name}: connected`);
      return;
    } catch (err) {
      console.log(`${name}: connection attempt ${attempt}/${MAX_ATTEMPTS} failed (${err.message})`);
      if (attempt === MAX_ATTEMPTS) {
        console.error(`${name}: giving up after ${MAX_ATTEMPTS} attempts`);
        process.exit(1);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function main() {
  await connectWithRetry("postgres", () => pool.query("SELECT 1"));
  await connectWithRetry("redis", () => redis.connect());
  useRuntimeReconnectStrategy();

  const app = createApp({
    db: pool,
    cache: redis,
    corsOrigin: config.corsOrigin,
    cacheTtlSeconds: config.cacheTtlSeconds,
  });

  const server = app.listen(config.port, "0.0.0.0", () => {
    console.log(`domo-api listening on 0.0.0.0:${config.port}`);
  });

  async function closeRedis() {
    if (!redis.isOpen) return;
    try {
      if (redis.isReady) {
        await redis.quit();
      } else {
        redis.disconnect();
      }
    } catch (err) {
      console.error(`error closing redis: ${err.code || err.message || String(err)}`);
    }
  }

  let shuttingDown = false;
  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down gracefully`);

    const forceExitTimer = setTimeout(() => {
      console.error("shutdown timed out, forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close(async () => {
      try {
        await pool.end();
        await closeRedis();
        console.log("shutdown complete");
        clearTimeout(forceExitTimer);
        process.exit(0);
      } catch (err) {
        console.error(`error during shutdown: ${err.message}`);
        process.exit(1);
      }
    });
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(`fatal startup error: ${err.message}`);
  process.exit(1);
});
