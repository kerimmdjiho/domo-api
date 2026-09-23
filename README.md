# domo-api

Tiny task board API. A practice backend for learning Docker build + docker
compose — the app is deliberately finished; the container config is not (see
below). The web frontend lives in the sibling repo `domo-web`.

## Env vars

| Var                 | Required | Default | Notes                              |
|----------------------|----------|---------|-------------------------------------|
| `PORT`               | no       | `3000`  | HTTP port                          |
| `DATABASE_URL`       | yes      | —       | e.g. `postgres://domo:domo@localhost:5432/domo` |
| `REDIS_URL`          | yes      | —       | e.g. `redis://localhost:6379`      |
| `CORS_ORIGIN`        | no       | `*`     | CORS allowed origin                |
| `CACHE_TTL_SECONDS`  | no       | `30`    | TTL for the `tasks:all` cache key  |

Copy `.env.example` to `.env` and fill it in, or export the vars yourself.
`npm start` / `npm run dev` load `.env` automatically via Node's
`--env-file-if-exists` flag (no `dotenv` dependency).

## Endpoints

| Method | Path              | Description                                                  |
|--------|-------------------|----------------------------------------------------------------|
| GET    | `/healthz`        | Liveness. Always `200 {status:"ok"}`                          |
| GET    | `/readyz`         | Readiness. Checks Postgres (`SELECT 1`) and Redis (`PING`). `200` or `503` |
| GET    | `/api/tasks`      | List tasks. Cached in Redis (`X-Cache: HIT\|MISS`)             |
| POST   | `/api/tasks`      | Create a task. Body `{title}`. `400` if blank                 |
| PATCH  | `/api/tasks/:id`  | Update `done`. Body `{done}`. `404` if missing                |
| DELETE | `/api/tasks/:id`  | Delete a task. `204` / `404`                                   |
| GET    | `/api/stats`      | `{visits, taskCount, hostname, version, uptimeSeconds}`        |

## Commands

```
npm ci
npm run migrate   # applies migrations/*.sql, idempotent
npm run seed       # inserts sample tasks if the table is empty
npm start
npm test
```

`npm run dev` runs the server with `node --watch`.

## Your DevOps exercises

The app is done. These are not — write them yourself:

- A multi-stage `Dockerfile`: build stage installs deps, final stage runs
  on a small base image, uses `npm ci --omit=dev`, and runs as a non-root
  user.
- A `.dockerignore` (at least `node_modules`, `.env`, `.git`).
- A `compose.yaml` with services: `postgres`, `redis`, `api`, and a
  one-off `migrate` service.
- Healthchecks: `api` via `GET /readyz`, `postgres` via `pg_isready`,
  `redis` via `redis-cli ping`.
- `depends_on` with `condition: service_healthy` for `postgres`/`redis`,
  and `condition: service_completed_successfully` for `migrate`.
- A named volume for Postgres data so it survives container recreation.
- `env_file` to pass config into `api` instead of hardcoding it in the
  compose file.
- Scale `api` to 3 replicas (`docker compose up --scale api=3`) and hit
  `/api/stats` repeatedly to see `hostname` change between replicas.
- Run `docker compose stop` and confirm the API logs its graceful
  shutdown message instead of being killed abruptly.
