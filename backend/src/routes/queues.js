import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { findProjectForUser } from "../middleware/access.js";

const router = Router();
const queueSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  priority: z.number().int().min(-100).max(100).default(0),
  concurrency: z.number().int().min(1).max(100).default(1),
  strategy: z.enum(["FIXED", "LINEAR", "EXPONENTIAL"]).default("EXPONENTIAL"),
  maximumAttempts: z.number().int().min(1).max(20).default(3),
  initialDelaySeconds: z.number().int().min(1).max(86400).default(10),
  maximumDelaySeconds: z.number().int().min(1).max(604800).default(3600),
});

router.use(requireAuth);

async function accessibleQueue(id, userId) {
  return prisma.queue.findFirst({
    where: { id, project: { organization: { members: { some: { userId } } } } },
  });
}

router.get("/", async (req, res, next) => {
  try {
    const queues = await prisma.queue.findMany({
      where: {
        ...(req.query.projectId && { projectId: String(req.query.projectId) }),
        project: {
          organization: { members: { some: { userId: req.user.id } } },
        },
      },
      include: {
        retryPolicy: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { priority: "desc" },
    });
    return res.json({ success: true, data: { queues } });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const parsed = queueSchema.safeParse(req.body);
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
    const project = await findProjectForUser(
      parsed.data.projectId,
      req.user.id,
    );
    if (!project)
      return res
        .status(404)
        .json({
          success: false,
          error: {
            code: "PROJECT_NOT_FOUND",
            message: "Project does not exist",
          },
        });
    const {
      strategy,
      maximumAttempts,
      initialDelaySeconds,
      maximumDelaySeconds,
      ...queueData
    } = parsed.data;
    const queue = await prisma.queue.create({
      data: {
        ...queueData,
        retryPolicy: {
          create: {
            strategy,
            maximumAttempts,
            initialDelaySeconds,
            maximumDelaySeconds,
          },
        },
      },
      include: { retryPolicy: true },
    });
    return res.status(201).json({ success: true, data: { queue } });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const queue = await accessibleQueue(req.params.id, req.user.id);
    if (!queue)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
        });
    const detailed = await prisma.queue.findUnique({
      where: { id: queue.id },
      include: {
        retryPolicy: true,
        project: { select: { id: true, name: true } },
        _count: { select: { jobs: true } },
        jobs: {
          where: { queueId: queue.id },
          orderBy: { createdAt: "desc" },
          include: {
            executions: {
              orderBy: { startedAt: "desc" },
            },
          },
        },
      },
    });
    return res.json({ success: true, data: { queue: detailed } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  const parsed = queueSchema
    .omit({ projectId: true })
    .partial()
    .safeParse(req.body);
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
    const queue = await accessibleQueue(req.params.id, req.user.id);
    if (!queue)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
        });
    const {
      strategy,
      maximumAttempts,
      initialDelaySeconds,
      maximumDelaySeconds,
      ...queueData
    } = parsed.data;
    const retryData = Object.fromEntries(
      Object.entries({
        strategy,
        maximumAttempts,
        initialDelaySeconds,
        maximumDelaySeconds,
      }).filter(([, value]) => value !== undefined),
    );
    const updated = await prisma.queue.update({
      where: { id: queue.id },
      data: {
        ...queueData,
        ...(Object.keys(retryData).length > 0
          ? {
              retryPolicy: {
                upsert: {
                  create: {
                    strategy: strategy || "EXPONENTIAL",
                    maximumAttempts: maximumAttempts || 3,
                    initialDelaySeconds: initialDelaySeconds || 10,
                    maximumDelaySeconds: maximumDelaySeconds || 3600,
                  },
                  update: retryData,
                },
              },
            }
          : {}),
      },
      include: { retryPolicy: true },
    });
    return res.json({ success: true, data: { queue: updated } });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const queue = await accessibleQueue(req.params.id, req.user.id);
    if (!queue)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
        });
    await prisma.queue.delete({ where: { id: queue.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

for (const [path, paused] of [
  ["pause", true],
  ["resume", false],
]) {
  router.post("/:id/" + path, async (req, res, next) => {
    try {
      const queue = await accessibleQueue(req.params.id, req.user.id);
      if (!queue)
        return res
          .status(404)
          .json({
            success: false,
            error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
          });
      const updated = await prisma.queue.update({
        where: { id: queue.id },
        data: { paused },
      });
      return res.json({ success: true, data: { queue: updated } });
    } catch (error) {
      return next(error);
    }
  });
}

router.get("/:id/stats", async (req, res, next) => {
  try {
    const queue = await accessibleQueue(req.params.id, req.user.id);
    if (!queue)
      return res
        .status(404)
        .json({
          success: false,
          error: { code: "QUEUE_NOT_FOUND", message: "Queue does not exist" },
        });
    const grouped = await prisma.job.groupBy({
      by: ["status"],
      where: { queueId: queue.id },
      _count: { _all: true },
    });
    return res.json({
      success: true,
      data: { queueId: queue.id, stats: grouped },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
