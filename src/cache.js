import { createClient } from "redis";
import { config } from "./config.js";

// During startup, reconnectStrategy must fail fast so connectWithRetry (server.js)
// controls the attempt/backoff loop instead of node-redis retrying internally
// forever. useRuntimeReconnectStrategy() switches to normal backoff once the
// initial connection succeeds, so later disconnects auto-reconnect.
const socketOptions = {
  reconnectStrategy: (_retries, cause) => new Error(cause?.code || cause?.message || String(cause)),
};

export const redis = createClient({
  url: config.redisUrl,
  socket: socketOptions,
  disableOfflineQueue: true,
});

export function useRuntimeReconnectStrategy() {
  socketOptions.reconnectStrategy = (retries) => Math.min(retries * 200, 2000);
}

// node-redis retries emit "error" on every failed attempt; dedupe so a long
// outage doesn't spam the same reason repeatedly.
let lastLoggedReason = null;
redis.on("error", (err) => {
  const reason = err.code || err.message || String(err);
  if (reason === lastLoggedReason) return;
  lastLoggedReason = reason;
  console.error(`redis client error: ${reason}`);
});
redis.on("ready", () => {
  lastLoggedReason = null;
});
