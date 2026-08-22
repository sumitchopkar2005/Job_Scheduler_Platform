import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";

const enabled = process.env.RUN_DB_TESTS === "1";

async function registerUser(suffix, name) {
  const email = `${suffix}@test.local`;
  const password = "Correct-Horse1!";
  const response = await request(app).post("/api/v1/auth/register").send({
    name,
    email,
    password,
    passwordConfirmation: password,
  });

  assert.equal(response.status, 201);
  return { email, token: response.body.data.token };
}

test(
  "members cannot access another user's organization, project, queue, job, or metrics",
  { skip: !enabled },
  async () => {
    const suffix = Date.now().toString(36);
    const owner = await registerUser(`owner-access-${suffix}`, "Owner Access");
    const intruder = await registerUser(
      `intruder-access-${suffix}`,
      "Intruder Access",
    );

    try {
      const organization = await prisma.organization.findFirstOrThrow({
        where: { members: { some: { user: { email: owner.email } } } },
      });
      const projectResponse = await request(app)
        .post("/api/v1/projects")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ organizationId: organization.id, name: `Private ${suffix}` });
      assert.equal(projectResponse.status, 201);

      const project = projectResponse.body.data.project;
      const queueResponse = await request(app)
        .post("/api/v1/queues")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({ projectId: project.id, name: `private-${suffix}` });
      assert.equal(queueResponse.status, 201);

      const queue = queueResponse.body.data.queue;
      const jobResponse = await request(app)
        .post("/api/v1/jobs")
        .set("Authorization", `Bearer ${owner.token}`)
        .send({
          projectId: project.id,
          queueId: queue.id,
          name: "private-job",
          handlerType: "PROCESS_DATA",
        });
      assert.equal(jobResponse.status, 201);

      const intruderRequests = await Promise.all([
        request(app)
          .get(`/api/v1/organizations/${organization.id}`)
          .set("Authorization", `Bearer ${intruder.token}`),
        request(app)
          .get(`/api/v1/projects/${project.id}`)
          .set("Authorization", `Bearer ${intruder.token}`),
        request(app)
          .get(`/api/v1/queues/${queue.id}`)
          .set("Authorization", `Bearer ${intruder.token}`),
        request(app)
          .get(`/api/v1/jobs/${jobResponse.body.data.job.id}`)
          .set("Authorization", `Bearer ${intruder.token}`),
      ]);

      for (const response of intruderRequests) {
        assert.equal(response.status, 404);
      }

      const intruderMetrics = await request(app)
        .get("/api/v1/metrics")
        .set("Authorization", `Bearer ${intruder.token}`);
      assert.equal(intruderMetrics.status, 200);
      assert.equal(intruderMetrics.body.data.totalJobs, 0);
    } finally {
      await prisma.user.deleteMany({
        where: { email: { in: [owner.email, intruder.email] } },
      });
    }
  },
);
