import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { findProjectForUser } from "../middleware/access.js";

const router = Router();
const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});
const createProjectSchema = projectSchema.extend({
  organizationId: z.string().min(1),
});

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const projects = await prisma.project.findMany({
      where: { organization: { members: { some: { userId: req.user.id } } } },
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { queues: true, jobs: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return res.json({ success: true, data: { projects } });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const parsed = createProjectSchema.safeParse(req.body);
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
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: req.user.id,
          organizationId: parsed.data.organizationId,
        },
      },
    });
    if (!membership)
      return res
        .status(404)
        .json({
          success: false,
          error: {
            code: "ORGANIZATION_NOT_FOUND",
            message: "Organization does not exist",
          },
        });
    const project = await prisma.project.create({
      data: parsed.data,
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { queues: true, jobs: true } },
      },
    });
    return res.status(201).json({ success: true, data: { project } });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const project = await findProjectForUser(req.params.id, req.user.id);
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
    return res.json({ success: true, data: { project } });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id", async (req, res, next) => {
  const parsed = projectSchema.partial().safeParse(req.body);
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
    const project = await findProjectForUser(req.params.id, req.user.id);
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
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: parsed.data,
    });
    return res.json({ success: true, data: { project: updated } });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const project = await findProjectForUser(req.params.id, req.user.id);
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
    await prisma.project.delete({ where: { id: project.id } });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
