/**
 * Auth integration tests (Jest + Supertest): real HTTP requests through the Express app into the
 * database. Each run uses fresh random emails and deletes its users afterwards.
 */
import { afterAll, beforeEach, describe, expect, test } from "@jest/globals";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { z } from "zod";
import { createApp } from "../../app.ts";
import { prisma } from "../../lib/db.ts";
import { resetRateLimits } from "../../middlewares/rate-limit.ts";

const app = createApp();
const PASSWORD = "rentit2026";

// Response shapes. Parsing with these types the body (no `any`) and checks the API contract.
const userBody = z.strictObject({
  id: z.uuid(),
  email: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  phoneVerified: z.boolean(),
});
const sessionBody = z.strictObject({ user: userBody, accessToken: z.string().min(20) });
const mobileSessionBody = sessionBody.extend({ refreshToken: z.string().min(20) });
const refreshBody = z.strictObject({ accessToken: z.string().min(20) });
const errorBody = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    fields: z.strictObject({ email: z.string().optional(), password: z.string().optional() }).optional(),
  }),
});

const errorOf = (res: request.Response) => errorBody.parse(res.body).error;
const newEmail = () => `test-${randomUUID().slice(0, 8)}@rentxplay.test`;

async function signUp(email = newEmail(), password = PASSWORD) {
  return request(app).post("/api/v1/auth/signup").send({ email, password });
}

function logIn(email: string, password = PASSWORD) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

/** The full rx_refresh Set-Cookie header, if the response set one. */
function refreshSetCookie(res: request.Response) {
  return (res.get("Set-Cookie") ?? []).find((c) => c.startsWith("rx_refresh="));
}

/** The rx_refresh cookie as "rx_refresh=<value>", ready to send back. */
function refreshCookie(res: request.Response): string {
  const cookie = refreshSetCookie(res)?.split(";")[0];
  if (!cookie) throw new Error("expected an rx_refresh cookie");
  return cookie;
}

beforeEach(() => {
  resetRateLimits();
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: "test-", endsWith: "@rentxplay.test" } } });
  await prisma.$disconnect();
});

describe("POST /api/v1/auth/signup", () => {
  test("201 with { user, accessToken } and an httpOnly, Secure, SameSite=Lax refresh cookie", async () => {
    const email = newEmail();
    const res = await signUp(email);

    expect(res.status).toBe(201);
    const { user } = sessionBody.parse(res.body);
    expect(user).toMatchObject({ email, name: null, phone: null, phoneVerified: false });

    const cookie = refreshSetCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).not.toBe(PASSWORD);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test("needs only email and password, trims and lower-cases the email", async () => {
    const email = newEmail();
    const res = await signUp(`  ${email.toUpperCase()}  `);
    expect(res.status).toBe(201);
    expect(sessionBody.parse(res.body).user.email).toBe(email);
  });

  test("409 EMAIL_TAKEN for an email that already has an account, in any letter case", async () => {
    const email = newEmail();
    await signUp(email);

    const res = await signUp(email.toUpperCase());
    expect(res.status).toBe(409);
    expect(errorOf(res)).toMatchObject({
      code: "EMAIL_TAKEN",
      fields: { email: "An account with this email already exists. Log in instead." },
    });
  });

  test.each([
    ["missing email", { password: PASSWORD }, "email", "Enter your email address."],
    ["empty email", { email: "  ", password: PASSWORD }, "email", "Enter your email address."],
    ["malformed email", { email: "kavya@example", password: PASSWORD }, "email", "Enter an email like name@example.com."],
    ["empty password", { email: "a@b.co", password: "" }, "password", "Enter a password."],
    ["short password", { email: "a@b.co", password: "abc123" }, "password", "Use at least 8 characters."],
    ["password over 72 bytes", { email: "a@b.co", password: `a1${"é".repeat(36)}` }, "password", "Use 72 characters or fewer."],
    ["password without a number", { email: "a@b.co", password: "onlyletters" }, "password", "Use at least one letter and one number."],
    ["password without a letter", { email: "a@b.co", password: "12345678" }, "password", "Use at least one letter and one number."],
  ] as const)("400 for %s", async (_case, body, field, message) => {
    const res = await request(app).post("/api/v1/auth/signup").send(body);
    expect(res.status).toBe(400);
    const error = errorOf(res);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.fields?.[field]).toBe(message);
  });
});

