import { z } from "zod";

/**
 * Same rules and messages as the web app (rentxplay-FE src/lib/auth/validate.ts), so a form can
 * show API errors as they come. Sign-up and log-in take only email and password; name and phone
 * are added later (PATCH /me, POST /me/phone).
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
/** bcrypt only reads the first 72 bytes. */
export const PASSWORD_MAX = 72;

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .regex(EMAIL, "Enter an email like name@example.com.");

/** One message per problem, checked in the same order as the web form. */
const newPassword = z.string({ error: "Enter a password." }).superRefine((value, ctx) => {
  const message = !value
    ? "Enter a password."
    : value.length < PASSWORD_MIN
      ? `Use at least ${PASSWORD_MIN} characters.`
      : new TextEncoder().encode(value).length > PASSWORD_MAX
        ? `Use ${PASSWORD_MAX} characters or fewer.`
        : !/[a-z]/i.test(value) || !/\d/.test(value)
          ? "Use at least one letter and one number."
          : null;
  if (message) ctx.addIssue({ code: "custom", message });
});

/** "web" gets the refresh token as an httpOnly cookie; "mobile" (Flutter app) gets it in the body. */
const client = z.enum(["web", "mobile"]).default("web");

export const signupSchema = z.object({ email, password: newPassword, client });

export const loginSchema = z.object({
  email,
  password: z.string({ error: "Enter your password." }).min(1, "Enter your password."),
  client,
});

export const refreshSchema = z.object({
  /** Mobile clients send it here; web clients use the cookie. */
  refreshToken: z.string().min(1).optional(),
  client,
});

export type SignupInput = z.output<typeof signupSchema>;
export type LoginInput = z.output<typeof loginSchema>;
