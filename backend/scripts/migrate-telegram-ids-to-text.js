require('dotenv').config();
const { PrismaClient } = require('../../node_modules/@prisma/client');

const prisma = new PrismaClient();

async function getColumnType(tableName, columnName) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
  const column = columns.find((item) => item.name === columnName);
  return column?.type?.toUpperCase() || null;
}

async function runStatements(statements) {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

async function run() {
  const telegramMemberIdType = await getColumnType('TelegramMember', 'telegramId');
  const telegramGroupIdType = await getColumnType('TelegramGroup', 'telegramChatId');
  const actionLogTargetIdType = await getColumnType('ActionLog', 'targetTelegramId');

  if (telegramMemberIdType === 'TEXT' && telegramGroupIdType === 'TEXT' && actionLogTargetIdType === 'TEXT') {
    console.log('IDs do Telegram ja estao como TEXT. Nenhuma migracao pendente.');
    return;
  }

  const statements = [
    'PRAGMA foreign_keys = OFF',
    'BEGIN IMMEDIATE TRANSACTION',
    'DROP TABLE IF EXISTS "new_ActionLog"',
    'DROP TABLE IF EXISTS "new_TelegramMember"',
    'DROP TABLE IF EXISTS "new_TelegramGroup"',
    `CREATE TABLE "new_TelegramMember" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "telegramId" TEXT NOT NULL,
      "telegramUsername" TEXT,
      "fullName" TEXT NOT NULL,
      "photoFileId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'MEMBER',
      "isBot" BOOLEAN NOT NULL DEFAULT false,
      "messageCount" INTEGER NOT NULL DEFAULT 0,
      "firstMessageAt" DATETIME,
      "lastMessageAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `INSERT INTO "new_TelegramMember" (
      "id", "telegramId", "telegramUsername", "fullName", "photoFileId", "status", "isBot",
      "messageCount", "firstMessageAt", "lastMessageAt", "createdAt", "updatedAt"
    )
    SELECT
      "id", CAST("telegramId" AS TEXT), "telegramUsername", "fullName", "photoFileId", "status", "isBot",
      "messageCount", "firstMessageAt", "lastMessageAt", "createdAt", "updatedAt"
    FROM "TelegramMember"`,
    `CREATE TABLE "new_TelegramGroup" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "telegramChatId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "username" TEXT,
      "description" TEXT,
      "photoFileId" TEXT,
      "memberCount" INTEGER,
      "isPrivate" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL
    )`,
    `INSERT INTO "new_TelegramGroup" (
      "id", "telegramChatId", "title", "username", "description", "photoFileId",
      "memberCount", "isPrivate", "createdAt", "updatedAt"
    )
    SELECT
      "id", CAST("telegramChatId" AS TEXT), "title", "username", "description", "photoFileId",
      "memberCount", "isPrivate", "createdAt", "updatedAt"
    FROM "TelegramGroup"`,
    `CREATE TABLE "new_ActionLog" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "type" TEXT NOT NULL,
      "origin" TEXT NOT NULL,
      "actorId" INTEGER,
      "targetMemberId" INTEGER,
      "targetTelegramId" TEXT,
      "reason" TEXT,
      "durationMinutes" INTEGER,
      "durationValue" INTEGER,
      "durationUnit" TEXT,
      "durationSeconds" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ActionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PanelUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ActionLog_targetMemberId_fkey" FOREIGN KEY ("targetMemberId") REFERENCES "TelegramMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `INSERT INTO "new_ActionLog" (
      "id", "type", "origin", "actorId", "targetMemberId", "targetTelegramId",
      "reason", "durationMinutes", "durationValue", "durationUnit", "durationSeconds", "createdAt"
    )
    SELECT
      "id", "type", "origin", "actorId", "targetMemberId", CAST("targetTelegramId" AS TEXT),
      "reason", "durationMinutes", "durationValue", "durationUnit", "durationSeconds", "createdAt"
    FROM "ActionLog"`,
    'DROP TABLE "ActionLog"',
    'DROP TABLE "TelegramMember"',
    'DROP TABLE "TelegramGroup"',
    'ALTER TABLE "new_TelegramMember" RENAME TO "TelegramMember"',
    'ALTER TABLE "new_TelegramGroup" RENAME TO "TelegramGroup"',
    'ALTER TABLE "new_ActionLog" RENAME TO "ActionLog"',
    'CREATE UNIQUE INDEX "TelegramMember_telegramId_key" ON "TelegramMember"("telegramId")',
    'CREATE UNIQUE INDEX "TelegramGroup_telegramChatId_key" ON "TelegramGroup"("telegramChatId")',
    'COMMIT',
    'PRAGMA foreign_keys = ON',
  ];

  try {
    await runStatements(statements);
    console.log('Migracao dos IDs do Telegram para TEXT concluida com sucesso.');
  } catch (error) {
    try {
      await prisma.$executeRawUnsafe('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

run()
  .catch((error) => {
    console.error('Falha na migracao dos IDs do Telegram:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
