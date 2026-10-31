import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  __ttsSchemaReady?: Promise<void>
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

/**
 * Гарантирует наличие таблиц (Favorite, User, TimeCapsule, DreamStar).
 *
 * На серверless-хостингах (Vercel) SQLite живёт в /tmp и пересоздаётся
 * с нуля при каждом холодном старте — prisma db push там не выполнить,
 * поэтому схема создаётся прямым SQL при первом обращении.
 */
export async function ensureSchema(): Promise<void> {
  if (!globalForPrisma.__ttsSchemaReady) {
    globalForPrisma.__ttsSchemaReady = (async () => {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Favorite" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "sessionId" TEXT NOT NULL,
          "category" TEXT NOT NULL DEFAULT 'other',
          "title" TEXT NOT NULL,
          "url" TEXT NOT NULL,
          "source" TEXT,
          "deadline" TEXT,
          "prize" TEXT,
          "format" TEXT,
          "summary" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIME
        )
      `);
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "Favorite_sessionId_idx" ON "Favorite"("sessionId")`,
      );
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "email" TEXT NOT NULL,
          "name" TEXT,
          "passwordHash" TEXT,
          "provider" TEXT NOT NULL DEFAULT 'local',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIME
        )
      `);
      await db.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "TimeCapsule" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "title" TEXT,
          "message" TEXT NOT NULL,
          "deliverAt" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIME,
          CONSTRAINT "TimeCapsule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "TimeCapsule_userId_idx" ON "TimeCapsule"("userId")`,
      );
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "DreamStar" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "sessionId" TEXT NOT NULL,
          "text" TEXT NOT NULL,
          "color" TEXT NOT NULL,
          "x" REAL NOT NULL,
          "y" REAL NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIME
        )
      `);
      await db.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "DreamStar_sessionId_idx" ON "DreamStar"("sessionId")`,
      );
    })().catch((error) => {
      // сбрасываем memo — следующая попытка пересоздаст схему
      globalForPrisma.__ttsSchemaReady = undefined;
      throw error;
    });
  }
  await globalForPrisma.__ttsSchemaReady;
}
