import { PrismaClient } from "@prisma/client";

let client = null;

/** Lazily create the Prisma client so tests can inject a fake repository instead. */
export function getPrisma() {
  if (!client) {
    client = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });
  }
  return client;
}

export async function disconnectPrisma() {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
