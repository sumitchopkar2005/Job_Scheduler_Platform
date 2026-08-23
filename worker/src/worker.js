import { config } from "./config.js";
import { prisma, claimNextJob } from "./claim.js";
import { registerWorker, startHeartbeat } from "./heartbeat.js";
import { startDispatchWakeup } from "./dispatch.js";
import { executeHandler, JobCancelledError } from "./handlers.js";
import {
  recoverStaleJobs,
  promoteDueRetries,
  promoteDueScheduledJobs,
} from "./recovery.js";
import { retryDecision } from "./retry.js";
import { scheduleNextIfRecurring } from "./scheduling.js";
import { completeClaimedJob } from "./completion.js";

let shuttingDown = false;
let currentJobId = null;
const activeJobs = new Set();
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function runJob(job) {
  const startedAt = new Date();
  const execution = await prisma.jobExecution.create({
    data: {
      jobId: job.id,
      workerId: config.workerId,
      attemptNumber: job.attempts,
      startedAt,
    },
  });
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "RUNNING", startedAt },
  });
  try {
    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        workerId: config.workerId,
        message: "Job started",
        metadata: { attempt: job.attempts },
      },
    });
    const result = await executeHandler(job, {
      timeoutMs: config.defaultTimeoutMs,
      isCancelled: async () =>
        (
          await prisma.job.findUnique({
            where: { id: job.id },
            select: { status: true },
          })
        )?.status === "CANCELLED",
    });
    const completedAt = new Date();
    const completed = await completeClaimedJob(prisma, {
      jobId: job.id,
      executionId: execution.id,
      workerId: config.workerId,
      completedAt,
      startedAt,
      result,
    });
    if (completed) {
      console.log(`[WORKER] Job ${job.id} completed`);
      await scheduleNextIfRecurring(prisma, job, completedAt);
    }
  } catch (error) {
    const completedAt = new Date();
    if (error instanceof JobCancelledError) {
      await prisma.$transaction([
        prisma.job.update({
          where: { id: job.id },
          data: {
            status: "CANCELLED",
            completedAt,
            claimedBy: null,
            claimedAt: null,
          },
        }),
        prisma.jobExecution.update({
          where: { id: execution.id },
          data: {
            status: "FAILED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            error: error.message,
          },
        }),
        prisma.jobLog.create({
          data: {
            jobId: job.id,
            workerId: config.workerId,
            level: "WARN",
            message: "Job cancelled",
          },
        }),
      ]);
      return;
    }
    const queue = await prisma.queue.findUnique({
      where: { id: job.queueId },
      include: { retryPolicy: true },
    });
    const decision = retryDecision(job, queue);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.job.updateMany({
        where: {
          id: job.id,
          status: "RUNNING",
          claimedBy: config.workerId,
        },
        data: {
          status: decision.status,
          lastError: error.message,
          claimedBy: null,
          claimedAt: null,
          scheduledAt: decision.canRetry
            ? new Date(Date.now() + decision.retryDelay * 1000)
          : job.scheduledAt,
        },
      });
      if (updated.count !== 1) {
        await tx.jobExecution.updateMany({
          where: { id: execution.id, status: "RUNNING" },
          data: {
            status: "FAILED",
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
            error: "Job lease was lost before failure processing",
          },
        });
        return;
      }

      await tx.jobExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          error: error.message,
        },
      });
      await tx.jobLog.create({
        data: {
          jobId: job.id,
          workerId: config.workerId,
          level: "ERROR",
          message: decision.canRetry ? "Retry scheduled" : "Job moved to DLQ",
          metadata: { error: error.message, retryDelay: decision.retryDelay },
        },
      });
      if (!decision.canRetry) {
        await tx.deadLetterQueueEntry.upsert({
          where: { jobId: job.id },
          create: {
            jobId: job.id,
            queueId: job.queueId,
            failureReason: "Maximum attempts exceeded",
            attempts: job.attempts,
            lastError: error.message,
            workerId: config.workerId,
          },
          update: {
            attempts: job.attempts,
            lastError: error.message,
            workerId: config.workerId,
          },
        });
      }
      console.log(
        `[WORKER] Job ${job.id} ${decision.canRetry ? "retrying" : "→ DLQ"}`,
      );
    });
  }
}

async function poll() {
  if (shuttingDown) return;
  await promoteDueRetries();
  await promoteDueScheduledJobs();
  await recoverStaleJobs(config.staleAfterMs);
  if (shuttingDown) return;
  const job = await claimNextJob(config.workerId);
  if (!job) return;
  console.log(`[WORKER] Job ${job.id} claimed`);
  activeJobs.add(job.id);
  currentJobId = job.id;
  runJob(job)
    .catch((error) => console.error("Job execution failed safely", error))
    .finally(() => {
      activeJobs.delete(job.id);
      currentJobId = activeJobs.values().next().value || null;
    });
}

async function connectWithRetry() {
  while (!shuttingDown) {
    try {
      await registerWorker();
      return;
    } catch (error) {
      console.error(`[ERROR] WORKER registration failed | ${error.message}`);
      await sleep(2000);
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[WORKER] ${signal}: draining ${activeJobs.size} jobs`);
  while (activeJobs.size > 0) await sleep(100);
  try {
    await prisma.worker.update({
      where: { id: config.workerId },
      data: { status: "OFFLINE", currentJobId: null },
    });
  } catch (error) {
    console.error(`[ERROR] WORKER shutdown failed | ${error.message}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

await connectWithRetry();
const stopHeartbeat = startHeartbeat(() => [...activeJobs]);
const poller = setInterval(
  () =>
    poll().catch((error) =>
      console.error(`[ERROR] WORKER polling failed | ${error.message}`),
    ),
  config.pollIntervalMs,
);
const stopDispatchWakeup = await startDispatchWakeup(() =>
  poll().catch((error) =>
    console.error(`[ERROR] WORKER wake-up failed | ${error.message}`),
  ),
);
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("exit", () => {
  clearInterval(poller);
  stopHeartbeat();
  stopDispatchWakeup();
});
console.log("[WORKER] Started");
