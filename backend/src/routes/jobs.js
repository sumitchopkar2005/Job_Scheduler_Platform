import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { assertTransition } from "../services/jobState.js";
import { publishJobEvent } from "../redis.js";

const router = Router();
const handlerTypeSchema = z.enum([
  "DELAY_TEST",
  "FAIL_TEST",
  "PROCESS_DATA",
  "SEND_EMAIL",
  "GENERATE_REPORT",
]);
const jobSchema = z
  .object({
    projectId: z.string().min(1),
    queueId: z.string().min(1),
    name: z.string().trim().min(1).max(160),
    type: z
      .enum(["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING", "BATCH"])
      .default("IMMEDIATE"),
    handlerType: handlerTypeSchema,
    priority: z.number().int().min(-100).max(100).default(0),
    scheduledAt: z.coerce.date().optional(),
    delaySeconds: z.number().int().min(1).max(31536000).optional(),
    cronExpression: z.string().trim().max(120).optional(),
  })
  .superRefine((value, context) => {
    if (value.type === "DELAYED" && !value.delaySeconds)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delaySeconds"],
        message: "Delayed jobs require delaySeconds",
      });
    if (value.type !== "DELAYED" && value.delaySeconds)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["delaySeconds"],
        message: "delaySeconds is only valid for delayed jobs",
      });
    if (["SCHEDULED", "RECURRING"].includes(value.type) && !value.scheduledAt)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message: "This schedule type requires scheduledAt",
      });
    if (
      !["SCHEDULED", "RECURRING"].includes(value.type) &&
      value.scheduledAt &&
      value.type !== "DELAYED"
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scheduledAt"],
        message:
          "scheduledAt is only valid for delayed, scheduled, or recurring jobs",
      });
    if (value.type === "RECURRING" && !value.cronExpression)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cronExpression"],
        message: "Recurring jobs require a cron expression",
      });
    if (value.type !== "RECURRING" && value.cronExpression)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cronExpression"],
        message: "Cron expressions are only valid for recurring jobs",
      });
  });
const batchSchema = z.object({
  projectId: z.string().min(1),
  queueId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  jobs: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        payload: z.record(z.any()).default({}),
        priority: z.number().int().min(-100).max(100).default(0),
        scheduledAt: z.coerce.date().optional(),
        maxAttempts: z.number().int().min(1).max(20).default(3),
      }),
    )
    .min(1)
    .max(1000),
});

router.use(requireAuth);

async function accessibleQueue(queueId, projectId, userId) {
  return prisma.queue.findFirst({
    where: {
      id: queueId,
      projectId,
      project: { organization: { members: { some: { userId } } } },
    },
    include: { retryPolicy: true },
  });
}

