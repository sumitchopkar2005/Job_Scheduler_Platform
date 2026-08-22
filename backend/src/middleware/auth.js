import { verifyAccessToken } from "../utils/auth.js";
import { prisma } from "../db.js";

export async function requireAuth(req, res, next) {
  const header = req.get("authorization");
  const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header || "")?.[1];

  if (!token) {
    return res
      .status(401)
      .json({
        success: false,
        error: { code: "AUTH_REQUIRED", message: "Authentication is required" },
      });
  }

  try {
    const payload = verifyAccessToken(token);
    if (typeof payload.sub !== "string" || !Number.isInteger(payload.tv))
      throw new Error("Invalid token claims");
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, tokenVersion: true },
    });
    if (!user || user.tokenVersion !== payload.tv) {
      return res
        .status(401)
        .json({
          success: false,
          error: {
            code: "INVALID_TOKEN",
            message: "Authentication token is invalid",
          },
        });
    }
    req.user = { id: user.id, email: user.email, name: user.name };
    return next();
  } catch {
    return res
      .status(401)
      .json({
        success: false,
        error: {
          code: "INVALID_TOKEN",
          message: "Authentication token is invalid",
        },
      });
  }
}
