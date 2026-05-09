import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    await this.ensureLocalSchema();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureLocalSchema() {
    const columns = await this.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("PanelUser")');
    if (!columns.some((column) => column.name === 'permissions')) {
      await this.$executeRawUnsafe('ALTER TABLE "PanelUser" ADD COLUMN "permissions" TEXT NOT NULL DEFAULT \'[]\'');
    }
    await this.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "ModerationSetting" ("key" TEXT PRIMARY KEY NOT NULL, "value" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    await this.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "ModerationExemption" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "telegramId" TEXT NOT NULL UNIQUE, "telegramUsername" TEXT, "fullName" TEXT, "createdByTelegramId" TEXT, "createdByName" TEXT, "reason" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    await this.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "ScheduledAnnouncement" ("id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, "chatId" TEXT NOT NULL, "text" TEXT NOT NULL, "frequencySeconds" INTEGER NOT NULL, "nextRunAt" DATETIME NOT NULL, "endAt" DATETIME, "pinWithNotification" BOOLEAN NOT NULL DEFAULT false, "deleteLastMessage" BOOLEAN NOT NULL DEFAULT true, "lastMessageId" INTEGER, "createdByTelegramId" TEXT, "createdByName" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
    await this.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS "PhotoCache" ("fileId" TEXT PRIMARY KEY NOT NULL, "dataUrl" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    );
  }
}
