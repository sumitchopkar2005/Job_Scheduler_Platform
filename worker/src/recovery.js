import { prisma } from "./claim.js";

export async function recoverStaleJobs(staleAfterMs, filter = {}) {
  const cutoff = new Date(Date.now() - staleAfterMs);
  const staleJobs = await prisma.job.findMany({
    where: {
      ...filter,
      status: { in: ["CLAIMED", "RUNNING"] },
      claimedAt: { lt: cutoff },
      claimedBy: { not: null },
    },
    select: { id: true, claimedBy: true },
  });

  let recoveredCount = 0;
  for (const job of staleJobs) {
    const recovered = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: {
          id: job.id,
          status: { in: ["CLAIMED", "RUNNING"] },
          claimedAt: { lt: cutoff },
          claimedBy: job.claimedBy,
        },
        data: {
          status: "QUEUED",
          claimedBy: null,
          claimedAt: null,
          startedAt: null,
        },
      });
      if (updated.count !== 1) return false;

      await tx.jobExecution.updateMany({
        where: { jobId: job.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error: "Worker heartbeat became stale",
        },
      });
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: "WARN",
          message: "Stale job recovered after worker heartbeat timeout",
          metadata: { previousWorkerId: job.claimedBy },
        },
      });
      return true;
    });
    if (recovered) recoveredCount += 1;
  }
  return recoveredCount;
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
