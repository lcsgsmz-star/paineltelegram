require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getTableColumns(tableName) {
  return prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
}

async function ensureColumn(tableName, columnName, sql) {
  const columns = await getTableColumns(tableName);
  if (columns.some((column) => column.name === columnName)) {
    return false;
  }

  await prisma.$executeRawUnsafe(sql);
  return true;
}

async function run() {
  const changes = [];

  changes.push(
    await ensureColumn(
      'TelegramMember',
      'photoFileId',
      'ALTER TABLE "TelegramMember" ADD COLUMN "photoFileId" TEXT',
    ),
  );

  changes.push(
    await ensureColumn(
      'ActionLog',
      'durationValue',
      'ALTER TABLE "ActionLog" ADD COLUMN "durationValue" INTEGER',
    ),
  );

  changes.push(
    await ensureColumn(
      'ActionLog',
      'durationUnit',
      'ALTER TABLE "ActionLog" ADD COLUMN "durationUnit" TEXT',
    ),
  );

  changes.push(
    await ensureColumn(
      'ActionLog',
      'durationSeconds',
      'ALTER TABLE "ActionLog" ADD COLUMN "durationSeconds" INTEGER',
    ),
  );

  const updated = changes.filter(Boolean).length;
  console.log(updated > 0 ? `Migração concluída com ${updated} alteração(ões).` : 'Nenhuma alteração pendente.');
}

run()
  .catch((error) => {
    console.error('Falha ao adicionar colunas de mídia e duração:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
