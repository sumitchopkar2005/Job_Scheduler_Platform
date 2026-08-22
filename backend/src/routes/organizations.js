import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOrganizationMember } from "../middleware/access.js";

const router = Router();
const organizationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});
const projectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
});

const errorResponse = (res, error) =>
  res
    .status(400)
    .json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: error.issues[0]?.message || "Invalid request",
      },
    });
const slugify = (name) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${Date.now().toString(36)}`;

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const organizations = await prisma.organization.findMany({
      where: { members: { some: { userId: req.user.id } } },
      include: { _count: { select: { projects: true, members: true } } },
      orderBy: { createdAt: "desc" },
    });
    return res.json({ success: true, data: { organizations } });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  const parsed = organizationSchema.safeParse(req.body);
  if (!parsed.success) return errorResponse(res, parsed.error);
  try {
    const organization = await prisma.organization.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        slug: slugify(parsed.data.name),
        members: { create: { userId: req.user.id, role: "OWNER" } },
      },
      include: { _count: { select: { projects: true, members: true } } },
    });
    return res.status(201).json({ success: true, data: { organization } });
  } catch (error) {
    return next(error);
  }
});

router.patch(
  "/:organizationId",
  requireOrganizationMember,
  async (req, res, next) => {
    const parsed = organizationSchema.partial().safeParse(req.body);
    if (!parsed.success) return errorResponse(res, parsed.error);
    try {
      const organization = await prisma.organization.update({
        where: { id: req.params.organizationId },
        data: parsed.data,
        include: { _count: { select: { projects: true, members: true } } },
      });
      return res.json({ success: true, data: { organization } });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  "/:organizationId",
  requireOrganizationMember,
  async (req, res, next) => {
    try {
      if (req.membership.role !== "OWNER")
        return res
          .status(403)
          .json({
            success: false,
            error: {
              code: "OWNER_REQUIRED",
              message: "Only organization owners can delete an organization",
            },
          });
      await prisma.organization.delete({
        where: { id: req.params.organizationId },
      });
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:organizationId",
  requireOrganizationMember,
  async (req, res, next) => {
    try {
      const organization = await prisma.organization.findUnique({
        where: { id: req.params.organizationId },
        include: {
          projects: {
            include: { _count: { select: { queues: true, jobs: true } } },
          },
        },
      });
      if (!organization)
        return res
          .status(404)
          .json({
            success: false,
            error: {
              code: "ORGANIZATION_NOT_FOUND",
              message: "Organization does not exist",
            },
          });
      return res.json({ success: true, data: { organization } });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:organizationId/projects",
  requireOrganizationMember,
  async (req, res, next) => {
    try {
      const projects = await prisma.project.findMany({
        where: { organizationId: req.params.organizationId },
        orderBy: { createdAt: "desc" },
      });
      return res.json({ success: true, data: { projects } });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/:organizationId/projects",
  requireOrganizationMember,
  async (req, res, next) => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) return errorResponse(res, parsed.error);
    try {
      const project = await prisma.project.create({
        data: { organizationId: req.params.organizationId, ...parsed.data },
      });
      return res.status(201).json({ success: true, data: { project } });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
