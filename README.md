# Job Scheduler Platform

A multi-tenant background-job scheduler with a React dashboard, authenticated Express API, PostgreSQL-backed state, Redis notifications, and independent workers.

## Problem and features

Reliable background work must survive concurrent workers, crashes, delayed schedules, and retries without leaking one tenant's data to another. The platform provides:

- Organizations, projects, queues, jobs, batches, metrics, workers, and DLQ views.
- Predefined handlers: `PROCESS_DATA`, `SEND_EMAIL`, `GENERATE_REPORT`, `DELAY_TEST`, and `FAIL_TEST`.
- One-off, delayed, recurring, and batch jobs.
- Atomic PostgreSQL claiming with `FOR UPDATE SKIP LOCKED` and per-queue concurrency.
- Worker heartbeats, stale-worker recovery, graceful shutdown, and lease fencing.
- Fixed, linear, or exponential retry backoff and dead-letter handling.
- JWT authentication, membership-based authorization, and IDOR protection.
- At-least-once job execution with execution and log history.

## Architecture

```text
React/Vite dashboard --Bearer JWT--> Express API --> PostgreSQL
                                      |                 ^
                                      +--> Redis ------> Scheduler workers
```

The API validates and authorizes user-facing requests. PostgreSQL is the durable source of truth for jobs and leases. Redis provides low-latency job notifications; workers also poll PostgreSQL so a missed notification does not lose work. See [architecture](docs/architecture.md).

## Stack

- React and Vite
- Node.js, Express, Zod, JWT, bcrypt, Helmet, rate limiting
- PostgreSQL and Prisma
- Redis pub/sub notifications
- Node.js test runner and Supertest

## Scheduler and worker model

1. An authorized user creates a job in an accessible queue.
2. The API validates, persists it, and notifies Redis.
3. A worker wakes from Redis or polling and atomically claims eligible work.
4. It records an execution, runs the selected handler, and heartbeats all active jobs.
5. It completes, retries, or DLQs the job; successful recurring jobs create their next occurrence.

```text
SCHEDULED -> QUEUED -> CLAIMED -> RUNNING -> COMPLETED
                                  |             |
                                  v             +-> next SCHEDULED (recurring)
                             RETRYING -> QUEUED
                                  |
                                  v
                                 DLQ
```

Claims lock candidate queues and jobs in one PostgreSQL transaction, reject paused queues, and enforce each queue's `concurrency`. Heartbeats refresh worker and active-job leases. Stale claims are conditionally requeued. Lease fencing permits a terminal state update only when the job is still `RUNNING` and claimed by that worker, preventing a resumed stale worker from overwriting a newer claim.

On `SIGINT`/`SIGTERM`, workers stop acquiring jobs, drain active work, mark themselves offline, and disconnect. Queue retry policies select fixed, linear, or exponential backoff; exhausted jobs get a `DeadLetterQueueEntry` and may be retried by an authorized user.

### Delivery semantics

Execution is **at least once**. A crash after an external side effect and before the completion write can result in another attempt, so production handlers must be idempotent.

## Authentication and authorization

Passwords are bcrypt hashes; API responses never include hashes. Backend-only JWTs carry minimal identity claims and protect all non-auth routes. The API derives the caller from the verified token and scopes access through:

```text
Organization membership -> Project -> Queue -> Job / DLQ entry
```

Frontend IDs are never sufficient for authorization.

## Project structure

```text
backend/             Express API, Prisma schema, routes, API tests
frontend/            React/Vite dashboard
worker/              Claiming, execution, heartbeats, recovery
docs/                Architecture, database, ER diagram, API reference
docker-compose.yml   Local PostgreSQL, Redis, and services
```

## Setup

Prerequisites: Node.js 20+, npm, and Docker Desktop (recommended).

```powershell
npm install
Copy-Item backend/.env.example backend/.env
Copy-Item worker/.env.example worker/.env
Copy-Item frontend/.env.example frontend/.env
docker compose up -d postgres redis
npm run db:generate
npm run db:push
```

Set a long, unique `JWT_SECRET` in `backend/.env`. Do not put it, database credentials, or Redis credentials in the frontend. If PowerShell blocks npm's script shim, use `npm.cmd` instead.

To run every service with Compose, supply the container's required secret first:

```powershell
$env:JWT_SECRET = "replace-with-a-long-random-secret"
docker compose up --build
```

Run all development services or individual workspaces:

```powershell
npm run dev
npm run dev --workspace backend
npm run dev --workspace worker
npm run dev --workspace frontend
```

API: `http://localhost:4000` · Swagger: `http://localhost:4000/api-docs` · Vite: `http://localhost:5173`.

`db:push` is the current local schema command. Use `npm run db:migrate` only when creating a named Prisma migration for a deliberate schema change.

## Environment variables

| Component | Variables | Purpose |
| --- | --- | --- |
| Backend | `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PORT` | Database, notifications, JWT security, browser origin, and API port. |
| Worker | `DATABASE_URL`, `REDIS_URL`, `WORKER_ID`, `WORKER_POLL_INTERVAL_MS`, `WORKER_HEARTBEAT_INTERVAL_MS`, `WORKER_STALE_AFTER_MS`, `WORKER_JOB_TIMEOUT_MS` | Durable state, notifications, identity, polling, leases, recovery, and handler timeout. |
| Frontend | `VITE_API_URL` | Public API base URL only. |

See each `.env.example` for development defaults. Never commit real `.env` files.

## Tests

```powershell
$env:RUN_DB_TESTS = "1"
npm test
npm run test:integration
npm run build --workspace frontend
```

Most recently verified: backend **14/14** passing, worker **7/7** passing, and the frontend production build passing.

## References

- [Architecture](docs/architecture.md)
- [Database design](docs/database.md)
- [ER diagram](docs/er-diagram.md)
- [API reference](docs/api.md)

## Known limitations

- At-least-once delivery requires idempotent handlers for external side effects.
- `currentJobId` provides limited dashboard observability when a worker runs multiple jobs concurrently.
- Redis notifications are not a durable event log; PostgreSQL polling is the durability fallback.

## Future improvements

- Handler idempotency keys and external-side-effect audit records.
- Richer multi-job worker/lease observability and alerting for stale workers or growing DLQs.
- Deployment-specific operational runbooks and metrics export.