describe("POST /api/v1/auth/login", () => {
  test("200 with { user, accessToken } and the refresh cookie", async () => {
    const email = newEmail();
    await signUp(email);

    const res = await logIn(email);
    expect(res.status).toBe(200);
    expect(sessionBody.parse(res.body).user.email).toBe(email);
    expect(refreshSetCookie(res)).toBeDefined();
  });

  test("401 INVALID_CREDENTIALS for a wrong password", async () => {
    const email = newEmail();
    await signUp(email);

    const res = await logIn(email, "wrong-pass-1");
    expect(res.status).toBe(401);
    expect(errorOf(res)).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "That email and password don't match.",
      fields: { password: "That email and password don't match." },
    });
  });

  test("an unknown email gets exactly the same 401 as a wrong password", async () => {
    const email = newEmail();
    await signUp(email);

    const wrongPassword = await logIn(email, "wrong-pass-1");
    const unknownEmail = await logIn(newEmail(), "wrong-pass-1");
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test("400 'Enter your password.' for an empty password (no strength rules at login)", async () => {
    const res = await logIn(newEmail(), "");
    expect(res.status).toBe(400);
    expect(errorOf(res).fields?.password).toBe("Enter your password.");
  });

  test("429 on the 6th attempt in 15 minutes for one email", async () => {
    const email = newEmail();
    for (let i = 0; i < 5; i++) expect((await logIn(email, "wrong-pass-1")).status).toBe(401);

    const sixth = await logIn(email);
    expect(sixth.status).toBe(429);
    expect(errorOf(sixth).code).toBe("RATE_LIMITED");
    expect(Number(sixth.get("Retry-After"))).toBeGreaterThan(0);
  });

  test("429 on the 6th attempt in 15 minutes from one IP, even with different emails", async () => {
    for (let i = 0; i < 5; i++) expect((await logIn(newEmail(), "wrong-pass-1")).status).toBe(401);
    expect((await logIn(newEmail(), "wrong-pass-1")).status).toBe(429);
  });
});

describe("refresh tokens", () => {
  test("refresh rotates the cookie and returns a new access token", async () => {
    const first = refreshCookie(await signUp());

    const res = await request(app).post("/api/v1/auth/refresh").set("Cookie", first);
    expect(res.status).toBe(200);
    refreshBody.parse(res.body);
    expect(refreshCookie(res)).not.toBe(first);
  });

  test("reusing a revoked refresh token revokes the whole chain", async () => {
    const first = refreshCookie(await signUp());
    const second = refreshCookie(await request(app).post("/api/v1/auth/refresh").set("Cookie", first));

    const reuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", first);
    expect(reuse.status).toBe(401);
    expect(errorOf(reuse).code).toBe("INVALID_REFRESH_TOKEN");

    // The newer token in the chain is revoked too, so whoever stole the old one is locked out.
    const afterReuse = await request(app).post("/api/v1/auth/refresh").set("Cookie", second);
    expect(afterReuse.status).toBe(401);
  });

  test("logout revokes the refresh token and clears the cookie", async () => {
    const cookie = refreshCookie(await signUp());

    const out = await request(app).post("/api/v1/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(refreshSetCookie(out)).toMatch(/^rx_refresh=;/);

    expect((await request(app).post("/api/v1/auth/refresh").set("Cookie", cookie)).status).toBe(401);
  });

  test("the Flutter app gets the refresh token in the body instead of a cookie", async () => {
    const signup = await request(app)
      .post("/api/v1/auth/signup")
      .send({ email: newEmail(), password: PASSWORD, client: "mobile" });
    expect(signup.status).toBe(201);
    const { refreshToken } = mobileSessionBody.parse(signup.body);
    expect(refreshSetCookie(signup)).toBeUndefined();

    const res = await request(app).post("/api/v1/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(mobileSessionBody.omit({ user: true }).parse(res.body).refreshToken).not.toBe(refreshToken);
  });
});

describe("GET /api/v1/me", () => {
  test("returns id, email and null name and phone for a new account", async () => {
    const email = newEmail();
    const { accessToken, user } = sessionBody.parse((await signUp(email)).body);

    const res = await request(app).get("/api/v1/me").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(userBody.parse(res.body)).toEqual({ id: user.id, email, name: null, phone: null, phoneVerified: false });
  });

  test("401 UNAUTHENTICATED without a token or with a forged one", async () => {
    const none = await request(app).get("/api/v1/me");
    expect(none.status).toBe(401);
    expect(errorOf(none).code).toBe("UNAUTHENTICATED");

    const forged = await request(app).get("/api/v1/me").set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x");
    expect(forged.status).toBe(401);
  });
});
