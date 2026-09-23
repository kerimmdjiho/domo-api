// Reads and validates env vars at import time. Exits the process if required
// vars are missing so failures show up immediately on startup, not mid-request.

function required(name) {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? null : value;
}

const missing = [];

const DATABASE_URL = required("DATABASE_URL");
if (!DATABASE_URL) missing.push("DATABASE_URL");

const REDIS_URL = required("REDIS_URL");
if (!REDIS_URL) missing.push("REDIS_URL");

if (missing.length > 0) {
  console.error(`Missing required env var(s): ${missing.join(", ")}`);
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  databaseUrl: DATABASE_URL,
  redisUrl: REDIS_URL,
  corsOrigin: process.env.CORS_ORIGIN || "*",
  cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS) || 30,
};
