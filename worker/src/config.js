import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env"),
});

export const config = {
  workerId: process.env.WORKER_ID || `worker-${process.pid}`,
  heartbeatIntervalMs: Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 5000),
  staleAfterMs: Number(process.env.WORKER_STALE_AFTER_MS || 15000),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 500),
  defaultTimeoutMs: Number(process.env.WORKER_JOB_TIMEOUT_MS || 30000),
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};
