import { PrismaClient } from '@prisma/client';

// Стандартный паттерн для Next.js: не создавать новый PrismaClient
// на каждый hot-reload в dev-режиме.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
