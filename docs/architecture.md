# Architecture

The API owns authentication and durable state changes. PostgreSQL is the source of truth for organizations, queues, jobs, executions, logs, workers, and DLQ entries. Redis is reserved for low-latency dispatch and coordination. Independent workers claim work using PostgreSQL row locks (`FOR UPDATE SKIP LOCKED`) so multiple worker processes cannot execute the same job.

```mermaid
flowchart TD
  UI[React/Vite] --> API[Express API]
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  Redis --> W1[Worker 1]
  Redis --> W2[Worker 2]
  W1 --> PG
  W2 --> PG
```
