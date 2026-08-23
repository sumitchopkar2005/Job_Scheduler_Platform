import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import {
  createAccessToken,
  hashPassword,
  comparePassword,
} from "../utils/auth.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a symbol");
const credentialsSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    password: z.string().min(1).max(128),
  })
  .strict();
const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    password: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .strict()
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });
const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    passwordConfirmation: z.string(),
  })
  .strict()
  .refine((value) => value.newPassword === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });
const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function validationError(error) {
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: error.issues[0]?.message || "Invalid request",
    },
  };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  };
}

const attemptsByAddress = new Map();
const authRateLimit = (req, res, next) => {
  const now = Date.now();
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const key = email || req.socket.remoteAddress || "unknown";
  const attempts = (attemptsByAddress.get(key) || []).filter(
    (timestamp) => timestamp > now - 15 * 60 * 1000,
  );
  if (attempts.length >= 10)
    return res
      .status(429)
      .json({
        success: false,
        error: {
          code: "AUTH_RATE_LIMITED",
          message: "Too many attempts. Please try again later.",
        },
      });
  attempts.push(now);
  attemptsByAddress.set(key, attempts);
  return next();
};

router.post("/register", authRateLimit, async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json(validationError(parsed.error));

  try {
    const existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    if (existing) {
      return res
        .status(409)
        .json({
          success: false,
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "An account with this email already exists",
          },
        });
    }

    const {
      password,
      passwordConfirmation: _passwordConfirmation,
      ...profile
    } = parsed.data;
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { ...profile, passwordHash: await hashPassword(password) },
      });
      const organizationName = `${createdUser.name}'s Workspace`;
      await tx.organization.create({
        data: {
          name: organizationName,
          slug: `${slugify(organizationName)}-${createdUser.id.slice(-8)}`,
          members: { create: { userId: createdUser.id, role: "OWNER" } },
        },
      });
      return createdUser;
    });
    const token = createAccessToken(user);
    return res
      .status(201)
      .json({ success: true, data: { user: publicUser(user), token } });
  } catch (error) {
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      return res
        .status(409)
        .json({
          success: false,
          error: {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "An account with this email already exists",
          },
        });
    }
    return next(error);
  }
});

router.post("/login", authRateLimit, async (req, res, next) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json(validationError(parsed.error));

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
    });
    const valid =
      user && (await comparePassword(parsed.data.password, user.passwordHash));
    if (!valid) {
      return res
        .status(401)
        .json({
          success: false,
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
          },
        });
    }
    return res.json({
      success: true,
      data: { user: publicUser(user), token: createAccessToken(user) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      memberships: { include: { organization: true } },
    },
  });
  return res.json({ success: true, data: { user } });
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  const parsed = passwordChangeSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json(validationError(parsed.error));
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });
    if (
      !user ||
      !(await comparePassword(parsed.data.currentPassword, user.passwordHash))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error: {
            code: "INVALID_CURRENT_PASSWORD",
            message: "Current password is incorrect",
          },
        });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(parsed.data.newPassword),
        tokenVersion: { increment: 1 },
      },
    });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
