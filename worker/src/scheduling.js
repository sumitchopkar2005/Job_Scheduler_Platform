import { CronExpressionParser } from "cron-parser";

export async function scheduleNext(prisma, job, currentDate) {
  const nextRunAt = CronExpressionParser.parse(job.cronExpression, {
    currentDate,
  })
    .next()
    .toDate();
  return prisma.job.create({
    data: {
      projectId: job.projectId,
      queueId: job.queueId,
      name: job.name,
      type: "RECURRING",
      handlerType: job.handlerType,
      payload: job.payload,
      priority: job.priority,
      status: "SCHEDULED",
      scheduledAt: nextRunAt,
      cronExpression: job.cronExpression,
      maxAttempts: job.maxAttempts,
      scheduledJob: { create: { cron: job.cronExpression, nextRunAt } },
    },
  });
}

export async function scheduleNextIfRecurring(prisma, job, currentDate) {
  if (job.type !== "RECURRING" || !job.cronExpression) return null;
  return scheduleNext(prisma, job, currentDate);
}
