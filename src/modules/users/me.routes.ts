import { Router } from "express";
import { prisma } from "../../lib/db.ts";
import { HttpError } from "../../lib/http-error.ts";
import { authOf, requireAuth } from "../../middlewares/require-auth.ts";
import { toPublicUser } from "../auth/auth.service.ts";

export const meRouter = Router();

/** The logged-in user's own profile. */
meRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: authOf(req).userId } });
  if (!user || user.deletedAt) throw new HttpError(401, "UNAUTHENTICATED", "Log in to continue.");
  if (user.blockedAt) throw new HttpError(403, "ACCOUNT_BLOCKED", "This account is blocked. Contact support to find out why.");
  res.json(toPublicUser(user));
});
