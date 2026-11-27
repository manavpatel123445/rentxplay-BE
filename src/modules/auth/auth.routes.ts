import { type CookieOptions, type Request, type Response, Router } from "express";
import { env } from "../../config/env.ts";
import { HttpError } from "../../lib/http-error.ts";
import { bodyEmail, readCookie } from "../../lib/request.ts";
import { parseBody } from "../../lib/validate.ts";
import { rateLimit } from "../../middlewares/rate-limit.ts";
import { loginSchema, refreshSchema, signupSchema } from "./auth.schemas.ts";
import { login, type PublicUser, signup } from "./auth.service.ts";
import { revokeRefreshToken, rotateRefreshToken, signAccessToken } from "./tokens.ts";

export const authRouter = Router();

export const REFRESH_COOKIE = "rx_refresh";

/**
 * httpOnly (JavaScript can't read it), Secure (HTTPS only; browsers treat http://localhost as
 * secure, so local dev still works), SameSite=Lax (not sent on cross-site POSTs).
 * Path is the auth routes under the API's /api/v1 prefix, so the cookie never goes anywhere else.
 */
const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/v1/auth",
};

const device = (req: Request) => ({ userAgent: req.get("user-agent"), ip: req.ip });

type Session = { user?: PublicUser; accessToken: string; refreshToken: string };

/** Web: refresh token in the cookie, never in the body. Mobile (Flutter): in the body, no cookie. */
function sendSession(res: Response, status: number, client: "web" | "mobile", session: Session) {
  const { refreshToken, ...body } = session;
  if (client === "mobile") {
    res.status(status).json({ ...body, refreshToken });
    return;
  }
  res.cookie(REFRESH_COOKIE, refreshToken, { ...cookieOptions, maxAge: env.auth.refreshTtlDays * 86_400_000 });
  res.status(status).json(body);
}

// PRD NFR: login and sign-up allow 5 attempts per 15 minutes per IP and, separately, per email.
const FIFTEEN_MINUTES = 15 * 60_000;
const limits = (name: string) => [
  rateLimit({ name: `${name}:ip`, limit: 5, windowMs: FIFTEEN_MINUTES, key: (req) => req.ip ?? "unknown" }),
  rateLimit({ name: `${name}:email`, limit: 5, windowMs: FIFTEEN_MINUTES, key: bodyEmail }),
];

authRouter.post("/signup", ...limits("signup"), async (req, res) => {
  const input = parseBody(signupSchema, req.body);
  sendSession(res, 201, input.client, await signup(input, device(req)));
});

authRouter.post("/login", ...limits("login"), async (req, res) => {
  const input = parseBody(loginSchema, req.body);
  sendSession(res, 200, input.client, await login(input, device(req)));
});

authRouter.post("/refresh", async (req, res) => {
  const input = parseBody(refreshSchema, req.body);
  const token = input.refreshToken ?? readCookie(req, REFRESH_COOKIE);
  if (!token) throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Your session ended. Log in again.");

  const { refreshToken, user } = await rotateRefreshToken(token, device(req));
  const accessToken = await signAccessToken(user.id, user.role);
  sendSession(res, 200, input.refreshToken ? "mobile" : input.client, { accessToken, refreshToken });
});

authRouter.post("/logout", async (req, res) => {
  const input = parseBody(refreshSchema, req.body);
  const token = input.refreshToken ?? readCookie(req, REFRESH_COOKIE);
  if (token) await revokeRefreshToken(token);
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  res.status(204).end();
});
