import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
const memberFilter = (userId) => ({
  project: { organization: { members: { some: { userId } } } },
});

router.get("/workers", async (req, res, next) => {
  try {
    await prisma.worker.updateMany({
      where: {
        status: { not: "OFFLINE" },
        lastHeartbeatAt: { lt: new Date(Date.now() - 15000) },
      },
      data: { status: "OFFLINE" },
    });
    const workers = await prisma.worker.findMany({
      where: { executions: { some: { job: memberFilter(req.user.id) } } },
      orderBy: { lastHeartbeatAt: "desc" },
    });
    return res.json({ success: true, data: { workers } });
  } catch (error) {
    return next(error);
  }
});

router.get("/workers/:id", async (req, res, next) => {
  try {
    const worker = await prisma.worker.findFirst({
      where: {
        id: req.params.id,
        executions: { some: { job: memberFilter(req.user.id) } },
      },
      include: {
        heartbeats: { orderBy: { recordedAt: "desc" }, take: 50 },
        executions: {
          where: { job: memberFilter(req.user.id) },
          orderBy: { startedAt: "desc" },
          take: 50,
        },
      },
    });
    if (!worker)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "WORKER_NOT_FOUND", message: "Worker does not exist" },
        });
    return res.json({ success: true, data: { worker } });
  } catch (error) {
    return next(error);
  }
});

router.get("/dlq", async (req, res, next) => {
  try {
    const entries = await prisma.deadLetterQueueEntry.findMany({
      where: { job: memberFilter(req.user.id) },
      include: { job: true, queue: true },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: { entries } });
  } catch (error) {
    return next(error);
  }
});

router.get("/dlq/:id", async (req, res, next) => {
  try {
    const entry = await prisma.deadLetterQueueEntry.findFirst({
      where: { id: req.params.id, job: memberFilter(req.user.id) },
      include: {
        job: { include: { executions: true, logs: true } },
        queue: true,
        worker: true,
      },
    });
    if (!entry)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "DLQ_NOT_FOUND", message: "DLQ entry does not exist" },
        });
    return res.json({ success: true, data: { entry } });
  } catch (error) {
    return next(error);
  }
});

router.post("/dlq/:id/retry", async (req, res, next) => {
  try {
    const entry = await prisma.deadLetterQueueEntry.findFirst({
      where: { id: req.params.id, job: memberFilter(req.user.id) },
    });
    if (!entry)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "DLQ_NOT_FOUND", message: "DLQ entry does not exist" },
        });
    const job = await prisma.$transaction(async (tx) => {
      const updated = await tx.job.update({
        where: { id: entry.jobId },
        data: {
          status: "QUEUED",
          attempts: 0,
          lastError: null,
          scheduledAt: new Date(),
          completedAt: null,
        },
      });
      await tx.deadLetterQueueEntry.update({
        where: { id: entry.id },
        data: { retriedAt: new Date() },
      });
      return updated;
    });
    return res.json({ success: true, data: { job } });
  } catch (error) {
    return next(error);
  }
});

router.get("/metrics", async (req, res, next) => {
  try {
    const where = memberFilter(req.user.id);
    const [totalJobs, grouped, executions, activeWorkers, offlineWorkers] =
      await Promise.all([
        prisma.job.count({ where }),
        prisma.job.groupBy({ by: ["status"], where, _count: { _all: true } }),
        prisma.jobExecution.aggregate({
          where: { job: where, status: "COMPLETED" },
          _avg: { durationMs: true },
          _count: { _all: true },
        }),
        prisma.worker.count({
          where: {
            status: { in: ["ONLINE", "BUSY"] },
            executions: { some: { job: where } },
          },
        }),
        prisma.worker.count({
          where: { status: "OFFLINE", executions: { some: { job: where } } },
        }),
      ]);
    const statusCounts = Object.fromEntries(
      grouped.map((item) => [item.status, item._count._all]),
    );
    const completed = statusCounts.COMPLETED || 0;
    return res.json({
      success: true,
      data: {
        totalJobs,
        queuedJobs: statusCounts.QUEUED || 0,
        scheduledJobs: statusCounts.SCHEDULED || 0,
        runningJobs: (statusCounts.RUNNING || 0) + (statusCounts.CLAIMED || 0),
        completedJobs: completed,
        failedJobs: statusCounts.FAILED || 0,
        dlqJobs: statusCounts.DLQ || 0,
        averageExecutionTimeMs: executions._avg.durationMs || 0,
        successRate: totalJobs ? completed / totalJobs : 0,
        activeWorkers,
        offlineWorkers,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
