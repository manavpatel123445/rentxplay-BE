import type { Request, RequestHandler } from "express";
import { HttpError } from "../lib/http-error.ts";
import { verifyAccessToken } from "../modules/auth/tokens.ts";

const unauthenticated = () => new HttpError(401, "UNAUTHENTICATED", "Log in to continue.");

/** Lets the request through only with a valid `Authorization: Bearer <accessToken>`; sets `req.auth`. */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const [scheme, token] = (req.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    next(unauthenticated());
    return;
  }
  req.auth = await verifyAccessToken(token);
  next();
};

/** The caller set by requireAuth. Throws 401 if a route forgot to use requireAuth. */
export function authOf(req: Request): NonNullable<Request["auth"]> {
  if (!req.auth) throw unauthenticated();
  return req.auth;
}
