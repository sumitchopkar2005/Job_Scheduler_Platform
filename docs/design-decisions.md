# Design Decisions

1. **Architecture**: Express handles short-lived control-plane requests; workers are independent processes so API latency is not coupled to job execution.
2. **PostgreSQL vs Redis**: PostgreSQL owns durable state, history, authorization, and reporting. Redis is reserved for dispatch/coordination and can be added without weakening the source of truth.
3. **Atomic job claiming**: A transaction locks eligible queues and selects a job with `FOR UPDATE SKIP LOCKED`; the claim updates status and attempt count before the transaction commits.
4. **Concurrency control**: A queue's active `CLAIMED` plus `RUNNING` count is compared to its configured limit while the queue row is locked.
5. **Retry strategy**: Queue policy determines fixed, linear, or exponential delay. Every attempt has a JobExecution and JobLog record.
6. **Scheduling**: `scheduledAt` gates worker eligibility. Cron metadata is stored separately so a scheduler loop can materialize future runs without changing job history.
7. **Worker heartbeat**: Workers persist periodic heartbeats; operational reads mark non-OFFLINE workers stale after the configured timeout.
8. **Graceful shutdown**: SIGTERM stops polling, waits for active jobs, marks the worker offline, and disconnects Prisma.
9. **Idempotency**: Durable claim state prevents duplicate claims; job handlers should still be idempotent because process failure can happen after external side effects.
10. **DLQ design**: A unique DLQ row preserves the final error, worker, and attempt count while the original job remains inspectable and replayable.
11. **API design**: `/api/v1` is stable and returns structured errors, pagination, and authorization-scoped resources.
12. **Frontend architecture**: React Router and Axios are isolated from domain state; polling hooks can later be replaced with WebSocket subscriptions.
13. **Observability**: execution, job-log, heartbeat, and aggregate metric records provide both incident detail and dashboard summaries.
14. **Scalability**: workers can be replicated horizontally; PostgreSQL indexes target claim and history queries, while Redis can absorb dispatch bursts.
15. **Trade-offs**: PostgreSQL claiming is simpler and more durable than a Redis-only queue, but high-volume deployments will need partitioning, archival, and a dedicated scheduler/materializer.
16. **Worker execution**: Handlers are controlled simulations selected by `payload.handler`, allowing delay, failure, timeout, retry, DLQ, and cancellation tests without external side effects.
17. **Crash recovery**: `claimedAt` and worker heartbeat age identify abandoned `CLAIMED`/`RUNNING` jobs. Recovery closes their running execution record and returns the job to `QUEUED`.
