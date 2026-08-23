import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { claimNextJob } from "../src/claim.js";
import { completeClaimedJob, updateClaimedJob } from "../src/completion.js";

const enabled = process.env.RUN_DB_TESTS === "1";

test("two workers cannot claim the same job", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  try {
    const user = await prisma.user.create({
      data: {
        email: `claim-${suffix}@test.local`,
        name: "Claim Test",
        passwordHash: "not-used",
      },
    });
    const organization = await prisma.organization.create({
      data: {
        name: `Claim Org ${suffix}`,
        slug: `claim-org-${suffix}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    const project = await prisma.project.create({
      data: {
        organizationId: organization.id,
        name: `Claim Project ${suffix}`,
      },
    });
    const queue = await prisma.queue.create({
      data: {
        projectId: project.id,
        name: `claim-${suffix}`,
        concurrency: 1,
        paused: true,
        priority: 100,
      },
    });
    const job = await prisma.job.create({
      data: {
        projectId: project.id,
        queueId: queue.id,
        name: "single-claim",
        handlerType: "PROCESS_DATA",
        payload: {},
        status: "QUEUED",
      },
    });
    const firstWorkerId = `integration-worker-1-${suffix}`;
    const secondWorkerId = `integration-worker-2-${suffix}`;
    await prisma.worker.createMany({
      data: [
        { id: firstWorkerId, hostname: "test-host", processId: 1 },
        { id: secondWorkerId, hostname: "test-host", processId: 2 },
      ],
    });
    const pausedClaim = await claimNextJob(firstWorkerId);
    if (pausedClaim) {
      await prisma.job.update({ where: { id: pausedClaim.id }, data: { status: "QUEUED", claimedBy: null, claimedAt: null, attempts: 0 } });
    }
    const pausedJob = await prisma.job.findMany({ where: { id: { in: [job.id] } } });
    assert.equal(pausedJob[0].status, "QUEUED");
    await prisma.queue.update({
      where: { id: queue.id },
      data: { paused: false },
    });
    const [first, second] = await Promise.all([
      claimNextJob(firstWorkerId),
      claimNextJob(secondWorkerId),
    ]);
    const claimed = [first, second].filter((claimedJob) => claimedJob?.queueId === queue.id);
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].id, job.id);
    await prisma.organization.delete({ where: { id: organization.id } });
    await prisma.worker.deleteMany({
      where: { id: { in: [firstWorkerId, secondWorkerId] } },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test("queue concurrency limits claims to two workers", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  const workerIds = [1, 2, 3].map((number) => `concurrency-worker-${number}-${suffix}`);
  try {
    const user = await prisma.user.create({
      data: { email: `concurrency-${suffix}@test.local`, name: "Concurrency Test", passwordHash: "not-used" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: `Concurrency Org ${suffix}`,
        slug: `concurrency-org-${suffix}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: `Concurrency Project ${suffix}` },
    });
    const queue = await prisma.queue.create({
      data: { projectId: project.id, name: `concurrency-${suffix}`, concurrency: 2, priority: 100 },
    });
    const jobs = await prisma.job.createManyAndReturn({
      data: [1, 2, 3].map((number) => ({
        projectId: project.id,
        queueId: queue.id,
        name: `concurrent-job-${number}`,
        handlerType: "PROCESS_DATA",
        payload: {},
        status: "QUEUED",
      })),
    });
    await prisma.worker.createMany({
      data: workerIds.map((id, index) => ({ id, hostname: "test-host", processId: index + 1 })),
    });

    const claims = await Promise.all(workerIds.map((workerId) => claimNextJob(workerId)));
    const claimed = claims.filter((job) => job?.queueId === queue.id);
    const claimedIds = claimed.map((job) => job.id);
    const remaining = await prisma.job.findMany({ where: { id: { in: jobs.map((job) => job.id) } } });

    assert.equal(claimed.length, 2);
    assert.equal(new Set(claimedIds).size, 2);
    assert.equal(remaining.filter((job) => job.status === "QUEUED").length, 1);
    assert.equal(remaining.filter((job) => job.claimedBy).length, 2);
  } finally {
    await prisma.user.deleteMany({ where: { email: `concurrency-${suffix}@test.local` } });
    await prisma.worker.deleteMany({ where: { id: { in: workerIds } } });
    await prisma.$disconnect();
  }
});

test("lease fencing rejects completion from the previous worker", { skip: !enabled }, async () => {
  const prisma = new PrismaClient();
  const suffix = Date.now().toString(36);
  const workerA = `fence-worker-a-${suffix}`;
  const workerB = `fence-worker-b-${suffix}`;
  try {
    const user = await prisma.user.create({
      data: { email: `fence-${suffix}@test.local`, name: "Fence Test", passwordHash: "not-used" },
    });
    const organization = await prisma.organization.create({
      data: {
        name: `Fence Org ${suffix}`,
        slug: `fence-org-${suffix}`,
        members: { create: { userId: user.id, role: "OWNER" } },
      },
    });
    const project = await prisma.project.create({
      data: { organizationId: organization.id, name: `Fence Project ${suffix}` },
    });
    const queue = await prisma.queue.create({ data: { projectId: project.id, name: `fence-${suffix}` } });
    await prisma.worker.createMany({
      data: [
        { id: workerA, hostname: "test-host", processId: 1 },
        { id: workerB, hostname: "test-host", processId: 2 },
      ],
    });
    const job = await prisma.job.create({
      data: {
        projectId: project.id,
        queueId: queue.id,
        name: "fenced-job",
        handlerType: "PROCESS_DATA",
        payload: {},
        status: "RUNNING",
        claimedBy: workerA,
        claimedAt: new Date(),
      },
    });
    const execution = await prisma.jobExecution.create({
      data: { jobId: job.id, workerId: workerA, attemptNumber: 1 },
    });
    await prisma.job.update({ where: { id: job.id }, data: { claimedBy: workerB } });

    const completionUpdate = await updateClaimedJob(prisma, {
      jobId: job.id,
      workerId: workerA,
      completedAt: new Date(),
    });
    const completed = await completeClaimedJob(prisma, {
      jobId: job.id,
      executionId: execution.id,
      workerId: workerA,
      completedAt: new Date(),
      startedAt: execution.startedAt,
      result: { handler: "PROCESS_DATA" },
    });
    const fencedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });

    assert.equal(completionUpdate.count, 0);
    assert.equal(completed, false);
    assert.equal(fencedJob.status, "RUNNING");
    assert.equal(fencedJob.claimedBy, workerB);
  } finally {
    await prisma.user.deleteMany({ where: { email: `fence-${suffix}@test.local` } });
    await prisma.worker.deleteMany({ where: { id: { in: [workerA, workerB] } } });
    await prisma.$disconnect();
  }
});
