import type { UserRole } from "../generated/prisma/enums.ts";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth from a valid access token. */
      auth?: { userId: string; role: UserRole };
    }
  }
}

export {};
