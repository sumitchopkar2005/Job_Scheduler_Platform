import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("health endpoint reports API status", async () => {
  const response = await request(app).get("/health");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.status, "ok");
});

test("protected auth endpoint rejects anonymous requests", async () => {
  const response = await request(app).get("/api/v1/auth/me");
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "AUTH_REQUIRED");
});

test("registration validates password length before touching the database", async () => {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({ name: "A", email: "bad", password: "short" });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "VALIDATION_ERROR");
});

test("job creation is protected before accessing the database", async () => {
  const response = await request(app)
    .post("/api/v1/jobs")
    .send({
      projectId: "project",
      queueId: "queue",
      name: "hourly",
      type: "RECURRING",
      handlerType: "PROCESS_DATA",
    });
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, "AUTH_REQUIRED");
});
