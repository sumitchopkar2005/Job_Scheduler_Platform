import test from "node:test";
import assert from "node:assert/strict";
import {
  executeHandler,
  JobCancelledError,
  JobTimeoutError,
} from "../src/handlers.js";

test("DELAY_TEST completes after its bounded duration", async () => {
  const started = Date.now();
  const result = await executeHandler(
    { name: "delay", handlerType: "DELAY_TEST" },
    { timeoutMs: 5000, isCancelled: async () => false },
  );
  assert.equal(result.handler, "DELAY_TEST");
  assert.ok(Date.now() - started >= 1000);
});

test("FAIL_TEST intentionally fails", async () => {
  await assert.rejects(
    () =>
      executeHandler(
        { name: "fail", handlerType: "FAIL_TEST" },
        { timeoutMs: 1000, isCancelled: async () => false },
      ),
    /FAIL_TEST requested failure/,
  );
});

test("controlled handlers honor cancellation and timeout", async () => {
  await assert.rejects(
    () =>
      executeHandler(
        { name: "delay", handlerType: "DELAY_TEST" },
        { timeoutMs: 1000, isCancelled: async () => true },
      ),
    JobCancelledError,
  );
  await assert.rejects(
    () =>
      executeHandler(
        { name: "delay", handlerType: "DELAY_TEST" },
        { timeoutMs: 10, isCancelled: async () => false },
      ),
    JobTimeoutError,
  );
});
