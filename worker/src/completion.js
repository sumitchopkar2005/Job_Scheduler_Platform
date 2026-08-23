export function updateClaimedJob(prisma, { jobId, workerId, completedAt }) {
  return prisma.job.updateMany({
    where: { id: jobId, status: "RUNNING", claimedBy: workerId },
    data: {
      status: "COMPLETED",
      completedAt,
      claimedBy: null,
      claimedAt: null,
    },
  });
}

export async function completeClaimedJob(
  prisma,
  { jobId, executionId, workerId, completedAt, startedAt, result },
) {
  return prisma.$transaction(async (tx) => {
    const updated = await updateClaimedJob(tx, { jobId, workerId, completedAt });
    if (updated.count !== 1) {
      await tx.jobExecution.updateMany({
        where: { id: executionId, status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          error: "Job lease was lost before completion",
        },
      });
      return false;
    }

    await tx.jobExecution.update({
      where: { id: executionId },
      data: {
        status: "COMPLETED",
        completedAt,
        durationMs: completedAt.getTime() - startedAt.getTime(),
      },
    });
    await tx.jobLog.create({
      data: {
        jobId,
        workerId,
        message: "Job completed",
        metadata: result,
      },
    });
    await tx.worker.update({
      where: { id: workerId },
      data: { jobsProcessed: { increment: 1 } },
    });
    return true;
  });
}
