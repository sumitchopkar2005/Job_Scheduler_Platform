# Distributed Job Scheduler

A production-inspired distributed job scheduling platform built with a JavaScript monorepo: React/Vite frontend, Express REST API, PostgreSQL/Prisma durable state, Redis coordination, and independent workers.

## Features implemented

- JWT authentication with bcrypt password hashing and protected routes
- Organization membership and project management APIs
- Queue priority, concurrency, pause/resume, retry policy, and statistics
- Immediate, delayed, scheduled, recurring metadata, and batch-ready job model
- PostgreSQL-backed atomic worker claiming with `FOR UPDATE SKIP LOCKED`
- Independent worker registration, heartbeats, concurrent polling, execution history, and graceful shutdown
- Fixed, linear, and exponential retry backoff with DLQ promotion and replay
- Worker, DLQ, logs, executions, metrics, and OpenAPI endpoints
- React operations console with login/register, protected routes, polling dashboard, jobs, and queues views

The worker uses PostgreSQL as the durable source of truth, Redis pub/sub for low-latency wake-ups, and polling as a recovery path. PostgreSQL-backed integration tests are opt-in because they require local Docker services.

## Prerequisites

- Node.js 20+
- Docker Desktop

## Environment variables

Each runtime owns its own environment file. All `.env` files are ignored by Git and excluded from Docker images. Copy the relevant templates when setting up another machine:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item worker/.env.example worker/.env
Copy-Item frontend/.env.example frontend/.env
```

| Variable                       | Used by               | Purpose                                                                     |
| ------------------------------ | --------------------- | --------------------------------------------------------------------------- |
| `NODE_ENV`                     | Backend/worker        | `development`, `test`, or `production`                                      |
| `PORT`                         | Backend               | API port; default `4000`                                                    |
| `DATABASE_URL`                 | Backend/worker/Prisma | PostgreSQL connection string, configured separately in backend and worker   |
| `POSTGRES_USER`                | Docker Compose        | PostgreSQL username; Compose defaults to `scheduler`                        |
| `POSTGRES_PASSWORD`            | Docker Compose        | PostgreSQL password; Compose defaults to `scheduler`                        |
| `POSTGRES_DB`                  | Docker Compose        | PostgreSQL database name; Compose defaults to `scheduler`                   |
| `REDIS_URL`                    | Backend/worker        | Redis URL when running locally on the host                                  |
| `JWT_SECRET`                   | Backend               | Secret used to sign JWTs; use a long random value outside local development |
| `JWT_EXPIRES_IN`               | Backend               | JWT lifetime such as `1d` or `2h`                                           |
| `CORS_ORIGIN`                  | Backend               | Allowed frontend origin                                                     |
| `VITE_API_URL`                 | Frontend              | Browser-visible API base URL; must use the `VITE_` prefix                   |
| `WORKER_ID`                    | Worker                | Unique worker identity per process                                          |
| `WORKER_POLL_INTERVAL_MS`      | Worker                | Recovery polling interval                                                   |
| `WORKER_HEARTBEAT_INTERVAL_MS` | Worker                | Heartbeat frequency                                                         |
| `WORKER_STALE_AFTER_MS`        | Worker                | Offline heartbeat threshold                                                 |
| `RUN_DB_TESTS`                 | Integration tests     | Set to `1` to run the PostgreSQL atomic-claim test                          |

## Local setup

```bash
npm install
docker compose up -d
npm run db:generate
npm run db:push
npm run dev
```

`npm run db:push` creates or synchronizes the local database tables from the Prisma schema. Use `npm run db:migrate` instead when you are maintaining committed migration history.

Run the database-backed atomic-claim test after Docker Desktop is running:

```powershell
$env:DATABASE_URL="postgresql://scheduler:scheduler@localhost:5432/scheduler?schema=public"
$env:RUN_DB_TESTS="1"
npm run test:integration
```

## Worker

Start the worker independently from the repository root:

```powershell
npm run start --workspace worker
```

The worker loads `worker/.env`, registers its `WORKER_ID`, sends heartbeats, polls PostgreSQL, and uses Redis wake-ups when Redis is available. PostgreSQL polling remains the recovery path when Redis is offline.

Supported simulation handlers are selected with `payload.handler`:

```json
{ "handler": "DELAY_TEST", "durationMs": 1000 }
{ "handler": "FAIL_TEST" }
{ "handler": "PROCESS_DATA" }
{ "handler": "SEND_EMAIL" }
{ "handler": "GENERATE_REPORT" }
```

`SEND_EMAIL`, `PROCESS_DATA`, and `GENERATE_REPORT` are deliberately safe simulations; no external email or report service is called.

Delayed jobs use `delaySeconds` in the API. They are stored as `SCHEDULED`, promoted to `QUEUED` only after `scheduledAt`, and only then become eligible for atomic claiming.

API health: http://localhost:4000/health
Frontend: http://localhost:5173
API docs: http://localhost:4000/api-docs

See `docs/` for architecture, database, API, ER, and implementation-specific design decisions.
