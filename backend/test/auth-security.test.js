import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../src/app.js";
import { env } from "../src/config/env.js";
import { createAccessToken } from "../src/utils/auth.js";

test("authentication rejects malformed, expired, and tampered bearer tokens", async () => {
  const malformed = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", "Bearer not-a-jwt");
  assert.equal(malformed.status, 401);

  const expired = jwt.sign({ sub: "user-id", tv: 0 }, env.jwtSecret, {
    expiresIn: -1,
    issuer: "distributed-job-scheduler",
    audience: "scheduler-api",
    algorithm: "HS256",
  });
  const expiredResponse = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${expired}`);
  assert.equal(expiredResponse.status, 401);

  const token = createAccessToken({ id: "user-id", tokenVersion: 0 });
  const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
  const tamperedResponse = await request(app)
    .get("/api/v1/auth/me")
    .set("Authorization", `Bearer ${tampered}`);
  assert.equal(tamperedResponse.status, 401);
});

test("auth endpoints enforce strong passwords, strict bodies, and configured CORS", async () => {
  const weak = await request(app)
    .post("/api/v1/auth/register")
    .send({
      name: "Security Test",
      email: "security@test.local",
      password: "weak-password",
      passwordConfirmation: "weak-password",
      unexpected: true,
    });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.code, "VALIDATION_ERROR");

  const cors = await request(app)
    .options("/health")
    .set("Origin", env.corsOrigin)
    .set("Access-Control-Request-Method", "GET");
  assert.equal(cors.headers["access-control-allow-origin"], env.corsOrigin);
  assert.notEqual(cors.headers["access-control-allow-origin"], "*");
});
