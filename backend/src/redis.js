import Redis from "ioredis";
import "./config/env.js";

export const redis = new Redis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  },
);

let redisWarningShown = false;
redis.on("error", (error) => {
  if (!redisWarningShown) {
    console.warn(`[ERROR] Redis unavailable | ${error.message}`);
    redisWarningShown = true;
  }
});

export async function publishJobEvent(event, payload) {
  try {
    if (redis.status === "wait") await redis.connect();
    await redis.publish(`scheduler:${event}`, JSON.stringify(payload));
  } catch (error) {
    console.warn(`[ERROR] Redis dispatch unavailable | ${error.message}`);
  }
}
