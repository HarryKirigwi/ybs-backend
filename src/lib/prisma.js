import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    // Connection pool settings for Railway
    // Note: Don't use both datasourceUrl and datasources - just rely on DATABASE_URL from env
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Handle connection errors
prisma.$on('error', (e) => {
  console.error('Prisma error:', e);
});

// Clean shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});