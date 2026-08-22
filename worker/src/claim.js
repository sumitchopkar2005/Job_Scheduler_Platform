import { PrismaClient, Prisma } from "@prisma/client";
import "./config.js";

export const prisma = new PrismaClient();

export async function claimNextJob(workerId) {
  return prisma.$transaction(async (tx) => {
    const queues = await tx.$queryRaw(Prisma.sql`
      SELECT q."id"
      FROM "Queue" q
      WHERE q."paused" = false
        AND EXISTS (
          SELECT 1 FROM "Job" available
          WHERE available."queueId" = q."id"
            AND available."status" = 'QUEUED'
            AND available."scheduledAt" <= NOW()
        )
        AND (
          SELECT COUNT(*) FROM "Job" active
          WHERE active."queueId" = q."id"
            AND active."status" IN ('CLAIMED', 'RUNNING')
        ) < q."concurrency"
      ORDER BY q."priority" DESC, q."createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    if (!queues[0]) return null;

    const jobs = await tx.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "Job"
      WHERE "queueId" = ${queues[0].id}
        AND "status" = 'QUEUED'
        AND "scheduledAt" <= NOW()
      ORDER BY "priority" DESC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    if (!jobs[0]) return null;

    const claimed = await tx.job.update({
      where: { id: jobs[0].id },
      data: {
        status: "CLAIMED",
        claimedBy: workerId,
        claimedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    await tx.jobLog.create({
      data: {
        jobId: claimed.id,
        workerId,
        message: "Job claimed",
        metadata: { queueId: claimed.queueId },
      },
    });
    return claimed;
  });
}
