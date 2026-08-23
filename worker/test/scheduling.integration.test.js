import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { scheduleNextIfRecurring } from "../src/scheduling.js";

const enabled = process.env.RUN_DB_TESTS === "1";

test("recurring completion schedules the next run only for recurring jobs", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  try {
    const user = await prisma.user.create({
      data: { email: `schedule-${suffix}@test.local`, name: "Schedule Test", passwordHash: "not-used" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: `Schedule Org ${suffix}`,
        slug: `schedule-org-${suffix}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: `Schedule Project ${suffix}` },
    });
    const queue = await prisma.queue.create({ data: { projectId: project.id, name: `schedule-${suffix}` } });
    const currentDate = new Date("2026-08-23T10:01:00.000Z");
    const recurring = await prisma.job.create({
      data: {
        projectId: project.id,
        queueId: queue.id,
        name: "recurring-source",
        type: "RECURRING",
        handlerType: "GENERATE_REPORT",
        payload: { report: "daily" },
        cronExpression: "*/5 * * * *",
        status: "COMPLETED",
        completedAt: currentDate,
      },
    });
    const nonRecurring = await prisma.job.create({
      data: {
        projectId: project.id,
        queueId: queue.id,
        name: "one-time-source",
        type: "IMMEDIATE",
        handlerType: "PROCESS_DATA",
        payload: {},
        status: "COMPLETED",
        completedAt: currentDate,
      },
    });

    const scheduled = await scheduleNextIfRecurring(prisma, recurring, currentDate);
    const skipped = await scheduleNextIfRecurring(prisma, nonRecurring, currentDate);
    const scheduledJob = await prisma.job.findUniqueOrThrow({
      where: { id: scheduled.id },
      include: { scheduledJob: true },
    });
    const totalJobs = await prisma.job.count({ where: { projectId: project.id } });

    assert.equal(scheduledJob.scheduledAt.toISOString(), "2026-08-23T10:05:00.000Z");
    assert.equal(scheduledJob.scheduledJob.nextRunAt.toISOString(), "2026-08-23T10:05:00.000Z");
    assert.equal(scheduledJob.handlerType, recurring.handlerType);
    assert.equal(skipped, null);
    assert.equal(totalJobs, 3);
  } finally {
    await prisma.user.deleteMany({ where: { email: `schedule-${suffix}@test.local` } });
    await prisma.$disconnect();
  }
});