import { prisma } from "./claim.js";

export async function recoverStaleJobs(staleAfterMs) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const staleJobs = await prisma.job.findMany({
    where: {
      status: { in: ["CLAIMED", "RUNNING"] },
      claimedAt: { lt: cutoff },
      claimedBy: { not: null },
    },
    select: { id: true, claimedBy: true },
  });

  for (const job of staleJobs) {
    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          claimedBy: null,
          claimedAt: null,
          startedAt: null,
        },
      }),
      prisma.jobExecution.updateMany({
        where: { jobId: job.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: "Worker heartbeat became stale",
        },
      }),
      prisma.jobLog.create({
        data: {
          jobId: job.id,
          level: "WARN",
          message: "Stale job recovered after worker heartbeat timeout",
          metadata: { previousWorkerId: job.claimedBy },
        },
      }),
    ]);
  }
  return staleJobs.length;
}

export async function promoteDueRetries() {
  const result = await prisma.job.updateMany({
    where: { status: "RETRYING", scheduledAt: { lte: new Date() } },
    data: { status: "QUEUED" },
  });
  return result.count;
}

export async function promoteDueScheduledJobs() {
  const result = await prisma.job.updateMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    data: { status: "QUEUED" },
  });
  return result.count;
}
