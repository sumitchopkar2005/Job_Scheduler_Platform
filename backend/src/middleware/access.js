import { prisma } from "../db.js";

export async function requireOrganizationMember(req, res, next) {
  const organizationId = req.params.organizationId || req.body.organizationId;
  if (!organizationId) {
    return res
      .status(400)
      .json({
        success: false,
        error: {
          code: "ORGANIZATION_REQUIRED",
          message: "Organization is required",
        },
      });
  }

  const membership = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId: req.user.id, organizationId } },
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
  req.membership = membership;
  return next();
}

export async function findProjectForUser(projectId, userId) {
  return prisma.project.findFirst({
    where: { id: projectId, organization: { members: { some: { userId } } } },
  });
}
