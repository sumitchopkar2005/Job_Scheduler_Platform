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
import { CronExpressionParser } from "cron-parser";

let shuttingDown = false;
let currentJobId = null;
const activeJobs = new Set();
const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function scheduleNext(job, currentDate) {
  const nextRunAt = CronExpressionParser.parse(job.cronExpression, {
    currentDate,
  })
    .next()
    .toDate();
  await prisma.job.create({
    data: {
      projectId: job.projectId,
      queueId: job.queueId,
      name: job.name,
      type: "RECURRING",
      handlerType: job.handlerType,
      payload: {},
      priority: job.priority,
      status: "SCHEDULED",
      scheduledAt: nextRunAt,
      cronExpression: job.cronExpression,
      maxAttempts: job.maxAttempts,
      scheduledJob: { create: { cron: job.cronExpression, nextRunAt } },
    },
  });
}

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
    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: "COMPLETED",
          completedAt,
          claimedBy: null,
          claimedAt: null,
        },
      }),
      prisma.jobExecution.update({
        where: { id: execution.id },
        data: {
          status: "COMPLETED",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
        },
      }),
      prisma.jobLog.create({
        data: {
          jobId: job.id,
          workerId: config.workerId,
          message: "Job completed",
          metadata: result,
        },
      }),
      prisma.worker.update({
        where: { id: config.workerId },
        data: { jobsProcessed: { increment: 1 }, currentJobId: null },
      }),
    ]);
    if (job.type === "RECURRING" && job.cronExpression)
      await scheduleNext(job, completedAt);
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
        prisma.worker.update({
          where: { id: config.workerId },
          data: { currentJobId: null },
        }),
      ]);
      return;
    }
    const queue = await prisma.queue.findUnique({
      where: { id: job.queueId },
      include: { retryPolicy: true },
    });
    const decision = retryDecision(job, queue);
    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: decision.status,
          lastError: error.message,
          claimedBy: null,
          claimedAt: null,
          scheduledAt: decision.canRetry
            ? new Date(Date.now() + decision.retryDelay * 1000)
            : job.scheduledAt,
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
          level: "ERROR",
          message: decision.canRetry ? "Retry scheduled" : "Job moved to DLQ",
          metadata: { error: error.message, retryDelay: decision.retryDelay },
        },
      }),
      ...(decision.canRetry
        ? []
        : [
            prisma.deadLetterQueueEntry.upsert({
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
            }),
          ]),
      prisma.worker.update({
        where: { id: config.workerId },
        data: { currentJobId: null },
      }),
    ]);
  }
}

async function poll() {
  if (shuttingDown) return;
  await promoteDueRetries();
  await promoteDueScheduledJobs();
  await recoverStaleJobs(config.staleAfterMs);
  const job = await claimNextJob(config.workerId);
  if (!job) return;
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
      console.error("Worker registration unavailable:", error.message);
      await sleep(2000);
    }
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: draining ${activeJobs.size} active jobs`);
  while (activeJobs.size > 0) await sleep(100);
  try {
    await prisma.worker.update({
      where: { id: config.workerId },
      data: { status: "OFFLINE", currentJobId: null },
    });
  } catch (error) {
    console.error("Unable to mark worker offline:", error.message);
  }
  await prisma.$disconnect();
  process.exit(0);
}

await connectWithRetry();
const stopHeartbeat = startHeartbeat(() => currentJobId);
const poller = setInterval(
  () => poll().catch((error) => console.error("Polling failed safely", error)),
  config.pollIntervalMs,
);
const stopDispatchWakeup = await startDispatchWakeup(() =>
  poll().catch((error) =>
    console.error("Dispatch wake-up failed safely", error),
  ),
);
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("exit", () => {
  clearInterval(poller);
  stopHeartbeat();
  stopDispatchWakeup();
});
console.log(`Worker ${config.workerId} is ready`);
