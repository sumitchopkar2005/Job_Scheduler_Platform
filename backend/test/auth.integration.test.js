import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/db.js";

const enabled = process.env.RUN_DB_TESTS === "1";

test(
  "registration persists a hashed password and returns a token",
  { skip: !enabled },
  async () => {
    const suffix = Date.now().toString(36);
    const email = `auth-${suffix}@test.local`;
    const password = "Correct-Horse1!";
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({
        name: "Integration User",
        email,
        password,
        passwordConfirmation: password,
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.success, true);
    assert.ok(response.body.data.token);
    assert.equal(response.body.data.user.email, email);

    const user = await prisma.user.findUnique({ where: { email } });
    assert.ok(user);
    assert.notEqual(user.passwordHash, password);
    await prisma.user.delete({ where: { id: user.id } });
  },
);
