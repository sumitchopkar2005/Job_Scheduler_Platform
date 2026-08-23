# Design decisions

- **PostgreSQL is durable scheduler state.** Jobs, claims, executions, retries, worker liveness, and DLQ records are transactional database data.
- **Redis accelerates discovery, not correctness.** API notifications wake workers quickly; polling PostgreSQL recovers from missed messages.
- **Predefined handlers over arbitrary execution.** Jobs use `handlerType` values: `PROCESS_DATA`, `SEND_EMAIL`, `GENERATE_REPORT`, `DELAY_TEST`, and `FAIL_TEST`; the UI has no arbitrary JSON handler payload input.
- **Database-enforced claims and queue limits.** `FOR UPDATE SKIP LOCKED` and active-job checks keep exclusivity and queue concurrency independent of process-local state.
- **At-least-once delivery with lease fencing.** Stale claims can run again, so handlers must be idempotent. Terminal state writes require the current `RUNNING` lease and claiming worker.
