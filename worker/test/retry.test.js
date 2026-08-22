import test from "node:test";
import assert from "node:assert/strict";
import { retryDecision } from "../src/retry.js";

const queue = {
  retryPolicy: {
    strategy: "EXPONENTIAL",
    initialDelaySeconds: 5,
    maximumDelaySeconds: 60,
  },
};

test("a failed job below its maximum attempts is scheduled for retry", () => {
  const decision = retryDecision({ attempts: 2, maxAttempts: 3 }, queue);

  assert.deepEqual(decision, {
    canRetry: true,
    retryDelay: 10,
    status: "RETRYING",
  });
});

test("a failed job at its maximum attempts is moved to the DLQ", () => {
  const decision = retryDecision({ attempts: 3, maxAttempts: 3 }, queue);

  assert.deepEqual(decision, {
    canRetry: false,
    retryDelay: 20,
    status: "DLQ",
  });
});
