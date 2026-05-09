require('dotenv').config();
const { PrismaClient } = require('../../node_modules/@prisma/client');

const prisma = new PrismaClient();

async function tableExists(tableName) {
  const result = await prisma.$queryRawUnsafe(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${tableName}'`,
  );
  return result.length > 0;
}

async function run() {
  if (await tableExists('ForbiddenWord')) {
    console.log('Tabela ForbiddenWord já existe. Nenhuma migração pendente.');
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE "ForbiddenWord" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "word" TEXT NOT NULL,
      "punishment" TEXT NOT NULL,
      "durationValue" INTEGER,
      "durationUnit" TEXT,
      "durationSeconds" INTEGER,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "ForbiddenWord_word_key" ON "ForbiddenWord"("word")');
  console.log('Tabela ForbiddenWord criada com sucesso.');
}

run()
  .catch((error) => {
    console.error('Falha ao criar tabela ForbiddenWord:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