router.get("/", async (req, res, next) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 25)));
  try {
    const where = {
      project: { organization: { members: { some: { userId: req.user.id } } } },
      ...(req.query.status && { status: String(req.query.status) }),
    };
    const [jobs, total] = await prisma.$transaction([
      prisma.job.findMany({
        where,
        include: { queue: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);
    return res.json({
      success: true,
      data: {
        jobs,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const parsed = jobSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message,
        },
      });
  try {
    const queue = await accessibleQueue(
      parsed.data.queueId,
      parsed.data.projectId,
      req.user.id,
    );
    if (!queue)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
        });
    const scheduledAt =
      parsed.data.type === "DELAYED"
        ? new Date(Date.now() + parsed.data.delaySeconds * 1000)
        : parsed.data.scheduledAt || new Date();
    const status = scheduledAt > new Date() ? "SCHEDULED" : "QUEUED";
    const { delaySeconds, ...jobData } = parsed.data;
    const job = await prisma.job.create({
      data: {
        ...jobData,
        payload: {},
        scheduledAt,
        status,
        maxAttempts: queue.retryPolicy?.maximumAttempts || 3,
        ...(parsed.data.type === "RECURRING" && parsed.data.cronExpression
          ? {
              scheduledJob: {
                create: {
                  cron: parsed.data.cronExpression,
                  nextRunAt: scheduledAt,
                },
              },
            }
          : {}),
      },
    });
    await publishJobEvent("job-created", {
      jobId: job.id,
      queueId: job.queueId,
    });
    return res.status(201).json({ success: true, data: { job } });
  } catch (error) {
    return next(error);
  }
});

router.post("/batch", async (req, res, next) => {
  const parsed = batchSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message,
        },
      });
  try {
    const queue = await accessibleQueue(
      parsed.data.queueId,
      parsed.data.projectId,
      req.user.id,
    );
    if (!queue)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
        });
    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.jobBatch.create({
        data: {
          projectId: parsed.data.projectId,
          name: parsed.data.name,
          totalJobs: parsed.data.jobs.length,
        },
      });
      await tx.job.createMany({
        data: parsed.data.jobs.map((item) => {
          const scheduledAt = item.scheduledAt || new Date();
          return {
            ...item,
            projectId: parsed.data.projectId,
            queueId: parsed.data.queueId,
            batchId: createdBatch.id,
            type: "BATCH",
            status: scheduledAt > new Date() ? "SCHEDULED" : "QUEUED",
            scheduledAt,
          };
        }),
      });
      return tx.jobBatch.findUnique({
        where: { id: createdBatch.id },
        include: { jobs: true },
      });
    });
    await publishJobEvent("batch-created", {
      batchId: batch.id,
      queueId: parsed.data.queueId,
    });
    return res.status(201).json({ success: true, data: { batch } });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/cancel", async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        project: {
          organization: { members: { some: { userId: req.user.id } } },
        },
      },
    });
    if (!job)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "JOB_NOT_FOUND", message: "Job does not exist" },
        });
    assertTransition(job.status, "CANCELLED");
    const cancelled = await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          claimedBy: null,
          claimedAt: null,
        },
      }),
      prisma.jobLog.create({
        data: {
          jobId: job.id,
          message: "Job cancelled by user",
          metadata: { previousStatus: job.status },
        },
      }),
    ]);
    return res.json({ success: true, data: { job: cancelled[0] } });
  } catch (error) {
    return next(error);
  }
});

router.get("/batches/:id", async (req, res, next) => {
  try {
    const batch = await prisma.jobBatch.findFirst({
      where: {
        id: req.params.id,
        project: {
          organization: { members: { some: { userId: req.user.id } } },
        },
      },
      include: {
        jobs: {
          include: { queue: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!batch)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "BATCH_NOT_FOUND", message: "Batch does not exist" },
        });
    const statusCounts = batch.jobs.reduce(
      (counts, job) => ({
        ...counts,
        [job.status]: (counts[job.status] || 0) + 1,
      }),
      {},
    );
    return res.json({ success: true, data: { batch, statusCounts } });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        project: {
          organization: { members: { some: { userId: req.user.id } } },
        },
      },
      include: {
        queue: true,
        executions: { orderBy: { startedAt: "desc" } },
        logs: { orderBy: { createdAt: "desc" }, take: 100 },
        dlqEntry: true,
      },
    });
    if (!job)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "JOB_NOT_FOUND", message: "Job does not exist" },
        });
    return res.json({ success: true, data: { job } });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/retry", async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({
      where: {
        id: req.params.id,
        status: "DLQ",
        project: {
          organization: { members: { some: { userId: req.user.id } } },
        },
      },
    });
    if (!job)
      return res
        .status(404)
        .json({
          success: false,
          error: {
            code: "DLQ_JOB_NOT_FOUND",
            message: "Dead letter job does not exist",
          },
        });
    assertTransition(job.status, "QUEUED");
    const retried = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id: job.id },
        data: {
          status: "QUEUED",
          attempts: 0,
          lastError: null,
          scheduledAt: new Date(),
          completedAt: null,
        },
      });
      await tx.deadLetterQueueEntry.update({
        where: { jobId: job.id },
        data: { retriedAt: new Date() },
      });
      return updated;
    });
    return res.json({ success: true, data: { job: retried } });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/executions", async (req, res, next) => {
  try {
    const executions = await prisma.jobExecution.findMany({
      where: {
        job: {
          id: req.params.id,
          project: {
            organization: { members: { some: { userId: req.user.id } } },
          },
        },
      },
      orderBy: { startedAt: "desc" },
    });
    return res.json({ success: true, data: { executions } });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/logs", async (req, res, next) => {
  try {
    const logs = await prisma.jobLog.findMany({
      where: {
        job: {
          id: req.params.id,
          project: {
            organization: { members: { some: { userId: req.user.id } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: { logs } });
  } catch (error) {
    return next(error);
  }
});

export default router;
