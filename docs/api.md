# API

The versioned REST API is served from `/api/v1`; interactive OpenAPI documentation is available at `/api-docs`.

All organization, project, queue, job, worker, DLQ, and metrics endpoints require `Authorization: Bearer <jwt>`. Responses use `{ success, data }` on success and `{ success: false, error: { code, message } }` on failure. Job listing supports `page`, `limit`, and `status` query parameters.

Core endpoints include authentication (`/auth/register`, `/auth/login`, `/auth/me`), organization CRUD, project CRUD with organization membership authorization, queues (`pause`, `resume`, `stats`), jobs (`retry`, `executions`, `logs`), workers, DLQ entries, and metrics. New projects are created with `POST /projects` using `{ organizationId, name, description }`; queue creation requires an authorized `projectId`.
