# Database Design

Prisma models normalize ownership and execution history. Jobs are indexed by queue, status, schedule, and priority for the worker claim query. Execution and log history are separate append-oriented records so job rows remain small and current-state reads stay fast. Foreign keys cascade from project/queue/job ownership while worker references are nullable to preserve historical records when a worker disappears.
