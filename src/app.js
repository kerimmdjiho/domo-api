import { readFileSync } from "node:fs";
import os from "node:os";
import express from "express";
import cors from "cors";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));

const TASKS_CACHE_KEY = "tasks:all";
const VISITS_KEY = "stats:visits";

// db and cache are injected so tests can supply stubs with no real Postgres/Redis.
export function createApp({ db, cache, corsOrigin = "*", cacheTtlSeconds = 30 }) {
  const app = express();
  const startedAt = Date.now();

  app.use(cors({ origin: corsOrigin }));
  app.use(express.json());

  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    });
    next();
  });

  app.get("/healthz", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/readyz", async (req, res) => {
    const result = { postgres: "down", redis: "down" };
    let ok = true;

    try {
      await db.query("SELECT 1");
      result.postgres = "up";
    } catch {
      ok = false;
    }

    try {
      await cache.ping();
      result.redis = "up";
    } catch {
      ok = false;
    }

    res.status(ok ? 200 : 503).json(result);
  });

  app.get("/api/tasks", async (req, res, next) => {
    try {
      const cached = await cache.get(TASKS_CACHE_KEY);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(JSON.parse(cached));
      }

      const { rows } = await db.query("SELECT id, title, done, created_at FROM tasks ORDER BY id");
      await cache.set(TASKS_CACHE_KEY, JSON.stringify(rows), { EX: cacheTtlSeconds });
      res.set("X-Cache", "MISS");
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/tasks", async (req, res, next) => {
    try {
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      if (!title) return res.status(400).json({ error: "title is required" });

      const { rows } = await db.query(
        "INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, done, created_at",
        [title]
      );
      await cache.del(TASKS_CACHE_KEY);
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/tasks/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(404).json({ error: "task not found" });

      if (typeof req.body?.done !== "boolean") {
        return res.status(400).json({ error: "done must be a boolean" });
      }
      const done = req.body.done;
      const { rows } = await db.query(
        "UPDATE tasks SET done = $1 WHERE id = $2 RETURNING id, title, done, created_at",
        [done, id]
      );
      if (rows.length === 0) return res.status(404).json({ error: "task not found" });

      await cache.del(TASKS_CACHE_KEY);
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/tasks/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) return res.status(404).json({ error: "task not found" });

      const { rowCount } = await db.query("DELETE FROM tasks WHERE id = $1", [id]);
      if (rowCount === 0) return res.status(404).json({ error: "task not found" });

      await cache.del(TASKS_CACHE_KEY);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/stats", async (req, res, next) => {
    try {
      const visits = await cache.incr(VISITS_KEY);
      const { rows } = await db.query("SELECT COUNT(*)::int AS count FROM tasks");
      res.json({
        visits,
        taskCount: rows[0].count,
        hostname: os.hostname(),
        version: pkg.version,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      });
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => {
    res.status(404).json({ error: "not found" });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "internal server error" });
  });

  return app;
}
