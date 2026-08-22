export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Runway Scheduler API",
    version: "1.0.0",
    description: "REST API for the distributed job scheduler.",
  },
  servers: [{ url: "http://localhost:4000/api/v1" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
  paths: {
    "/auth/register": {
      post: {
        summary: "Register a user",
        responses: {
          201: { description: "Created" },
          400: { description: "Validation error" },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Authenticate a user",
        responses: {
          200: { description: "Authenticated" },
          401: { description: "Invalid credentials" },
        },
      },
    },
    "/auth/me": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "Get current user",
        responses: {
          200: { description: "Current user" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/organizations": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "List organizations",
        responses: { 200: { description: "Organizations" } },
      },
      post: {
        security: [{ bearerAuth: [] }],
        summary: "Create organization",
        responses: { 201: { description: "Created" } },
      },
    },
    "/organizations/{organizationId}": {
      patch: {
        security: [{ bearerAuth: [] }],
        summary: "Update organization",
        parameters: [
          {
            in: "path",
            name: "organizationId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 200: { description: "Updated" } },
      },
      delete: {
        security: [{ bearerAuth: [] }],
        summary: "Delete organization",
        parameters: [
          {
            in: "path",
            name: "organizationId",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: { 204: { description: "Deleted" } },
      },
    },
    "/projects": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "List projects",
        responses: { 200: { description: "Projects" } },
      },
      post: {
        security: [{ bearerAuth: [] }],
        summary: "Create project for an organization",
        responses: { 201: { description: "Created" } },
      },
    },
    "/queues": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "List queues",
        responses: { 200: { description: "Queues" } },
      },
      post: {
        security: [{ bearerAuth: [] }],
        summary: "Create queue",
        responses: { 201: { description: "Created" } },
      },
    },
    "/jobs": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "List jobs",
        responses: { 200: { description: "Jobs and pagination" } },
      },
      post: {
        security: [{ bearerAuth: [] }],
        summary: "Create job",
        responses: { 201: { description: "Created" } },
      },
    },
    "/workers": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "List workers",
        responses: { 200: { description: "Workers" } },
      },
    },
    "/dlq": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "List dead letter entries",
        responses: { 200: { description: "DLQ entries" } },
      },
    },
    "/metrics": {
      get: {
        security: [{ bearerAuth: [] }],
        summary: "Get scheduler metrics",
        responses: { 200: { description: "Metrics" } },
      },
    },
  },
};
