import { createHash, randomBytes } from "node:crypto";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { env } from "../../config/env.ts";
import type { UserRole } from "../../generated/prisma/enums.ts";
import { prisma } from "../../lib/db.ts";
import { HttpError } from "../../lib/http-error.ts";

const ISSUER = "rentxplay-api";
const AUDIENCE = "rentxplay";
const ROLES: readonly UserRole[] = ["user", "admin"];
const isUserRole = (value: unknown): value is UserRole => ROLES.some((role) => role === value);

export type DeviceInfo = { userAgent?: string | undefined; ip?: string | undefined };

/**
 * Short-lived JWT (15 minutes) that proves who is calling. Returned in the response body; clients
 * keep it in memory only. Its `exp` claim tells the client when to refresh.
 */
export async function signAccessToken(userId: string, role: UserRole): Promise<string> {
  const expiresAt = new Date(Date.now() + env.auth.accessTtlSeconds * 1000);
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(env.auth.accessSecret);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string; role: UserRole }> {
  try {
    const { payload } = await jwtVerify(token, env.auth.accessSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
    });
    const role = payload["role"];
    if (!payload.sub || !isUserRole(role)) throw new Error("bad claims");
    return { userId: payload.sub, role };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      throw new HttpError(401, "TOKEN_EXPIRED", "Your session expired. Refresh it or log in again.");
    }
    throw new HttpError(401, "UNAUTHENTICATED", "Log in to continue.");
  }
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Long-lived random token (30 days) for getting new access tokens. Only its hash is stored. */
export async function issueRefreshToken(userId: string, device: DeviceInfo = {}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + env.auth.refreshTtlDays * 86_400_000),
      userAgent: device.userAgent?.slice(0, 300),
      ip: device.ip,
    },
  });
  return token;
}

const invalid = () => new HttpError(401, "INVALID_REFRESH_TOKEN", "Your session ended. Log in again.");

/**
 * Swaps a refresh token for a new one (rotation). A token can be used once: if a used
 * token comes back, it was probably stolen, so every session of that user is ended.
 */
export async function rotateRefreshToken(token: string, device: DeviceInfo = {}) {
  const current = await prisma.refreshToken.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: { select: { id: true, role: true, blockedAt: true, deletedAt: true } } },
  });
  if (!current) throw invalid();

  if (current.revokedAt) {
    await revokeAllSessions(current.userId);
    throw invalid();
  }
  if (current.expiresAt <= new Date() || current.user.blockedAt || current.user.deletedAt) throw invalid();

  const nextToken = randomBytes(32).toString("base64url");
  const rotated = await prisma.$transaction(async (tx) => {
    const next = await tx.refreshToken.create({
      data: {
        userId: current.userId,
        tokenHash: hash(nextToken),
        expiresAt: new Date(Date.now() + env.auth.refreshTtlDays * 86_400_000),
        userAgent: device.userAgent?.slice(0, 300),
        ip: device.ip,
      },
    });
    // Conditional update: if two requests race with the same token, only one wins.
    const { count } = await tx.refreshToken.updateMany({
      where: { id: current.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy: next.id },
    });
    return count === 1;
  });
  if (!rotated) {
    await revokeAllSessions(current.userId);
    throw invalid();
  }

  return { refreshToken: nextToken, user: current.user };
}

export async function revokeRefreshToken(token: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hash(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}
