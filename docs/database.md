# Database design

`backend/prisma/schema.prisma` is the authoritative design. PostgreSQL stores tenant data and durable scheduler state.

## Main entities

| Area | Models | Purpose |
| --- | --- | --- |
| Identity | `User`, `Organization`, `OrganizationMember` | Accounts and the membership authorization boundary. |
| Hierarchy | `Project`, `Queue`, `RetryPolicy` | Projects belong to organizations; queues belong to projects and can have one retry policy. |
| Scheduling | `Job`, `JobBatch`, `ScheduledJob` | Jobs, batch grouping, and recurring schedule metadata. |
| Execution | `Worker`, `JobExecution`, `JobLog`, `WorkerHeartbeat` | Claims, attempts, logs, and liveness. |
| Failures | `DeadLetterQueueEntry` | One optional DLQ record per exhausted job. |

## Relationships

```text
User --< OrganizationMember >-- Organization --< Project --< Queue --< Job
                                      |                         +-- RetryPolicy
                                      +-- JobBatch --< Job
Job --< JobExecution >-- Worker; Job --< JobLog; Worker --< WorkerHeartbeat
Job --0..1 ScheduledJob; Job --0..1 DeadLetterQueueEntry
```

`OrganizationMember` is unique on `(userId, organizationId)`. Authorization follows this hierarchy rather than trusting a requested resource ID.

## Important indexes and constraints

| Model | Index / constraint | Why |
| --- | --- | --- |
| `User` | unique `email` | Prevent duplicate accounts and supports login lookup. |
| `Organization` | unique `slug` | Unique organization identifier. |
| `OrganizationMember` | unique `(userId, organizationId)`; `organizationId` | One membership per user/org and fast membership lookup. |
| `Project` | `organizationId` | Organization-scoped project access. |
| `Queue` | unique `(projectId, name)`; `(projectId, paused, priority)` | Unique names and candidate-queue filtering. |
| `Job` | `(queueId, status, scheduledAt, priority)` | Finds eligible work in queue scheduling order. |
| `Job` | `(status, claimedAt)` | Stale claim recovery. |
| `Job` | `(projectId, createdAt)`; `batchId` | Project job lists and batch lookup. |
| `JobExecution` / `JobLog` | `(jobId, startedAt)` / `(jobId, createdAt)` | Ordered attempt and log history. |
| `Worker` / `WorkerHeartbeat` | `(status, lastHeartbeatAt)` / `(workerId, recordedAt)` | Liveness and heartbeat history. |
| `ScheduledJob` | unique `jobId`; `(enabled, nextRunAt)` | One schedule per job and due-schedule lookup. |
| `DeadLetterQueueEntry` | unique `jobId`; `(queueId, createdAt)` | One DLQ entry per job and queue DLQ views. |

Organization deletion cascades to memberships/projects; project deletion to queues/jobs/batches; queue deletion to retry policy/jobs/DLQ; and job deletion to executions/logs/schedule/DLQ. Worker references from historical execution/log/DLQ records use `SET NULL`, while worker heartbeats cascade.

See [ER diagram](er-diagram.md).
