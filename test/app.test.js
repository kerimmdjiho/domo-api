import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";

function stubDb(overrides = {}) {
  return {
    query: async () => ({ rows: [], rowCount: 0 }),
    ...overrides,
  };
}

function stubCache(overrides = {}) {
  return {
    get: async () => null,
    set: async () => {},
    del: async () => {},
    incr: async () => 1,
    ping: async () => "PONG",
    ...overrides,
  };
}

test("GET /healthz returns 200 without touching db or cache", async () => {
  const app = createApp({ db: stubDb(), cache: stubCache() });
  const res = await request(app).get("/healthz");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { status: "ok" });
});

test("POST /api/tasks with blank title returns 400", async () => {
  const app = createApp({ db: stubDb(), cache: stubCache() });
  const res = await request(app).post("/api/tasks").send({ title: "   " });
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test("POST /api/tasks with missing title returns 400", async () => {
  const app = createApp({ db: stubDb(), cache: stubCache() });
  const res = await request(app).post("/api/tasks").send({});
  assert.equal(res.status, 400);
  assert.ok(res.body.error);
});

test("GET /api/tasks serves from cache on hit with X-Cache: HIT", async () => {
  const cached = [{ id: 1, title: "cached task", done: false }];
  const app = createApp({
    db: stubDb(),
    cache: stubCache({ get: async () => JSON.stringify(cached) }),
  });
  const res = await request(app).get("/api/tasks");
  assert.equal(res.status, 200);
  assert.equal(res.headers["x-cache"], "HIT");
  assert.deepEqual(res.body, cached);
});

test("PATCH /api/tasks/:id with non-boolean done returns 400", async () => {
  const app = createApp({ db: stubDb(), cache: stubCache() });
  const res = await request(app).patch("/api/tasks/1").send({ done: "yes" });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: "done must be a boolean" });
});

test("GET /readyz returns 503 when a dependency is down", async () => {
  const app = createApp({
    db: stubDb({ query: async () => { throw new Error("down"); } }),
    cache: stubCache(),
  });
  const res = await request(app).get("/readyz");
  assert.equal(res.status, 503);
  assert.equal(res.body.postgres, "down");
  assert.equal(res.body.redis, "up");
});
