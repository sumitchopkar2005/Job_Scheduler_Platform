# API reference

Base URL: `http://localhost:4000/api/v1`. All endpoints except registration, login, and health require `Authorization: Bearer <JWT>`. Protected routes authenticate first and then scope resources to the caller's organization memberships; invalid/missing tokens receive `401` and inaccessible resources are not exposed.

## Authentication

| Method | Endpoint | Auth | Purpose and important fields |
| --- | --- | --- | --- |
| POST | `/auth/register` | No | Request `name`, `email`, `password`, `passwordConfirmation`; returns safe `user` and `token`. |
| POST | `/auth/login` | No | Request `email`, `password`; returns safe `user` and `token` or generic credential error. |
| GET | `/auth/me` | Yes | Returns authenticated safe `user`. |
| POST | `/auth/change-password` | Yes | `currentPassword`, `newPassword`, `passwordConfirmation`; returns `204`. |
| POST | `/auth/logout` | Yes | Invalidates the token generation; returns `204`. |

## Organizations and projects

| Method | Endpoint | Auth | Purpose / fields |
| --- | --- | --- | --- |
| GET, POST | `/organizations` | Yes | List accessible organizations; create with `name`, optional `description`. |
| GET, PATCH, DELETE | `/organizations/:organizationId` | Yes | Read/update accessible organization; owner deletes. |
| GET, POST | `/organizations/:organizationId/projects` | Yes | List/create projects in accessible organization. |
| GET, POST | `/projects` | Yes | List accessible projects; create with `organizationId`, `name`, optional `description`. |
| GET, PATCH, DELETE | `/projects/:id` | Yes | Read, update, or delete accessible project. |

## Queues

| Method | Endpoint | Auth | Purpose / fields |
| --- | --- | --- | --- |
| GET, POST | `/queues` | Yes | List accessible queues (optional `projectId`); create with `projectId`, `name`, `concurrency`, retry policy. |
| GET, PATCH, DELETE | `/queues/:id` | Yes | Read, update settings, or delete accessible queue. |
| POST | `/queues/:id/pause`, `/queues/:id/resume` | Yes | Stop/resume claiming for an accessible queue. |
| GET | `/queues/:id/stats` | Yes | Queue and job-state statistics. |

## Jobs and batches

| Method | Endpoint | Auth | Purpose / fields |
| --- | --- | --- | --- |
| GET, POST | `/jobs` | Yes | List accessible jobs (`page`, `limit`, optional `status`); create with `queueId`, `handlerType`, optional schedule fields. |
| POST | `/jobs/batch` | Yes | Create a batch of jobs in an accessible project. |
| GET | `/jobs/:id` | Yes | Read accessible job. |
| POST | `/jobs/:id/cancel`, `/jobs/:id/retry` | Yes | Cancel or manually retry an accessible job where its state permits. |
| GET | `/jobs/:id/executions`, `/jobs/:id/logs` | Yes | Attempt history and logs for accessible job. |
| GET | `/jobs/batches/:id` | Yes | Accessible batch and its jobs. |

## Operations

| Method | Endpoint | Auth | Purpose / fields |
| --- | --- | --- | --- |
| GET | `/workers`, `/workers/:id` | Yes | Workers with activity accessible through the caller's organizations. |
| GET | `/metrics` | Yes | Organization-scoped job, queue, worker, and DLQ counts. |
| GET | `/dlq`, `/dlq/:id` | Yes | Accessible DLQ entries and entry detail. |
| POST | `/dlq/:id/retry` | Yes | Retry job attached to an accessible DLQ entry. |
| GET | `/health` | No | Service liveness response. |

Swagger provides generated request schemas and response examples at `/api-docs` on a running backend.
