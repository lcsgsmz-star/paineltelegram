import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

type ModerationDurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';
type ReversalMessageOptions = {
  manualActorName?: string | null;
  automatic?: boolean;
};

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private readonly tokenValue = process.env.TELEGRAM_BOT_TOKEN || '';
  private readonly botUsername = process.env.TELEGRAM_BOT_USERNAME || process.env.BOT_USERNAME || '';
  private readonly ownerTelegramId = process.env.OWNER_TELEGRAM_ID || '';
  private groupId: string | null = process.env.TELEGRAM_GROUP_ID || null;
  private lastError: string | null = null;
  private lastSyncAt: Date | null = null;

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.loadLastGroup();
    this.logger.log('Painel conectado ao Bot de Adm. Listener Telegraf interno removido.');
  }

  private hasValidToken() {
    return !!this.tokenValue && this.tokenValue !== '123456789:ABCDEFghIJKlmnoPQRSTuvWXyz';
  }

  private normalizeTelegramId(value: string | number) {
    return String(value);
  }

  private toTelegramNumber(value: string | number) {
    return Number(value);
  }

  private async requestTelegram<T = any>(method: string, body?: Record<string, any>) {
    if (!this.hasValidToken()) {
      throw new BadRequestException('Token do Telegram nao esta configurado corretamente.');
    }

    const response = await fetch(`https://api.telegram.org/bot${this.tokenValue}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const payload = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!payload.ok) {
      throw new BadRequestException(payload.description || `Falha na chamada Telegram ${method}.`);
    }
    return payload.result as T;
  }

  private async loadLastGroup() {
    const group = await this.prisma.telegramGroup.findFirst({ orderBy: { updatedAt: 'desc' } });
    this.groupId = group?.telegramChatId || this.groupId;
  }

  private async ensureGroupReady() {
    if (!this.groupId) {
      await this.loadLastGroup();
    }
    if (!this.groupId) {
      throw new BadRequestException('Nenhum grupo foi sincronizado pelo Bot de Adm ainda.');
    }
  }

  private async ensureMember(telegramId: string | number, defaults: Partial<{ fullName: string; isBot: boolean }> = {}) {
    const normalizedTelegramId = this.normalizeTelegramId(telegramId);
    return this.prisma.telegramMember.upsert({
      where: { telegramId: normalizedTelegramId },
      update: { updatedAt: new Date() },
      create: {
        telegramId: normalizedTelegramId,
        telegramUsername: null,
        fullName: defaults.fullName || normalizedTelegramId,
        photoFileId: null,
        status: defaults.isBot ? 'BOT' : 'MEMBER',
        isBot: defaults.isBot || false,
        messageCount: 0,
        firstMessageAt: null,
        lastMessageAt: null,
      },
    });
  }

  private async formatMemberReference(telegramId: string | number) {
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: this.normalizeTelegramId(telegramId) },
      select: { fullName: true, telegramUsername: true, telegramId: true },
    });
    if (!member) return String(telegramId);
    return member.telegramUsername ? `@${member.telegramUsername}` : `${member.fullName} (${member.telegramId})`;
  }

  private async sendGroupMessage(text: string) {
    await this.ensureGroupReady();
    return this.requestTelegram('sendMessage', {
      chat_id: this.toTelegramNumber(this.groupId!),
      text,
      parse_mode: 'HTML',
    });
  }

  private async logTelegramAction(
    type: string,
    telegramId: string | number,
    reason: string,
    actorId?: number,
    durationSeconds?: number | null,
    durationValue?: number | null,
    durationUnit?: ModerationDurationUnit | null,
  ) {
    const member = await this.ensureMember(telegramId);
    return this.prisma.actionLog.create({
      data: {
        type,
        origin: actorId ? 'PANEL' : 'TELEGRAM',
        actorId,
        targetTelegramId: member.telegramId,
        targetMemberId: member.id,
        reason,
        durationSeconds: durationSeconds ?? null,
        durationMinutes: durationSeconds ? Math.max(1, Math.ceil(durationSeconds / 60)) : null,
        durationValue: durationValue ?? null,
        durationUnit: durationUnit ?? null,
      },
    });
  }

  async muteUser(
    telegramId: string | number,
    durationSeconds: number,
    reason: string,
    durationValue: number,
    durationUnit: ModerationDurationUnit,
  ) {
    await this.ensureGroupReady();
    const untilDate = Math.floor(Date.now() / 1000) + durationSeconds;
    await this.requestTelegram('restrictChatMember', {
      chat_id: this.toTelegramNumber(this.groupId!),
      user_id: this.toTelegramNumber(telegramId),
      permissions: { can_send_messages: false },
      until_date: untilDate,
    });
    await this.prisma.telegramMember.updateMany({
      where: { telegramId: this.normalizeTelegramId(telegramId) },
      data: { status: 'MUTED', updatedAt: new Date() },
    });
    await this.sendGroupMessage(`Usuario ${await this.formatMemberReference(telegramId)} silenciado. Motivo: ${reason}`);
  }

  async banUser(
    telegramId: string | number,
    durationSeconds: number | null,
    reason: string,
    durationValue?: number | null,
    durationUnit?: ModerationDurationUnit | null,
  ) {
    await this.ensureGroupReady();
    await this.requestTelegram('banChatMember', {
      chat_id: this.toTelegramNumber(this.groupId!),
      user_id: this.toTelegramNumber(telegramId),
      ...(durationSeconds ? { until_date: Math.floor(Date.now() / 1000) + durationSeconds } : {}),
    });
    await this.prisma.telegramMember.updateMany({
      where: { telegramId: this.normalizeTelegramId(telegramId) },
      data: { status: 'BANNED', updatedAt: new Date() },
    });
    await this.sendGroupMessage(`Usuario ${await this.formatMemberReference(telegramId)} banido. Motivo: ${reason}`);
  }

  async warnUser(
    telegramId: string | number,
    reason: string = 'Advertencia manual pelo painel.',
    actorId?: number,
    origin: 'PANEL' | 'TELEGRAM' = 'PANEL',
    durationValue?: number | null,
    durationUnit?: ModerationDurationUnit | null,
    durationSeconds?: number | null,
  ) {
    const member = await this.ensureMember(telegramId);
    const warning = await this.prisma.actionLog.create({
      data: {
        type: 'WARNING',
        origin,
        actorId,
        targetTelegramId: member.telegramId,
        targetMemberId: member.id,
        reason,
        durationValue: durationValue ?? null,
        durationUnit: durationUnit ?? null,
        durationSeconds: durationSeconds ?? null,
        durationMinutes: durationSeconds ? Math.max(1, Math.ceil(durationSeconds / 60)) : null,
      },
    });
    await this.sendGroupMessage(`Usuario ${await this.formatMemberReference(telegramId)} advertido. Motivo: ${reason}`);
    return warning;
  }

  async restoreMutedUser(telegramId: string | number, options: ReversalMessageOptions = {}) {
    await this.ensureGroupReady();
    await this.requestTelegram('restrictChatMember', {
      chat_id: this.toTelegramNumber(this.groupId!),
      user_id: this.toTelegramNumber(telegramId),
      permissions: {
        can_send_messages: true,
        can_send_audios: true,
        can_send_documents: true,
        can_send_photos: true,
        can_send_videos: true,
        can_send_video_notes: true,
        can_send_voice_notes: true,
        can_send_polls: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true,
      },
    });
    await this.prisma.telegramMember.updateMany({
      where: { telegramId: this.normalizeTelegramId(telegramId) },
      data: { status: 'MEMBER', updatedAt: new Date() },
    });
    await this.sendGroupMessage(
      `Silenciamento removido de ${await this.formatMemberReference(telegramId)}${options.manualActorName ? ` por ${options.manualActorName}` : ''}.`,
    );
  }

  async restoreBannedUser(telegramId: string | number, options: ReversalMessageOptions = {}) {
    await this.ensureGroupReady();
    await this.requestTelegram('unbanChatMember', {
      chat_id: this.toTelegramNumber(this.groupId!),
      user_id: this.toTelegramNumber(telegramId),
      only_if_banned: true,
    });
    await this.prisma.telegramMember.updateMany({
      where: { telegramId: this.normalizeTelegramId(telegramId) },
      data: { status: 'MEMBER', updatedAt: new Date() },
    });
    await this.sendGroupMessage(
      `Banimento removido de ${await this.formatMemberReference(telegramId)}${options.manualActorName ? ` por ${options.manualActorName}` : ''}.`,
    );
  }

  async unmuteUser(telegramId: string | number) {
    return this.restoreMutedUser(telegramId);
  }

  async unbanUser(telegramId: string | number) {
    return this.restoreBannedUser(telegramId);
  }

  async syncCurrentGroup(actorId?: number) {
    await this.ensureGroupReady();
    try {
      const [chat, memberCount, administrators] = await Promise.all([
        this.requestTelegram<any>('getChat', { chat_id: this.toTelegramNumber(this.groupId!) }),
        this.requestTelegram<number>('getChatMemberCount', { chat_id: this.toTelegramNumber(this.groupId!) }),
        this.requestTelegram<any[]>('getChatAdministrators', { chat_id: this.toTelegramNumber(this.groupId!) }),
      ]);

      await this.prisma.telegramGroup.upsert({
        where: { telegramChatId: this.groupId! },
        update: {
          title: chat.title || chat.first_name || this.groupId!,
          username: chat.username || null,
          description: chat.description || null,
          photoFileId: chat.photo?.big_file_id || chat.photo?.small_file_id || null,
          memberCount,
          isPrivate: !chat.username,
          updatedAt: new Date(),
        },
        create: {
          telegramChatId: this.groupId!,
          title: chat.title || chat.first_name || this.groupId!,
          username: chat.username || null,
          description: chat.description || null,
          photoFileId: chat.photo?.big_file_id || chat.photo?.small_file_id || null,
          memberCount,
          isPrivate: !chat.username,
        },
      });

      for (const admin of administrators) {
        const user = admin.user;
        if (!user) continue;
        await this.prisma.telegramMember.upsert({
          where: { telegramId: this.normalizeTelegramId(user.id) },
          update: {
            telegramUsername: user.username || null,
            fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || String(user.id),
            status: user.is_bot ? 'BOT' : 'ADMIN',
            isBot: !!user.is_bot,
            updatedAt: new Date(),
          },
          create: {
            telegramId: this.normalizeTelegramId(user.id),
            telegramUsername: user.username || null,
            fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim() || String(user.id),
            photoFileId: null,
            status: user.is_bot ? 'BOT' : 'ADMIN',
            isBot: !!user.is_bot,
            messageCount: 0,
            firstMessageAt: null,
            lastMessageAt: null,
          },
        });
      }

      this.lastSyncAt = new Date();
      this.lastError = null;
      if (actorId) {
        await this.prisma.actionLog.create({
          data: {
            type: 'PANEL_ACTION',
            origin: 'PANEL',
            actorId,
            reason: 'Sincronizou o painel com o Bot de Adm e Telegram.',
          },
        });
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
    return this.getGroupInfo();
  }

  async getGroupInfo() {
    if (!this.groupId) {
      await this.loadLastGroup();
    }
    return this.prisma.telegramGroup.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async getGroupPhotoDataUrl() {
    const group = await this.getGroupInfo();
    if (!group?.photoFileId) return null;
    return this.getTelegramFileDataUrl(group.photoFileId);
  }

  async getMemberPhotoDataUrl(memberId: number) {
    const member = await this.prisma.telegramMember.findUnique({
      where: { id: memberId },
      select: { photoFileId: true },
    });
    if (!member?.photoFileId) return null;
    return this.getTelegramFileDataUrl(member.photoFileId);
  }

  private async getTelegramFileDataUrl(fileId: string) {
    const file = await this.requestTelegram<{ file_path?: string }>('getFile', { file_id: fileId });
    if (!file?.file_path) return null;

    const response = await fetch(`https://api.telegram.org/file/bot${this.tokenValue}/${file.file_path}`);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  getStatus() {
    return {
      tokenConfigured: this.hasValidToken(),
      botUsername: this.botUsername,
      clientReady: this.hasValidToken(),
      botReady: this.hasValidToken() && !this.lastError,
      groupId: this.groupId,
      ownerTelegramId: this.ownerTelegramId,
      lastError: this.lastError,
      lastSyncAt: this.lastSyncAt,
    };
  }

  async clearStoredData(actorId?: number) {
    const memberIds = (await this.prisma.telegramMember.findMany({ select: { id: true } })).map((member) => member.id);
    const logWhere =
      memberIds.length > 0
        ? { OR: [{ origin: 'TELEGRAM' }, { targetMemberId: { in: memberIds } }, { targetTelegramId: { not: null } }] }
        : { OR: [{ origin: 'TELEGRAM' }, { targetTelegramId: { not: null } }] };

    const [deletedLogs, deletedMembers, deletedGroups] = await this.prisma.$transaction([
      this.prisma.actionLog.deleteMany({ where: logWhere }),
      this.prisma.telegramMember.deleteMany(),
      this.prisma.telegramGroup.deleteMany(),
    ]);

    this.groupId = process.env.TELEGRAM_GROUP_ID || null;
    this.lastSyncAt = null;
    this.lastError = null;

    if (actorId) {
      await this.prisma.actionLog.create({
        data: {
          type: 'PANEL_ACTION',
          origin: 'PANEL',
          actorId,
          reason: 'Limpeza completa dos dados do Bot de Adm executada pelo owner.',
        },
      });
    }

    return {
      deletedLogs: deletedLogs.count,
      deletedMembers: deletedMembers.count,
      deletedGroups: deletedGroups.count,
    };
  }

  async logEvent(type: string, telegramId: number, chatId: number) {
    await this.logTelegramAction(type, telegramId, `Evento ${type} capturado no chat ${chatId}`);
  }
}
