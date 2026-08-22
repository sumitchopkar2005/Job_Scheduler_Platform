export class JobCancelledError extends Error {
  constructor() {
    super("Job was cancelled");
    this.code = "JOB_CANCELLED";
  }
}

export class JobTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`Job timed out after ${timeoutMs}ms`);
    this.code = "JOB_TIMEOUT";
  }
}

const CONTROLLED_HANDLERS = [
  "DELAY_TEST",
  "FAIL_TEST",
  "PROCESS_DATA",
  "SEND_EMAIL",
  "GENERATE_REPORT",
];
const HANDLER_DURATIONS_MS = {
  DELAY_TEST: 1500,
  FAIL_TEST: 0,
  PROCESS_DATA: 300,
  SEND_EMAIL: 200,
  GENERATE_REPORT: 600,
};

export async function executeHandler(job, { isCancelled, timeoutMs }) {
  const type = String(job.handlerType || "").toUpperCase();
  if (!CONTROLLED_HANDLERS.includes(type))
    throw new Error(`Unsupported controlled handler: ${type || "UNSET"}`);
  const durationMs = HANDLER_DURATIONS_MS[type] || 0;
  const deadline = Date.now() + timeoutMs;
  const totalWait = durationMs;
  let elapsed = 0;

  while (elapsed < totalWait) {
    if (await isCancelled()) throw new JobCancelledError();
    if (Date.now() >= deadline) throw new JobTimeoutError(timeoutMs);
    const step = Math.min(250, totalWait - elapsed);
    await new Promise((resolve) => setTimeout(resolve, step));
    elapsed += step;
  }

  if (await isCancelled()) throw new JobCancelledError();
  if (Date.now() >= deadline) throw new JobTimeoutError(timeoutMs);
  if (type === "FAIL_TEST") throw new Error("FAIL_TEST requested failure");
  return { handler: type, simulated: true };
}
