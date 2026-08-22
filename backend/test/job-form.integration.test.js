import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";

const enabled = process.env.RUN_DB_TESTS === "1";

test(
  "job creation derives max attempts from the selected queue policy",
  { skip: !enabled },
  async () => {
    const suffix = Date.now().toString(36);
    const email = `job-form-${suffix}@test.local`;
    const password = "Correct-Horse1!";
    const register = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Job Form Test",
        email,
        password,
        passwordConfirmation: password,
      });
    const token = register.body.data.token;
    const organization = await prisma.organization.findFirst({
      where: { members: { some: { user: { email } } } },
    });
    const project = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: organization.id, name: `Project ${suffix}` });
    const queue = await request(app)
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.project.id,
        name: `Queue ${suffix}`,
        maximumAttempts: 7,
      });
    const job = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.project.id,
        queueId: queue.body.data.queue.id,
        name: "simulated-job",
        type: "IMMEDIATE",
        priority: 10,
        handlerType: "PROCESS_DATA",
      });

    assert.equal(job.status, 201);
    assert.equal(job.body.data.job.maxAttempts, 7);
    assert.equal(job.body.data.job.priority, 10);
    assert.equal(job.body.data.job.type, "IMMEDIATE");
    await prisma.user.delete({ where: { email } });
  },
);

test(
  "delayed job creation stores a future scheduled time",
  { skip: !enabled },
  async () => {
    const suffix = Date.now().toString(36);
    const email = `delay-form-${suffix}@test.local`;
    const password = "Correct-Horse1!";
    const register = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Delay Form Test",
        email,
        password,
        passwordConfirmation: password,
      });
    const token = register.body.data.token;
    const organization = await prisma.organization.findFirst({
      where: { members: { some: { user: { email } } } },
    });
    const project = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({
        organizationId: organization.id,
        name: `Delay Project ${suffix}`,
      });
    const queue = await request(app)
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.project.id,
        name: `Delay Queue ${suffix}`,
      });
    const before = Date.now();
    const job = await request(app)
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.project.id,
        queueId: queue.body.data.queue.id,
        name: "delayed-job",
        type: "DELAYED",
        delaySeconds: 30,
        handlerType: "DELAY_TEST",
      });
    const scheduledAt = new Date(job.body.data.job.scheduledAt).getTime();

    assert.equal(job.status, 201);
    assert.equal(job.body.data.job.status, "SCHEDULED");
    assert.ok(scheduledAt >= before + 29000);
    await prisma.user.delete({ where: { email } });
  },
);

test(
  "queue pause and resume controls update an authorized queue",
  { skip: !enabled },
  async () => {
    const suffix = Date.now().toString(36);
    const email = `queue-control-${suffix}@test.local`;
    const password = "Correct-Horse1!";
    const register = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Queue Control Test",
        email,
        password,
        passwordConfirmation: password,
      });
    const token = register.body.data.token;
    const organization = await prisma.organization.findFirstOrThrow({
      where: { members: { some: { user: { email } } } },
    });
    const project = await request(app)
      .post("/api/v1/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ organizationId: organization.id, name: `Queue Control ${suffix}` });
    const queue = await request(app)
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.project.id,
        name: `queue-control-${suffix}`,
      });

    try {
      const paused = await request(app)
        .post(`/api/v1/queues/${queue.body.data.queue.id}/pause`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(paused.status, 200);
      assert.equal(paused.body.data.queue.paused, true);

      const resumed = await request(app)
        .post(`/api/v1/queues/${queue.body.data.queue.id}/resume`)
        .set("Authorization", `Bearer ${token}`);
      assert.equal(resumed.status, 200);
      assert.equal(resumed.body.data.queue.paused, false);
    } finally {
      await prisma.user.delete({ where: { email } });
    }
  },
);
