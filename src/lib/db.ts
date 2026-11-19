import "server-only";
import { createPrisma } from "./prisma-client";

const g = globalThis as unknown as { prisma?: ReturnType<typeof createPrisma> };

export const prisma = g.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
