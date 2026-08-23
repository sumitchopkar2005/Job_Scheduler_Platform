import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";

const enabled = process.env.RUN_DB_TESTS === "1";

async function createJobContext(suffix) {
  const email = `payload-${suffix}@test.local`;
  const password = "Correct-Horse1!";
  const register = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Payload Test",
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
    .send({ organizationId: organization.id, name: `Payload Project ${suffix}` });
  const queue = await request(app)
    .post("/api/v1/queues")
    .set("Authorization", `Bearer ${token}`)
    .send({ projectId: project.body.data.project.id, name: `payload-${suffix}` });
  return {
    email,
    token,
    projectId: project.body.data.project.id,
    queueId: queue.body.data.queue.id,
  };
}

test(
  "job creation preserves an optional non-trivial payload",
  { skip: !enabled },
  async () => {
    const suffix = `${Date.now().toString(36)}-provided`;
    const context = await createJobContext(suffix);
    const payload = {
      records: [{ id: 17, value: "queued" }],
      options: { notify: true, priority: "high" },
    };

    try {
      const created = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${context.token}`)
        .send({
          projectId: context.projectId,
          queueId: context.queueId,
          name: "payload-job-name",
          handlerType: "PROCESS_DATA",
          payload,
        });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.data.job.payload, payload);

      const fetched = await request(app)
        .get(`/api/v1/jobs/${created.body.data.job.id}`)
        .set("Authorization", `Bearer ${context.token}`);
      assert.equal(fetched.status, 200);
      assert.deepEqual(fetched.body.data.job.payload, payload);
    } finally {
      await prisma.user.delete({ where: { email: context.email } });
    }
  },
);

test(
  "job creation defaults an omitted payload to an empty object",
  { skip: !enabled },
  async () => {
    const suffix = `${Date.now().toString(36)}-empty`;
    const context = await createJobContext(suffix);

    try {
      const created = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${context.token}`)
        .send({
          projectId: context.projectId,
          queueId: context.queueId,
          name: "job-without-payload",
          handlerType: "SEND_EMAIL",
        });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.data.job.payload, {});

      const fetched = await request(app)
        .get(`/api/v1/jobs/${created.body.data.job.id}`)
        .set("Authorization", `Bearer ${context.token}`);
      assert.equal(fetched.status, 200);
      assert.deepEqual(fetched.body.data.job.payload, {});
    } finally {
      await prisma.user.delete({ where: { email: context.email } });
    }
  },
);

test(
  "job creation is idempotent within a project",
  { skip: !enabled },
  async () => {
    const suffix = `${Date.now().toString(36)}-idempotent`;
    const context = await createJobContext(suffix);
    const body = {
      projectId: context.projectId,
      queueId: context.queueId,
      name: "idempotent-job",
      handlerType: "PROCESS_DATA",
      idempotencyKey: `request-${suffix}`,
    };

    try {
      const first = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${context.token}`)
        .send(body);
      const second = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${context.token}`)
        .send(body);
      const count = await prisma.job.count({
        where: {
          projectId: context.projectId,
          idempotencyKey: body.idempotencyKey,
        },
      });

      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(second.body.data.job.id, first.body.data.job.id);
      assert.equal(count, 1);
    } finally {
      await prisma.user.delete({ where: { email: context.email } });
    }
  },
);

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

test(
  "recurring jobs reject invalid cron expressions before scheduling",
  { skip: !enabled },
  async () => {
    const suffix = Date.now().toString(36);
    const email = `invalid-cron-${suffix}@test.local`;
    const password = "Correct-Horse1!";
    const register = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Cron Validation Test",
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
      .send({ organizationId: organization.id, name: `Cron Validation ${suffix}` });
    const queue = await request(app)
      .post("/api/v1/queues")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId: project.body.data.project.id,
        name: `cron-validation-${suffix}`,
      });

    try {
      const response = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${token}`)
        .send({
          projectId: project.body.data.project.id,
          queueId: queue.body.data.queue.id,
          name: "invalid-recurring-job",
          type: "RECURRING",
          handlerType: "PROCESS_DATA",
          scheduledAt: new Date(Date.now() + 60_000).toISOString(),
          cronExpression: "invalid cron",
        });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
    } finally {
      await prisma.user.delete({ where: { email } });
    }
  },
);
