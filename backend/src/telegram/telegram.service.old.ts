import { Injectable, Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class TelegramService {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);
  private groupId: number;

  constructor(private prisma: PrismaService) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is obrigatório.');
    }
    this.bot = new Telegraf(token);
    this.initializeBot();
  }

  initializeBot() {
    this.bot.on('new_chat_members', async (ctx) => {
      const member = ctx.message?.new_chat_members?.[0];
      if (!member) return;
      await this.storeMember(member, ctx.chat.id);
      await this.logEvent('JOIN', member.id, ctx.chat.id);
    });

    this.bot.on('left_chat_member', async (ctx) => {
      const member = ctx.message?.left_chat_member;
      if (!member) return;
      await this.logEvent('LEAVE', member.id, ctx.chat.id);
    });

    this.bot.on('message', async (ctx) => {
      const message = ctx.message;
      if (!message?.from) return;
      await this.storeMessageStats(message.from, ctx.chat.id);
    });

    this.bot.launch().then(() => {
      this.logger.log('Bot do Telegram iniciado.');
    });
  }

  private async storeMember(user: any, chatId: number) {
    this.groupId = chatId;
    await this.prisma.telegramMember.upsert({
      where: { telegramId: user.id },
      update: {
        telegramUsername: user.username || null,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        isBot: user.is_bot,
        status: 'MEMBER',
        updatedAt: new Date(),
      },
      create: {
        telegramId: user.id,
        telegramUsername: user.username || null,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        isBot: user.is_bot,
        status: 'MEMBER',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private async storeMessageStats(user: any, chatId: number) {
    this.groupId = chatId;
    await this.prisma.telegramMember.upsert({
      where: { telegramId: user.id },
      update: {
        telegramUsername: user.username || null,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
        updatedAt: new Date(),
      },
      create: {
        telegramId: user.id,
        telegramUsername: user.username || null,
        fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        isBot: user.is_bot,
        status: 'MEMBER',
        messageCount: 1,
        firstMessageAt: new Date(),
        lastMessageAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  async muteUser(telegramId: number, minutes: number, reason: string) {
    const untilDate = Math.floor(Date.now() / 1000) + minutes * 60;
    await this.bot.telegram.restrictChatMember(this.groupId, telegramId, {
      can_send_messages: false,
      until_date: untilDate,
    });
    await this.bot.telegram.sendMessage(this.groupId, `🔇 Usuário ${telegramId} silenciado por ${minutes} min. Motivo: ${reason}`);
  }

  async banUser(telegramId: number, minutes: number | null, reason: string) {
    await this.bot.telegram.banChatMember(this.groupId, telegramId, { until_date: minutes ? Math.floor(Date.now() / 1000) + minutes * 60 : undefined });
    await this.bot.telegram.sendMessage(this.groupId, `⛔ Usuário ${telegramId} banido${minutes ? ` por ${minutes} min` : ' permanentemente'}. Motivo: ${reason}`);
  }

  async logEvent(type: string, telegramId: number, chatId: number) {
    await this.prisma.actionLog.create({
      data: {
        type,
        origin: 'TELEGRAM',
        targetTelegramId: telegramId,
        createdAt: new Date(),
      },
    });
  }
}
