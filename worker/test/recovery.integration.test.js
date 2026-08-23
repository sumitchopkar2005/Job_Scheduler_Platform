import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { recoverStaleJobs } from "../src/recovery.js";

const enabled = process.env.RUN_DB_TESTS === "1";

test("stale running jobs are recovered and their execution history is closed", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  const workerId = `recovery-worker-${suffix}`;

  try {
    const user = await prisma.user.create({
      data: {
        email: `recovery-${suffix}@test.local`,
        name: "Recovery Test",
        passwordHash: "not-used",
      },
    });
    const organization = await prisma.organization.create({
      data: {
        name: `Recovery Org ${suffix}`,
        slug: `recovery-org-${suffix}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: `Recovery Project ${suffix}` },
    });
    const queue = await prisma.queue.create({
      data: { projectId: project.id, name: `recovery-${suffix}` },
    });
    await prisma.worker.create({
      data: { id: workerId, hostname: "test-host", processId: 1 },
    });
    const job = await prisma.job.create({
      data: {
        projectId: project.id,
        queueId: queue.id,
        name: "stale-job",
        handlerType: "PROCESS_DATA",
        payload: {},
        status: "RUNNING",
        claimedBy: workerId,
        claimedAt: new Date(),
      },
    });
    const execution = await prisma.jobExecution.create({
      data: { jobId: job.id, workerId, attemptNumber: 1 },
    });

    assert.equal(await recoverStaleJobs(0, { queueId: queue.id }), 1);

    const recoveredJob = await prisma.job.findUniqueOrThrow({
      where: { id: job.id },
      include: { logs: true },
    });
    const recoveredExecution = await prisma.jobExecution.findUniqueOrThrow({
      where: { id: execution.id },
    });
    assert.equal(recoveredJob.status, "QUEUED");
    assert.equal(recoveredJob.claimedBy, null);
    assert.equal(recoveredJob.claimedAt, null);
    assert.equal(recoveredExecution.status, "FAILED");
    assert.equal(recoveredExecution.error, "Worker heartbeat became stale");
    assert.ok(
      recoveredJob.logs.some(
        (log) => log.message === "Stale job recovered after worker heartbeat timeout",
      ),
    );
  } finally {
    await prisma.organization.deleteMany({
      where: { name: `Recovery Org ${suffix}` },
    });
    await prisma.worker.deleteMany({ where: { id: workerId } });
    await prisma.$disconnect();
  }
});
