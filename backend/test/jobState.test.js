import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBackoff,
  assertTransition,
} from "../src/services/jobState.js";

test("backoff strategies calculate fixed, linear, and exponential delays", () => {
  assert.equal(calculateBackoff("FIXED", 10, 3, 3600), 10);
  assert.equal(calculateBackoff("LINEAR", 10, 3, 3600), 30);
  assert.equal(calculateBackoff("EXPONENTIAL", 10, 3, 3600), 40);
  assert.equal(calculateBackoff("EXPONENTIAL", 10, 9, 50), 50);
});

test("invalid lifecycle transitions are rejected", () => {
  assert.throws(
    () => assertTransition("COMPLETED", "QUEUED"),
    /Invalid job transition/,
  );
  assert.doesNotThrow(() => assertTransition("DLQ", "QUEUED"));
});
