import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { claimNextJob } from "../src/claim.js";

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
      data: { projectId: project.id, name: `claim-${suffix}`, concurrency: 1 },
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
    const [first, second] = await Promise.all([
      claimNextJob(firstWorkerId),
      claimNextJob(secondWorkerId),
    ]);
    const claimed = [first, second].filter(Boolean);
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
