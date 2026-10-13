/**
 * authService.js — email/password registration and login with JWT sessions.
 * Passwords are hashed with bcrypt; tokens carry only the user id.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { conflict, unauthorized } from "../utils/errors.js";

const BCRYPT_ROUNDS = 12;

/**
 * @param {import("@prisma/client").PrismaClient} prisma
 * @param {{ JWT_SECRET: string, JWT_EXPIRES_IN: string }} env
 */
export function createAuthService(prisma, env) {
  function signToken(user) {
    return jwt.sign({ sub: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN, issuer: "resume-analyzer-api" });
  }

  function publicUser(user) {
    return { id: user.id, email: user.email, name: user.name ?? null, createdAt: user.createdAt };
  }

  return {
    async register({ email, password, name }) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw conflict("An account with this email already exists.");
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = await prisma.user.create({ data: { email, passwordHash, name: name || null } });
      return { user: publicUser(user), token: signToken(user) };
    },

    async login({ email, password }) {
      const user = await prisma.user.findUnique({ where: { email } });
      // Constant-shape response whether or not the account exists.
      const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
      if (!ok) throw unauthorized("Invalid email or password.");
      return { user: publicUser(user), token: signToken(user) };
    },

    async getUser(id) {
      const user = await prisma.user.findUnique({ where: { id } });
      return user ? publicUser(user) : null;
    },

    verifyToken(token) {
      try {
        const payload = jwt.verify(token, env.JWT_SECRET, { issuer: "resume-analyzer-api" });
        if (!payload || typeof payload.sub !== "string") throw new Error("bad payload");
        return { userId: payload.sub };
      } catch {
        throw unauthorized("Your session is invalid or has expired. Please sign in again.");
      }
    },
  };
}
