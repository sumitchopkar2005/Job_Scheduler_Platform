import os from "node:os";
import { prisma } from "./claim.js";
import { config } from "./config.js";

export async function registerWorker() {
  return prisma.worker.upsert({
    where: { id: config.workerId },
    create: {
      id: config.workerId,
      hostname: os.hostname(),
      processId: process.pid,
      status: "ONLINE",
    },
    update: {
      hostname: os.hostname(),
      processId: process.pid,
      status: "ONLINE",
      lastHeartbeatAt: new Date(),
    },
  });
}

export function startHeartbeat(getActiveJobIds) {
  const beat = async () => {
    const activeJobIds = getActiveJobIds();
    const currentJobId = activeJobIds[0] || null;
    const recordedAt = new Date();
    await prisma.$transaction([
      prisma.worker.update({
        where: { id: config.workerId },
        data: {
          status: currentJobId ? "BUSY" : "ONLINE",
          currentJobId,
          lastHeartbeatAt: recordedAt,
        },
      }),
      prisma.workerHeartbeat.create({
        data: {
          workerId: config.workerId,
          status: currentJobId ? "BUSY" : "ONLINE",
          currentJobId,
          recordedAt,
        },
      }),
      ...(activeJobIds.length > 0
        ? [
            prisma.job.updateMany({
              where: {
                id: { in: activeJobIds },
                claimedBy: config.workerId,
                status: { in: ["CLAIMED", "RUNNING"] },
              },
              data: { claimedAt: recordedAt },
            }),
          ]
        : []),
      prisma.jobLog.create({
        data: {
          workerId: config.workerId,
          message: "Worker heartbeat",
          metadata: { currentJobId, activeJobIds },
        },
      }),
    ]);
  };
  const timer = setInterval(
    () => beat().catch((error) => console.error("Heartbeat failed", error)),
    config.heartbeatIntervalMs,
  );
  return () => clearInterval(timer);
}
