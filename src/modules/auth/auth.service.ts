import bcrypt from "bcryptjs";
import { env } from "../../config/env.ts";
import { Prisma, type User } from "../../generated/prisma/client.ts";
import { prisma } from "../../lib/db.ts";
import { HttpError } from "../../lib/http-error.ts";
import type { LoginInput, SignupInput } from "./auth.schemas.ts";
import { type DeviceInfo, issueRefreshToken, signAccessToken } from "./tokens.ts";

/** What the API returns about the logged-in user (signup, login, GET /me). Never the password hash. */
export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    phoneVerified: user.phoneVerifiedAt !== null,
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;

async function startSession(user: User, device: DeviceInfo) {
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken(user.id, user.role),
    issueRefreshToken(user.id, device),
  ]);
  return { user: toPublicUser(user), accessToken, refreshToken };
}

const emailTaken = () =>
  new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists. Log in instead.", {
    email: "An account with this email already exists. Log in instead.",
  });

export async function signup(input: SignupInput, device: DeviceInfo) {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existing) throw emailTaken();

  const passwordHash = await bcrypt.hash(input.password, env.auth.bcryptCost);
  try {
    const user = await prisma.user.create({ data: { email: input.email, passwordHash } });
    return await startSession(user, device);
  } catch (error) {
    // Two sign-ups racing for the same email: the unique index decides.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw emailTaken();
    throw error;
  }
}

const NO_MATCH = "That email and password don't match.";

// Compared against when the email is unknown, at the same cost as real hashes, so a wrong email
// takes as long as a wrong password and the response never reveals which emails have accounts.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-1", env.auth.bcryptCost);

export async function login(input: LoginInput, device: DeviceInfo) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || user.deletedAt) {
    throw new HttpError(401, "INVALID_CREDENTIALS", NO_MATCH, { password: NO_MATCH });
  }
  if (user.blockedAt) {
    throw new HttpError(403, "ACCOUNT_BLOCKED", "This account is blocked. Contact support to find out why.");
  }
  return startSession(user, device);
}
