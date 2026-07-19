import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

/**
 * A single PrismaClient per process. In dev, Next.js hot-reload and tsx watch
 * re-import modules, which would otherwise leak connections - so cache the
 * client on globalThis.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "production" ? ["error"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "./config.js";
export * from "./premium.js";
