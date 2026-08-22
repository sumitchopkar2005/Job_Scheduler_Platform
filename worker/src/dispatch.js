import Redis from "ioredis";
import { config } from "./config.js";

export async function startDispatchWakeup(onWake) {
  const subscriber = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  });
  subscriber.on("error", () => undefined);
  try {
    await subscriber.subscribe(
      "scheduler:job-created",
      "scheduler:batch-created",
    );
    subscriber.on("message", () => onWake());
    return () => subscriber.quit().catch(() => undefined);
  } catch (error) {
    console.warn(
      "Redis wake-up disabled; PostgreSQL polling remains active",
      error.message,
    );
    subscriber.disconnect();
    return () => undefined;
  }
}
