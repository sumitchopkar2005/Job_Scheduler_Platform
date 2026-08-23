import Redis from "ioredis";
import { config } from "./config.js";

const redisChannels = ["scheduler:job-created", "scheduler:batch-created"];
const reconnectDelayMs = 5000;

export function startDispatchWakeup(onWake) {
  let subscriber;
  let reconnectTimer;
  let stopped = false;
  let warningShown = false;

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect();
    }, reconnectDelayMs);
  };

  const connect = async () => {
    if (stopped || subscriber) return;
    const client = new Redis(config.redisUrl, {
      lazyConnect: true,
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      reconnectOnError: () => false,
    });
    client.on("error", () => undefined);
    client.on("end", () => {
      if (subscriber === client) {
        subscriber = undefined;
        scheduleReconnect();
      }
    });

    try {
      await client.connect();
      await client.subscribe(...redisChannels);
      if (stopped) {
        client.disconnect();
        return;
      }
      subscriber = client;
      client.on("message", () => onWake());
      console.log("[WORKER] Redis wake-up connected");
    } catch (error) {
      client.disconnect();
      if (!warningShown) {
        console.warn("[WORKER] Redis wake-up unavailable; polling remains active");
        warningShown = true;
      }
      scheduleReconnect();
    }
  };

  void connect();

  return () => {
    stopped = true;
    clearTimeout(reconnectTimer);
    return subscriber?.quit().catch(() => undefined);
  };
}
