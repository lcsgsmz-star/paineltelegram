import { BadRequestException, Injectable, InternalServerErrorException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Telegraf, Context, Markup } from 'telegraf';
import { Update, Message } from 'telegraf/types';
import {
  ModerationPunishment,
  ModerationSettings,
  ModerationSettingsService,
} from '../moderation-settings/moderation-settings.service';

type ModerationDurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';
type ModerationReversalAction = 'unmute' | 'unban';
type ForbiddenWordRule = {
  id: number;
  word: string;
  punishment: 'MUTE' | 'BAN' | 'WARNING';
  durationValue: number | null;
  durationUnit: ModerationDurationUnit | null;
  durationSeconds: number | null;
};
type ReversalMessageOptions = {
  manualActorName?: string | null;
  automatic?: boolean;
};
type AnnouncementDraft = {
  targetChatId?: string;
  text?: string;
  frequencySeconds?: number;
  startDelaySeconds?: number;
  pinWithNotification?: boolean;
  deleteLastMessage?: boolean;
  endAfterSeconds?: number | null;
  step: 'text' | 'frequency' | 'start' | 'pin' | 'delete' | 'end' | 'confirm';
};
type ScheduledAnnouncementRow = {
  id: number;
  chatId: string;
  text: string;
  frequencySeconds: number;
  nextRunAt: string;
  endAt: string | null;
  pinWithNotification: boolean | number;
  deleteLastMessage: boolean | number;
  lastMessageId: number | null;
  createdByTelegramId: string | null;
  createdByName: string | null;
  isActive: boolean | number;
};

@Injectable()
export class BotService implements OnModuleInit {
  private bot: Telegraf<Context<Update>> | null = null;
  private readonly logger = new Logger(BotService.name);
  private groupId: string | null = null;
  private botIsReady = false;
  private startupPromise: Promise<void> | null = null;
  private shutdownHooksRegistered = false;
  private readonly tokenValue = process.env.TELEGRAM_BOT_TOKEN || '';
  private readonly botUsername = process.env.TELEGRAM_BOT_USERNAME || '';
  private readonly ownerTelegramId = process.env.OWNER_TELEGRAM_ID || '';
  private readonly subOwnerTelegramIds = (process.env.SUB_OWNER_TELEGRAM_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  private readonly startupTimeoutMs = Number(process.env.TELEGRAM_BOT_STARTUP_TIMEOUT_MS || 60000);
  private readonly moderationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly floodMessageTimestamps = new Map<string, number[]>();
  private readonly announcementDrafts = new Map<string, AnnouncementDraft>();
  private readonly announcementTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private profilePhotoScanCompletedForGroupId: string | null = null;
  private lastError: string | null = null;
  private lastSyncAt: Date | null = null;

  constructor(private prisma: PrismaService, private moderationSettingsService: ModerationSettingsService) {}

  async onModuleInit() {
    await this.loadLastGroup();

    if (!this.hasValidToken()) {
      this.logger.warn('TELEGRAM_BOT_TOKEN não definido ou ainda está com placeholder. O bot não será iniciado automaticamente.');
      return;
    }

    void this.startBot().catch((error) => {
      this.logger.warn(`Não foi possível iniciar o bot automaticamente: ${error}`);
    });
  }

  private hasValidToken() {
    return !!this.tokenValue && this.tokenValue !== '123456789:ABCDEFghIJKlmnoPQRSTuvWXyz';
  }

  private async createBotInstance() {
    if (this.bot) {
      return;
    }

    this.bot = new Telegraf<Context<Update>>(this.tokenValue);
    this.initializeBot();
  }

  private async ensureBotClient() {
    if (!this.hasValidToken()) {
      throw new BadRequestException('Token do Telegram não está configurado corretamente.');
    }

    await this.createBotInstance();
  }

  private async startBot() {
    if (this.botIsReady) {
      return;
    }

    if (this.startupPromise) {
      return this.startupPromise;
    }

    await this.ensureBotClient();

    this.startupPromise = (async () => {
      try {
        await this.launchBot();
        this.botIsReady = true;
        this.lastError = null;
        this.registerShutdownHooks();
        await this.scheduleActiveModerationExpirations();
        await this.scheduleActiveAnnouncements();
        if (this.groupId) {
          void this.scanKnownMembersWithoutPublicPhoto(this.groupId);
        }
        this.logger.log('Bot Telegram iniciado com sucesso.');
      } catch (error) {
        this.botIsReady = false;
        this.lastError = error instanceof Error ? error.message : String(error);
        this.logger.error(`Falha ao iniciar bot Telegram: ${error}`);
        throw new InternalServerErrorException(
          'Falha ao iniciar o bot Telegram. Verifique se não há outra instância usando o mesmo token.',
        );
      } finally {
        this.startupPromise = null;
      }
    })();

    return this.startupPromise;
  }

  private registerShutdownHooks() {
    if (this.shutdownHooksRegistered) {
      return;
    }

    this.shutdownHooksRegistered = true;
    process.once('SIGINT', () => this.bot?.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot?.stop('SIGTERM'));
  }

  private async launchBot() {
    if (!this.bot) {
      throw new Error('Bot não inicializado.');
    }

    try {
      await this.withTimeout(
        this.bot.launch({ dropPendingUpdates: true }),
        this.startupTimeoutMs,
        'Tempo esgotado ao iniciar o bot Telegram.',
      );
    } catch (error: any) {
      const message = error?.toString?.() || '';
      if (message.includes('terminated by other getUpdates request') || message.includes('409')) {
        this.logger.warn('Conflito no Telegram detectado. Tentando limpar webhook e reiniciar o bot...');
        await this.clearTelegramWebhook();
        await this.withTimeout(
          this.bot.launch({ dropPendingUpdates: true }),
          this.startupTimeoutMs,
          'Tempo esgotado ao reiniciar o bot Telegram após limpar o webhook.',
        );
      } else {
        throw error;
      }
    }
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs: number, timeoutMessage: string) {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

      operation
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async clearTelegramWebhook() {
    if (!this.bot) {
      return;
    }

    try {
      await this.bot.telegram.deleteWebhook();
      this.logger.log('Webhook Telegram removido com sucesso.');
    } catch (error) {
      this.logger.warn(`Não foi possível remover o webhook do Telegram: ${error}`);
    }
  }

  private moderationTimerKey(action: ModerationReversalAction, telegramId: string | number) {
    return `${action}:${this.normalizeTelegramId(telegramId)}`;
  }

  private cancelModerationTimer(action: ModerationReversalAction, telegramId: string | number) {
    const key = this.moderationTimerKey(action, telegramId);
    const timer = this.moderationTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.moderationTimers.delete(key);
    }
  }

  private setModerationTimer(action: ModerationReversalAction, telegramId: string | number, delayMs: number) {
    const key = this.moderationTimerKey(action, telegramId);
    this.cancelModerationTimer(action, telegramId);

    const maxDelayMs = 2_147_483_647;
    const timer = setTimeout(() => {
      this.moderationTimers.delete(key);
      if (delayMs > maxDelayMs) {
        this.setModerationTimer(action, telegramId, delayMs - maxDelayMs);
        return;
      }

      void this.expireModerationAction(action, this.normalizeTelegramId(telegramId));
    }, Math.min(delayMs, maxDelayMs));

    this.moderationTimers.set(key, timer);
  }

  private scheduleModerationExpiration(
    action: ModerationReversalAction,
    telegramId: string | number,
    durationSeconds?: number | null,
  ) {
    if (!durationSeconds || durationSeconds <= 0) {
      return;
    }

    this.setModerationTimer(action, telegramId, durationSeconds * 1000);
  }

  private async scheduleActiveModerationExpirations() {
    const members = await this.prisma.telegramMember.findMany({
      where: { status: { in: ['MUTED', 'BANNED'] } },
      select: {
        telegramId: true,
        status: true,
        actionLogs: {
          where: {
            type: { in: ['MUTE', 'BAN'] },
            durationSeconds: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: { type: true, durationSeconds: true, createdAt: true },
        },
      },
    });

    for (const member of members) {
      const activeType = member.status === 'MUTED' ? 'MUTE' : 'BAN';
      const action = member.status === 'MUTED' ? 'unmute' : 'unban';
      const latestAction = member.actionLogs.find((log: { type: string }) => log.type === activeType);

      if (!latestAction?.durationSeconds) {
        continue;
      }

      const elapsedMs = Date.now() - latestAction.createdAt.getTime();
      const remainingMs = latestAction.durationSeconds * 1000 - elapsedMs;

      if (remainingMs <= 0) {
        void this.expireModerationAction(action, member.telegramId);
      } else {
        this.setModerationTimer(action, member.telegramId, remainingMs);
      }
    }
  }

  private async expireModerationAction(action: ModerationReversalAction, telegramId: string) {
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId },
      select: { id: true, isBot: true, status: true },
    });

    if (action === 'unmute') {
      if (member?.status && member.status !== 'MUTED') {
        return;
      }

      await this.restoreMutedUser(telegramId, { automatic: true });
      await this.prisma.telegramMember.updateMany({
        where: { telegramId },
        data: { status: member?.isBot ? 'BOT' : 'MEMBER', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'UNMUTE',
          origin: 'TELEGRAM',
          targetTelegramId: telegramId,
          targetMemberId: member?.id,
          reason: 'Silenciamento encerrado automaticamente pelo tempo definido.',
        },
      });
      return;
    }

    if (member?.status && member.status !== 'BANNED') {
      return;
    }

    await this.restoreBannedUser(telegramId, { automatic: true });
    await this.prisma.telegramMember.updateMany({
      where: { telegramId },
      data: { status: member?.isBot ? 'BOT' : 'MEMBER', updatedAt: new Date() },
    });
    await this.prisma.actionLog.create({
      data: {
        type: 'UNBAN',
        origin: 'TELEGRAM',
        targetTelegramId: telegramId,
        targetMemberId: member?.id,
        reason: 'Banimento encerrado automaticamente pelo tempo definido.',
      },
    });
  }

  async warnUser(
    telegramId: string | number,
    reason: string = 'Advertência manual pelo painel.',
    actorId?: number,
    origin: 'PANEL' | 'TELEGRAM' = 'PANEL',
    durationValue?: number | null,
    durationUnit?: ModerationDurationUnit | null,
    durationSeconds?: number | null,
  ) {
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;
    const normalizedTelegramId = this.normalizeTelegramId(telegramId);
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: normalizedTelegramId },
      select: { id: true, isBot: true },
    });

    const warning = await this.prisma.actionLog.create({
      data: {
        type: 'WARNING',
        origin,
        actorId,
        targetTelegramId: normalizedTelegramId,
        targetMemberId: member?.id,
        reason,
        durationValue: durationValue ?? null,
        durationUnit: durationUnit ?? null,
        durationSeconds: durationSeconds ?? null,
        durationMinutes: durationSeconds ? Math.max(1, Math.ceil(durationSeconds / 60)) : null,
      },
    });

    const warningLogs = member?.id
      ? await this.prisma.actionLog.findMany({
          where: {
            type: 'WARNING',
            targetMemberId: member.id,
          },
          select: { createdAt: true, durationSeconds: true },
        })
      : [];
    const now = Date.now();
    const warningCount = member?.id
      ? warningLogs.filter(
          (log: { durationSeconds: number | null; createdAt: Date }) =>
            !log.durationSeconds || log.createdAt.getTime() + log.durationSeconds * 1000 > now,
        )
          .length
      : 1;

    const memberReference = await this.formatMemberReference(normalizedTelegramId);
    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      `Usuário ${memberReference} advertido. Advertências: ${Math.min(warningCount, 3)}/3. Motivo: ${reason}`,
    );

    if (warningCount >= 3) {
      await this.banUser(normalizedTelegramId, null, '3 advertências acumuladas.');
      await this.prisma.telegramMember.updateMany({
        where: { telegramId: normalizedTelegramId },
        data: { status: 'BANNED', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'BAN',
          origin,
          actorId,
          targetTelegramId: normalizedTelegramId,
          targetMemberId: member?.id,
          reason: '3 advertências acumuladas.',
        },
      });
    }

    return warning;
  }

  private async warnForbiddenWordUser(telegramId: string | number, rule: ForbiddenWordRule, reason: string) {
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;
    const normalizedTelegramId = this.normalizeTelegramId(telegramId);
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: normalizedTelegramId },
      select: { id: true, isBot: true },
    });

    const warning = await this.prisma.actionLog.create({
      data: {
        type: 'WARNING',
        origin: 'TELEGRAM',
        targetTelegramId: normalizedTelegramId,
        targetMemberId: member?.id,
        reason,
        durationValue: rule.durationValue,
        durationUnit: rule.durationUnit,
        durationSeconds: rule.durationSeconds,
        durationMinutes: rule.durationSeconds ? Math.max(1, Math.ceil(rule.durationSeconds / 60)) : null,
      },
    });

    const warningLogs = member?.id
      ? await this.prisma.actionLog.findMany({
          where: {
            type: 'WARNING',
            targetMemberId: member.id,
          },
          select: { createdAt: true, durationSeconds: true },
        })
      : [];
    const now = Date.now();
    const warningCount = member?.id
      ? warningLogs.filter(
          (log: { durationSeconds: number | null; createdAt: Date }) =>
            !log.durationSeconds || log.createdAt.getTime() + log.durationSeconds * 1000 > now,
        )
          .length
      : 1;

    const memberReference = await this.formatMemberReference(normalizedTelegramId);
    const durationLabel =
      rule.durationValue && rule.durationUnit
        ? this.formatDurationLabel(rule.durationValue, rule.durationUnit)
        : 'Permanente';

    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      [
        `Usuário ${memberReference} advertido.`,
        `Motivo: ${reason}`,
        `Advertências: ${Math.min(warningCount, 3)}/3`,
        `Tempo: ${durationLabel}`,
      ].join('\n'),
    );

    if (warningCount >= 3) {
      await this.banUser(normalizedTelegramId, null, '3 advertências acumuladas.');
      await this.prisma.telegramMember.updateMany({
        where: { telegramId: normalizedTelegramId },
        data: { status: 'BANNED', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'BAN',
          origin: 'TELEGRAM',
          targetTelegramId: normalizedTelegramId,
          targetMemberId: member?.id,
          reason: '3 advertências acumuladas.',
        },
      });
    }

    return warning;
  }

  private async moderateForbiddenWordMessage(message: any, chatId?: number) {
    const from = message?.from;
    const text = message?.text || message?.caption;

    if (!from || from.is_bot || !chatId || !text) {
      return false;
    }

    if (await this.isTelegramIdExempt(from.id)) {
      return false;
    }

    if (!(await this.isRegularGroupMember(chatId, from.id))) {
      return false;
    }

    const rules = await this.getForbiddenWordRules();
    const matchedRule = rules.find((rule: ForbiddenWordRule) => this.matchesForbiddenWord(text, rule.word));

    if (!matchedRule) {
      return false;
    }

    try {
      await this.bot?.telegram.deleteMessage(chatId, message.message_id);
    } catch (error) {
      this.logger.warn(`Não foi possível apagar mensagem com palavra proibida: ${error}`);
    }

    await this.storeMember(from, this.normalizeTelegramId(chatId), 'MEMBER', false);
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: this.normalizeTelegramId(from.id) },
      select: { id: true },
    });
    const reason = `Usou a palavra proibida "${matchedRule.word}".`;

    if (matchedRule.punishment === 'WARNING') {
      await this.warnForbiddenWordUser(from.id, matchedRule, reason);
      return true;
    }

    if (matchedRule.punishment === 'MUTE') {
      const durationSeconds = matchedRule.durationSeconds || 60 * 60;
      const durationValue = matchedRule.durationValue || 60;
      const durationUnit = matchedRule.durationUnit || 'MINUTES';

      await this.muteUser(from.id, durationSeconds, reason, durationValue, durationUnit);
      await this.prisma.telegramMember.updateMany({
        where: { telegramId: this.normalizeTelegramId(from.id) },
        data: { status: 'MUTED', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'MUTE',
          origin: 'TELEGRAM',
          targetTelegramId: this.normalizeTelegramId(from.id),
          targetMemberId: member?.id,
          reason,
          durationValue,
          durationUnit,
          durationSeconds,
          durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        },
      });
      return true;
    }

    await this.banUser(
      from.id,
      matchedRule.durationSeconds,
      reason,
      matchedRule.durationValue,
      matchedRule.durationUnit,
    );
    await this.prisma.telegramMember.updateMany({
      where: { telegramId: this.normalizeTelegramId(from.id) },
      data: { status: 'BANNED', updatedAt: new Date() },
    });
    await this.prisma.actionLog.create({
      data: {
        type: 'BAN',
        origin: 'TELEGRAM',
        targetTelegramId: this.normalizeTelegramId(from.id),
        targetMemberId: member?.id,
        reason,
        durationValue: matchedRule.durationValue,
        durationUnit: matchedRule.durationUnit,
        durationSeconds: matchedRule.durationSeconds,
        durationMinutes: matchedRule.durationSeconds ? Math.max(1, Math.ceil(matchedRule.durationSeconds / 60)) : null,
      },
    });
    return true;
  }

  private async moderateInlineBotMessage(message: any, chatId?: number, settings?: ModerationSettings) {
    const from = message?.from;
    const viaBot = message?.via_bot;

    if (!from || from.is_bot || !chatId || !viaBot || (await this.isTelegramIdExempt(from.id))) {
      return false;
    }

    const activeSettings = settings || (await this.moderationSettingsService.getSettings());
    if (!activeSettings.inlineBotsEnabled) {
      return false;
    }

    const viaBotUsername = String(viaBot.username || '').replace(/^@/, '').trim().toLowerCase();
    if (viaBotUsername && activeSettings.allowedInlineBots.includes(viaBotUsername)) {
      return false;
    }

    try {
      await this.bot?.telegram.deleteMessage(chatId, message.message_id);
    } catch (error) {
      this.logger.warn(`Não foi possível apagar mensagem de bot inline não permitido: ${error}`);
    }

    await this.storeMember(from, this.normalizeTelegramId(chatId), 'MEMBER', false);
    await this.applyAutomaticPunishment(
      from.id,
      chatId,
      activeSettings.inlineBotPunishment,
      activeSettings.inlineBotDurationValue,
      activeSettings.inlineBotDurationUnit,
      `Usou bot inline não permitido${viaBotUsername ? `: @${viaBotUsername}` : ''}.`,
    );
    return true;
  }

  private async moderateFloodMessage(message: any, chatId?: number, settings?: ModerationSettings) {
    const from = message?.from;

    if (!from || from.is_bot || !chatId || (await this.isTelegramIdExempt(from.id))) {
      return false;
    }

    const activeSettings = settings || (await this.moderationSettingsService.getSettings());
    if (!activeSettings.floodEnabled) {
      return false;
    }

    const now = Date.now();
    const windowMs = activeSettings.floodTimeWindowSeconds * 1000;
    const key = `${chatId}:${this.normalizeTelegramId(from.id)}`;
    const timestamps = (this.floodMessageTimestamps.get(key) || []).filter((timestamp) => now - timestamp <= windowMs);
    timestamps.push(now);
    this.floodMessageTimestamps.set(key, timestamps);

    if (timestamps.length < activeSettings.floodMessageLimit) {
      return false;
    }

    this.floodMessageTimestamps.set(key, []);

    try {
      await this.bot?.telegram.deleteMessage(chatId, message.message_id);
    } catch (error) {
      this.logger.warn(`Não foi possível apagar mensagem de flood: ${error}`);
    }

    await this.storeMember(from, this.normalizeTelegramId(chatId), 'MEMBER', false);
    await this.applyAutomaticPunishment(
      from.id,
      chatId,
      activeSettings.floodPunishment,
      activeSettings.floodDurationValue,
      activeSettings.floodDurationUnit,
      `Flood: ${timestamps.length} mensagens em ${activeSettings.floodTimeWindowSeconds} segundos.`,
    );
    return true;
  }

  private resolveDurationSeconds(value: number, unit: ModerationDurationUnit) {
    const multipliers: Record<ModerationDurationUnit, number> = {
      SECONDS: 1,
      MINUTES: 60,
      DAYS: 86400,
    };
    return value * multipliers[unit];
  }

  private async applyAutomaticPunishment(
    telegramId: string | number,
    chatId: number,
    punishment: ModerationPunishment,
    durationValue: number,
    durationUnit: ModerationDurationUnit,
    reason: string,
  ) {
    const normalizedTelegramId = this.normalizeTelegramId(telegramId);
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: normalizedTelegramId },
      select: { id: true },
    });
    const durationSeconds = this.resolveDurationSeconds(durationValue, durationUnit);

    if (punishment === 'WARNING') {
      await this.warnUser(normalizedTelegramId, reason, undefined, 'TELEGRAM', durationValue, durationUnit, durationSeconds);
      return;
    }

    if (punishment === 'MUTE') {
      await this.muteUser(normalizedTelegramId, durationSeconds, reason, durationValue, durationUnit);
      await this.prisma.telegramMember.updateMany({
        where: { telegramId: normalizedTelegramId },
        data: { status: 'MUTED', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'MUTE',
          origin: 'TELEGRAM',
          targetTelegramId: normalizedTelegramId,
          targetMemberId: member?.id,
          reason,
          durationValue,
          durationUnit,
          durationSeconds,
          durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
        },
      });
      return;
    }

    await this.banUser(normalizedTelegramId, durationSeconds, reason, durationValue, durationUnit);
    await this.prisma.telegramMember.updateMany({
      where: { telegramId: normalizedTelegramId },
      data: { status: 'BANNED', updatedAt: new Date() },
    });
    await this.prisma.actionLog.create({
      data: {
        type: 'BAN',
        origin: 'TELEGRAM',
        targetTelegramId: normalizedTelegramId,
        targetMemberId: member?.id,
        reason,
        durationValue,
        durationUnit,
        durationSeconds,
        durationMinutes: Math.max(1, Math.ceil(durationSeconds / 60)),
      },
    });
  }

  private async isTelegramIdExempt(telegramId: string | number) {
    const rows = (await this.prisma.$queryRawUnsafe(
      'SELECT "id" FROM "ModerationExemption" WHERE "telegramId" = ? LIMIT 1',
      this.normalizeTelegramId(telegramId),
    )) as Array<{ id: number }>;
    return rows.length > 0;
  }

  private async handleFreeCommand(message: any, chatId?: number) {
    const from = message?.from;
    const text = String(message?.text || '').trim();
    if (!from || !chatId || !/^\/free(?:@\w+)?(?:\s|$)/i.test(text)) {
      return false;
    }

    if (!(await this.isAuthorizedCallbackActor(from.id, chatId))) {
      await this.bot?.telegram.sendMessage(chatId, 'Apenas o owner ou administradores podem usar o /free.');
      return true;
    }

    const target = await this.resolveFreeCommandTarget(message);
    if (!target) {
      await this.bot?.telegram.sendMessage(
        chatId,
        'Use /free respondendo a mensagem do membro, marcando @username ou informando o ID do Telegram.',
      );
      return true;
    }

    await this.storeMember(target, this.normalizeTelegramId(chatId), target.status || 'MEMBER', true);
    const now = new Date().toISOString();
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ModerationExemption" ("telegramId", "telegramUsername", "fullName", "createdByTelegramId", "createdByName", "reason", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT("telegramId") DO UPDATE SET
        "telegramUsername" = excluded."telegramUsername",
        "fullName" = excluded."fullName",
        "createdByTelegramId" = excluded."createdByTelegramId",
        "createdByName" = excluded."createdByName",
        "reason" = excluded."reason",
        "createdAt" = excluded."createdAt"`,
      this.normalizeTelegramId(target.id),
      target.username || null,
      `${target.first_name || ''} ${target.last_name || ''}`.trim() || null,
      this.normalizeTelegramId(from.id),
      this.formatTelegramActorName(from),
      'Liberado pelo comando /free.',
      now,
    );

    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: this.normalizeTelegramId(target.id) },
      select: { id: true },
    });
    await this.prisma.actionLog.create({
      data: {
        type: 'PANEL_ACTION',
        origin: 'TELEGRAM',
        targetTelegramId: this.normalizeTelegramId(target.id),
        targetMemberId: member?.id,
        reason: `Membro liberado das limitações pelo /free. Administrador: ${this.formatTelegramActorName(from)}.`,
      },
    });

    await this.bot?.telegram.sendMessage(
      chatId,
      `Membro ${await this.formatMemberReference(target.id)} liberado das limitações automáticas.`,
    );
    return true;
  }

  private async resolveFreeCommandTarget(message: any) {
    const replyUser = message?.reply_to_message?.from;
    if (replyUser && !replyUser.is_bot) {
      return replyUser;
    }

    const textMention = (message?.entities || []).find((entity: any) => entity.type === 'text_mention' && entity.user);
    if (textMention?.user && !textMention.user.is_bot) {
      return textMention.user;
    }

    const text = String(message?.text || '');
    const argument = text.replace(/^\/free(?:@\w+)?/i, '').trim();
    if (!argument) {
      return null;
    }

    const username = argument.match(/@([A-Za-z0-9_]{3,})/)?.[1];
    if (username) {
      const member = await this.prisma.telegramMember.findFirst({
        where: { telegramUsername: username },
      });
      if (!member) return null;
      return {
        id: member.telegramId,
        username: member.telegramUsername,
        first_name: member.fullName,
        last_name: '',
        is_bot: member.isBot,
        status: member.status,
      };
    }

    if (/^-?\d+$/.test(argument)) {
      const member = await this.prisma.telegramMember.findUnique({
        where: { telegramId: argument },
      });
      return {
        id: argument,
        username: member?.telegramUsername || null,
        first_name: member?.fullName || argument,
        last_name: '',
        is_bot: member?.isBot || false,
        status: member?.status || 'MEMBER',
      };
    }

    return null;
  }

  private getAnnouncementDraftKey(chatId: string | number, userId: string | number) {
    return `${this.normalizeTelegramId(chatId)}:${this.normalizeTelegramId(userId)}`;
  }

  private async handleAnnouncementTextInput(message: any, chatId?: number) {
    const from = message?.from;
    const text = String(message?.text || '').trim();
    if (!from || !chatId || !text || text.startsWith('/')) return false;

    const key = this.getAnnouncementDraftKey(chatId, from.id);
    const draft = this.announcementDrafts.get(key);
    if (!draft || draft.step !== 'text') return false;

    draft.text = text;
    draft.step = 'frequency';
    this.announcementDrafts.set(key, draft);
    await this.bot?.telegram.sendMessage(chatId, 'Escolha a frequência do aviso:', this.buildAnnouncementKeyboard('frequency'));
    return true;
  }

  private async handleAnnouncementCommand(message: any, chatId?: number) {
    const from = message?.from;
    const text = String(message?.text || '').trim();
    if (!from || !chatId || !/^\/aviso(?:@\w+)?(?:\s|$)/i.test(text)) {
      return false;
    }

    const targetChatId = await this.resolveAnnouncementTargetChatId(chatId);
    if (!targetChatId) {
      await this.bot?.telegram.sendMessage(
        chatId,
        'Nenhum grupo foi registrado ainda. Adicione o bot ao grupo como administrador e sincronize pelo painel.',
      );
      return true;
    }

    const access = await this.getAnnouncementAssistantAccess(from.id, targetChatId);
    if (!access.allowed) {
      await this.bot?.telegram.sendMessage(chatId, access.reason);
      return true;
    }

    const key = this.getAnnouncementDraftKey(chatId, from.id);
    this.announcementDrafts.set(key, { step: 'text', targetChatId: this.normalizeTelegramId(targetChatId) });
    await this.bot?.telegram.sendMessage(
      chatId,
      'Assistente de aviso automático iniciado. Envie agora o texto do aviso; depois disso, as próximas escolhas serão por botões.',
      Markup.inlineKeyboard([[Markup.button.callback('Cancelar', 'announce:cancel')]]),
    );
    return true;
  }

  private async resolveAnnouncementTargetChatId(currentChatId: number) {
    if (currentChatId < 0) {
      return currentChatId;
    }

    if (!this.groupId) {
      await this.loadLastGroup();
    }

    return this.groupId ? this.toTelegramNumber(this.groupId) : null;
  }

  private async canUseAnnouncementAssistant(userId: number, chatId: number) {
    const targetChatId = await this.resolveAnnouncementTargetChatId(chatId);
    if (!targetChatId) return false;
    return (await this.getAnnouncementAssistantAccess(userId, targetChatId)).allowed;
  }

  private async getAnnouncementAssistantAccess(userId: number, chatId: number) {
    const settings = await this.moderationSettingsService.getSettings();
    if (!settings.scheduledAnnouncementsEnabled) {
      return {
        allowed: false,
        reason: 'A função de avisos automáticos está desativada no painel.',
      };
    }

    const normalizedUserId = this.normalizeTelegramId(userId);
    const isOwner = this.ownerTelegramId && normalizedUserId === this.normalizeTelegramId(this.ownerTelegramId);
    const isSubOwner = this.subOwnerTelegramIds.some((id) => this.normalizeTelegramId(id) === normalizedUserId);

    try {
      const member = await this.bot?.telegram.getChatMember(chatId, userId);
      const isGroupAdmin = member?.status === 'creator' || member?.status === 'administrator';
      if (!isGroupAdmin) {
        return {
          allowed: false,
          reason: `Você está configurado como ${isOwner ? 'owner' : isSubOwner ? 'sub dono' : 'usuário'}, mas precisa ser administrador deste grupo para usar /aviso. Seu ID: ${normalizedUserId}.`,
        };
      }

      if (isOwner || isSubOwner || member?.status === 'creator') {
        return { allowed: true, reason: '' };
      }

      return {
        allowed: false,
        reason: `Seu ID (${normalizedUserId}) não está configurado como owner ou sub dono no bot.`,
      };
    } catch {
      return {
        allowed: false,
        reason: `Não consegui validar sua permissão no grupo. Confirme se o bot é administrador e se o seu ID (${normalizedUserId}) está correto.`,
      };
    }
  }

  private buildAnnouncementKeyboard(step: AnnouncementDraft['step']) {
    if (step === 'frequency') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('A cada 15 minutos', 'announce:frequency:900')],
        [Markup.button.callback('A cada 1 hora', 'announce:frequency:3600')],
        [Markup.button.callback('A cada 6 horas', 'announce:frequency:21600')],
        [Markup.button.callback('A cada 24 horas', 'announce:frequency:86400')],
        [Markup.button.callback('Cancelar', 'announce:cancel')],
      ]);
    }
    if (step === 'start') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('Começar agora', 'announce:start:0')],
        [Markup.button.callback('Começar em 5 minutos', 'announce:start:300')],
        [Markup.button.callback('Começar em 1 hora', 'announce:start:3600')],
        [Markup.button.callback('Amanhã às 09:00', 'announce:start:tomorrow9')],
        [Markup.button.callback('Cancelar', 'announce:cancel')],
      ]);
    }
    if (step === 'pin') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('Fixar com notificação', 'announce:pin:yes')],
        [Markup.button.callback('Não fixar', 'announce:pin:no')],
        [Markup.button.callback('Cancelar', 'announce:cancel')],
      ]);
    }
    if (step === 'delete') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('Apagar o último aviso', 'announce:delete:yes')],
        [Markup.button.callback('Manter avisos anteriores', 'announce:delete:no')],
        [Markup.button.callback('Cancelar', 'announce:cancel')],
      ]);
    }
    if (step === 'end') {
      return Markup.inlineKeyboard([
        [Markup.button.callback('Nunca encerrar', 'announce:end:never')],
        [Markup.button.callback('Encerrar em 24 horas', 'announce:end:86400')],
        [Markup.button.callback('Encerrar em 7 dias', 'announce:end:604800')],
        [Markup.button.callback('Encerrar em 30 dias', 'announce:end:2592000')],
        [Markup.button.callback('Cancelar', 'announce:cancel')],
      ]);
    }
    return Markup.inlineKeyboard([
      [Markup.button.callback('Confirmar aviso automático', 'announce:confirm')],
      [Markup.button.callback('Cancelar', 'announce:cancel')],
    ]);
  }

  private getTomorrowAtBrasiliaNineDelaySeconds() {
    const now = new Date();
    const brasiliaNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const targetBrasilia = new Date(brasiliaNow);
    targetBrasilia.setDate(targetBrasilia.getDate() + 1);
    targetBrasilia.setHours(9, 0, 0, 0);
    return Math.max(60, Math.ceil((targetBrasilia.getTime() - brasiliaNow.getTime()) / 1000));
  }

  private async createScheduledAnnouncement(chatId: number, userId: number, actorName: string, draft: AnnouncementDraft) {
    const now = new Date();
    const startDelaySeconds = draft.startDelaySeconds ?? 0;
    const nextRunAt = new Date(now.getTime() + startDelaySeconds * 1000);
    const endAt = draft.endAfterSeconds == null ? null : new Date(now.getTime() + draft.endAfterSeconds * 1000);

    const targetChatId = draft.targetChatId || this.normalizeTelegramId(chatId);

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ScheduledAnnouncement" ("chatId", "text", "frequencySeconds", "nextRunAt", "endAt", "pinWithNotification", "deleteLastMessage", "createdByTelegramId", "createdByName", "isActive", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      targetChatId,
      draft.text,
      draft.frequencySeconds,
      nextRunAt.toISOString(),
      endAt?.toISOString() || null,
      draft.pinWithNotification ? 1 : 0,
      draft.deleteLastMessage ? 1 : 0,
      this.normalizeTelegramId(userId),
      actorName,
      1,
      now.toISOString(),
      now.toISOString(),
    );

    const [announcement] = (await this.prisma.$queryRawUnsafe(
      'SELECT * FROM "ScheduledAnnouncement" WHERE "chatId" = ? ORDER BY "id" DESC LIMIT 1',
      targetChatId,
    )) as ScheduledAnnouncementRow[];
    if (announcement) this.scheduleAnnouncement(announcement);

    await this.prisma.actionLog.create({
      data: {
        type: 'PANEL_ACTION',
        origin: 'TELEGRAM',
        targetTelegramId: this.normalizeTelegramId(userId),
        reason: `Criou aviso automático no grupo. Administrador: ${actorName}.`,
      },
    });
  }

  private async scheduleActiveAnnouncements() {
    const rows = (await this.prisma.$queryRawUnsafe(
      'SELECT * FROM "ScheduledAnnouncement" WHERE "isActive" = 1',
    )) as ScheduledAnnouncementRow[];
    rows.forEach((row) => this.scheduleAnnouncement(row));
  }

  private scheduleAnnouncement(row: ScheduledAnnouncementRow) {
    const existingTimer = this.announcementTimers.get(row.id);
    if (existingTimer) clearTimeout(existingTimer);

    const delay = Math.max(1000, new Date(row.nextRunAt).getTime() - Date.now());
    const timer = setTimeout(() => void this.runScheduledAnnouncement(row.id), Math.min(delay, 2147483647));
    this.announcementTimers.set(row.id, timer);
  }

  private async runScheduledAnnouncement(id: number) {
    const [row] = (await this.prisma.$queryRawUnsafe(
      'SELECT * FROM "ScheduledAnnouncement" WHERE "id" = ? AND "isActive" = 1',
      id,
    )) as ScheduledAnnouncementRow[];
    if (!row || !this.bot) return;

    const now = new Date();
    if (row.endAt && new Date(row.endAt).getTime() <= now.getTime()) {
      await this.prisma.$executeRawUnsafe('UPDATE "ScheduledAnnouncement" SET "isActive" = 0, "updatedAt" = ? WHERE "id" = ?', now.toISOString(), id);
      return;
    }

    if (row.deleteLastMessage && row.lastMessageId) {
      try {
        await this.bot.telegram.deleteMessage(this.toTelegramNumber(row.chatId), row.lastMessageId);
      } catch (error) {
        this.logger.warn(`Não foi possível apagar aviso anterior: ${error}`);
      }
    }

    const sentMessage = await this.bot.telegram.sendMessage(this.toTelegramNumber(row.chatId), row.text);
    if (row.pinWithNotification) {
      try {
        await this.bot.telegram.pinChatMessage(this.toTelegramNumber(row.chatId), sentMessage.message_id, {
          disable_notification: false,
        });
      } catch (error) {
        this.logger.warn(`Não foi possível fixar aviso automático: ${error}`);
      }
    }

    const nextRunAt = new Date(now.getTime() + row.frequencySeconds * 1000);
    await this.prisma.$executeRawUnsafe(
      'UPDATE "ScheduledAnnouncement" SET "lastMessageId" = ?, "nextRunAt" = ?, "updatedAt" = ? WHERE "id" = ?',
      sentMessage.message_id,
      nextRunAt.toISOString(),
      now.toISOString(),
      id,
    );

    this.scheduleAnnouncement({ ...row, lastMessageId: sentMessage.message_id, nextRunAt: nextRunAt.toISOString() });
  }

  private async loadLastGroup() {
    const lastGroup = await this.prisma.telegramGroup.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (lastGroup) {
      this.groupId = lastGroup.telegramChatId;
      this.logger.log(`Grupo restaurado do banco de dados: ${lastGroup.title} (${this.groupId})`);
    }
  }

  private async ensureGroupReady() {
    await this.ensureBotClient();

    if (!this.groupId) {
      await this.loadLastGroup();
    }

    if (!this.groupId) {
      throw new BadRequestException(
        'Nenhum grupo foi registrado ainda. Adicione o bot ao supergrupo e clique em sincronizar.',
      );
    }
  }

  private normalizeTelegramId(value: string | number | bigint) {
    return String(value);
  }

  private toTelegramNumber(value: string | number | bigint) {
    const normalized = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(normalized)) {
      throw new BadRequestException(`ID do Telegram inválido: ${value}`);
    }
    return normalized;
  }

  private formatDurationLabel(value: number, unit: ModerationDurationUnit) {
    const labels: Record<ModerationDurationUnit, [string, string]> = {
      SECONDS: ['segundo', 'segundos'],
      MINUTES: ['minuto', 'minutos'],
      DAYS: ['dia', 'dias'],
    };

    const [singular, plural] = labels[unit];
    return `${value} ${value === 1 ? singular : plural}`;
  }

  private async formatMemberReference(telegramId: string | number) {
    const normalizedTelegramId = this.normalizeTelegramId(telegramId);
    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId: normalizedTelegramId },
      select: { telegramUsername: true, fullName: true },
    });

    if (member?.telegramUsername) {
      return `@${member.telegramUsername}`;
    }

    const displayName = member?.fullName?.trim();
    if (displayName) {
      return `${displayName} (sem username, ID ${normalizedTelegramId})`;
    }

    return `Sem username (ID ${normalizedTelegramId})`;
  }

  private normalizeForbiddenText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .normalize('NFC')
      .toLowerCase();
  }

  private matchesForbiddenWord(text: string, forbiddenWord: string) {
    const normalizedText = this.normalizeForbiddenText(text);
    const normalizedWord = this.normalizeForbiddenText(forbiddenWord.trim());

    if (!normalizedWord) {
      return false;
    }

    const hasSpecialCharacters = /[^\p{L}\p{N}_\s]/u.test(normalizedWord);
    if (hasSpecialCharacters) {
      return normalizedText.includes(normalizedWord);
    }

    const escapedWord = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapedWord}(?=[^\\p{L}\\p{N}_]|$)`, 'iu').test(normalizedText);
  }

  private async getForbiddenWordRules() {
    return (await this.prisma.$queryRawUnsafe(
      'SELECT "id", "word", "punishment", "durationValue", "durationUnit", "durationSeconds" FROM "ForbiddenWord" ORDER BY "createdAt" DESC',
    )) as ForbiddenWordRule[];
  }

  private async isRegularGroupMember(chatId: number, userId: number) {
    if (!this.bot) {
      return false;
    }

    try {
      const member = await this.bot.telegram.getChatMember(chatId, userId);
      return member.status !== 'creator' && member.status !== 'administrator';
    } catch (error) {
      this.logger.warn(`Não foi possível validar o usuário ${userId} no grupo ${chatId}: ${error}`);
      return true;
    }
  }

  private async buildModerationMessage(options: {
    actionLabel: string;
    telegramId: string | number;
    durationLabel?: string | null;
    reason?: string | null;
  }) {
    const memberReference = await this.formatMemberReference(options.telegramId);
    const normalizedReason = options.reason?.trim() || 'Não informado';
    const normalizedDuration = options.durationLabel?.trim() || 'Não se aplica';

    return [
      'Ação de moderação',
      `Usuário: ${memberReference}`,
      `Tipo da ação: ${options.actionLabel}`,
      `Tempo: ${normalizedDuration}`,
      `Motivo: ${normalizedReason}`,
    ].join('\n');
  }

  private async buildModerationNotice(options: {
    actionLabel: string;
    telegramId: string | number;
    durationLabel?: string | null;
    reason?: string | null;
  }) {
    const memberReference = await this.formatMemberReference(options.telegramId);

    return [
      'Ação de moderação',
      `Usuário: ${memberReference}`,
      `Tipo da ação: ${options.actionLabel}`,
      `Tempo: ${options.durationLabel?.trim() || 'Não se aplica'}`,
      `Motivo: ${options.reason?.trim() || 'Não informado'}`,
    ].join('\n');
  }

  private async buildReversalMessage(action: ModerationReversalAction, options: ReversalMessageOptions = {}) {
    const baseMessage = action === 'unmute' ? 'Usuário ${memberReference} desmutado.' : 'Usuário desbanido.';

    if (options.automatic || !options.manualActorName?.trim()) {
      return baseMessage;
    }

    return `${baseMessage} Administrador: ${options.manualActorName.trim()}.`;
  }

  private async buildMemberReversalMessage(
    action: ModerationReversalAction,
    telegramId: string | number,
    options: ReversalMessageOptions = {},
  ) {
    const memberReference = await this.formatMemberReference(telegramId);
    const baseMessage =
      action === 'unmute' ? `Usuário ${memberReference} desmutado.` : `Usuário ${memberReference} desbanido.`;

    if (options.automatic || !options.manualActorName?.trim()) {
      return baseMessage;
    }

    return `${baseMessage} Administrador: ${options.manualActorName.trim()}.`;
  }

  private buildModerationKeyboard(action: 'unmute' | 'unban', telegramId: string | number) {
    const text = action === 'unban' ? '✅ Desbanir' : '✅ Remover silêncio';
    return Markup.inlineKeyboard([
      Markup.button.callback(text, `moderation:${action}:${this.normalizeTelegramId(telegramId)}`),
    ]);
  }

  private buildModerationActionKeyboard(action: ModerationReversalAction, telegramId: string | number) {
    const text = action === 'unban' ? 'Desbanir' : 'Remover silêncio';
    return Markup.inlineKeyboard([
      Markup.button.callback(text, `moderation:${action}:${this.normalizeTelegramId(telegramId)}`),
    ]);
  }

  private async isAuthorizedCallbackActor(userId: number, chatId: number) {
    if (this.ownerTelegramId && this.normalizeTelegramId(userId) === this.normalizeTelegramId(this.ownerTelegramId)) {
      return true;
    }

    if (!this.bot) {
      return false;
    }

    try {
      const member = await this.bot.telegram.getChatMember(chatId, userId);
      return member.status === 'creator' || member.status === 'administrator';
    } catch (error) {
      this.logger.warn(`Não foi possível validar o usuário ${userId} no grupo ${chatId}: ${error}`);
      return false;
    }
  }

  private formatTelegramActorName(user: any) {
    if (user?.username) {
      return `@${user.username}`;
    }

    return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'administrador';
  }

  private async restoreMemberStatusFromGroupAction(
    action: ModerationReversalAction,
    telegramId: string,
    manualActorName?: string | null,
  ) {
    const member = (await this.prisma.telegramMember.findUnique({
      where: { telegramId },
      select: { id: true, isBot: true, fullName: true },
    }))!;

    if (!member) {
      throw new BadRequestException('Membro não encontrado.');
    }

    if (action === 'unmute') {
      await this.restoreMutedUser(telegramId, { manualActorName });
      await this.prisma.telegramMember.updateMany({
        where: { telegramId },
        data: { status: member?.isBot ? 'BOT' : 'MEMBER', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'UNMUTE',
          origin: 'TELEGRAM',
          targetTelegramId: telegramId,
          targetMemberId: member?.id,
          reason: `Silenciamento removido pelo botão do grupo${member?.fullName ? ` (${member.fullName})` : ''}`,
        },
      });
      return;
    }

    await this.restoreBannedUser(telegramId, { manualActorName });
    await this.prisma.telegramMember.updateMany({
      where: { telegramId },
      data: { status: member?.isBot ? 'BOT' : 'MEMBER', updatedAt: new Date() },
    });
    await this.prisma.actionLog.create({
      data: {
        type: 'UNBAN',
        origin: 'TELEGRAM',
        targetTelegramId: telegramId,
        targetMemberId: member?.id,
        reason: `Banimento removido pelo botão do grupo${member?.fullName ? ` (${member.fullName})` : ''}`,
      },
    });
    return;

    if (action === 'unmute') {
      await this.unmuteUser(telegramId, 'Reversão pelo botão do grupo');
      await this.prisma.telegramMember.updateMany({
        where: { telegramId },
        data: { status: member?.isBot ? 'BOT' : 'MEMBER', updatedAt: new Date() },
      });
      await this.prisma.actionLog.create({
        data: {
          type: 'UNMUTE',
          origin: 'TELEGRAM',
          targetTelegramId: telegramId,
          targetMemberId: member?.id,
          reason: `Silenciamento removido pelo botão do grupo${member?.fullName ? ` (${member.fullName})` : ''}`,
        },
      });
      return;
    }

    await this.unbanUser(telegramId, 'Reversão pelo botão do grupo');
    await this.prisma.telegramMember.updateMany({
      where: { telegramId },
      data: { status: member?.isBot ? 'BOT' : 'MEMBER', updatedAt: new Date() },
    });
    await this.prisma.actionLog.create({
      data: {
        type: 'UNBAN',
        origin: 'TELEGRAM',
        targetTelegramId: telegramId,
        targetMemberId: member?.id,
        reason: `Banimento removido pelo botão do grupo${member?.fullName ? ` (${member.fullName})` : ''}`,
      },
    });
  }

  private async syncGroupMetadata(chatId: string) {
    if (!this.bot) {
      throw new Error('Bot não inicializado.');
    }

    const chat = await this.bot.telegram.getChat(this.toTelegramNumber(chatId));
    await this.registerGroup(chat);
  }

  private async resolveMemberPhotoFileId(telegramId: string) {
    if (!this.bot) {
      return null;
    }

    try {
      const photos = await this.bot.telegram.getUserProfilePhotos(this.toTelegramNumber(telegramId), 0, 1);
      const latestSet = photos.photos?.[0];
      const latestPhoto = latestSet?.[latestSet.length - 1];
      return latestPhoto?.file_id || null;
    } catch (error) {
      this.logger.warn(`Não foi possível consultar a foto do membro ${telegramId}: ${error}`);
      return null;
    }
  }

  private async enforcePublicProfilePhoto(user: any, chatId?: number | string, messageId?: number) {
    if (!this.bot || !chatId || !user || user.is_bot) {
      return true;
    }

    const normalizedChatId = this.normalizeTelegramId(chatId);
    const telegramId = this.normalizeTelegramId(user.id);

    if (await this.isTelegramIdExempt(telegramId)) {
      return true;
    }

    if (!(await this.isRegularGroupMember(this.toTelegramNumber(normalizedChatId), this.toTelegramNumber(telegramId)))) {
      return true;
    }

    const photoFileId = await this.resolveMemberPhotoFileId(telegramId);

    if (photoFileId) {
      await this.storeMember(user, normalizedChatId, 'MEMBER', false);
      await this.prisma.telegramMember.updateMany({
        where: { telegramId },
        data: { photoFileId, updatedAt: new Date() },
      });
      return true;
    }

    if (messageId) {
      try {
        await this.bot.telegram.deleteMessage(this.toTelegramNumber(normalizedChatId), messageId);
      } catch (error) {
        this.logger.warn(`Não foi possível apagar mensagem de membro sem foto: ${error}`);
      }
    }

    await this.removeMemberWithoutBan(telegramId, normalizedChatId, 'Membro removido por não possuir foto de perfil pública.');
    return false;
  }

  private async removeMemberWithoutBan(telegramId: string, chatId: string, reason: string) {
    if (!this.bot) {
      return;
    }

    const member = await this.prisma.telegramMember.findUnique({
      where: { telegramId },
      select: { id: true, fullName: true, isBot: true },
    });

    if (member?.isBot) {
      return;
    }

    try {
      await this.bot.telegram.banChatMember(this.toTelegramNumber(chatId), this.toTelegramNumber(telegramId));
      await this.bot.telegram.unbanChatMember(this.toTelegramNumber(chatId), this.toTelegramNumber(telegramId), {
        only_if_banned: true,
      });
    } catch (error) {
      this.logger.warn(`Não foi possível remover membro sem foto ${telegramId}: ${error}`);
      return;
    }

    await this.prisma.telegramMember.updateMany({
      where: { telegramId },
      data: { status: 'LEFT', photoFileId: null, updatedAt: new Date() },
    });

    await this.prisma.actionLog.create({
      data: {
        type: 'REMOVE',
        origin: 'TELEGRAM',
        targetTelegramId: telegramId,
        targetMemberId: member?.id,
        reason,
      },
    });

    await this.syncGroupMemberCount(this.toTelegramNumber(chatId));
  }

  private async scanKnownMembersWithoutPublicPhoto(chatId: string) {
    if (this.profilePhotoScanCompletedForGroupId === chatId) {
      return;
    }

    this.profilePhotoScanCompletedForGroupId = chatId;
    const members = await this.prisma.telegramMember.findMany({
      where: {
        isBot: false,
        status: { in: ['MEMBER', 'MUTED'] },
      },
      select: {
        telegramId: true,
      },
    });

    let removedCount = 0;
    for (const member of members) {
      if (await this.isTelegramIdExempt(member.telegramId)) {
        continue;
      }

      if (!(await this.isRegularGroupMember(this.toTelegramNumber(chatId), this.toTelegramNumber(member.telegramId)))) {
        continue;
      }

      const photoFileId = await this.resolveMemberPhotoFileId(member.telegramId);
      if (photoFileId) {
        await this.prisma.telegramMember.updateMany({
          where: { telegramId: member.telegramId },
          data: { photoFileId, updatedAt: new Date() },
        });
        continue;
      }

      await this.removeMemberWithoutBan(
        member.telegramId,
        chatId,
        'Membro removido na varredura inicial por não possuir foto de perfil pública.',
      );
      removedCount += 1;
    }

    this.logger.log(`Varredura de foto pública concluída. Membros removidos: ${removedCount}.`);
  }

  private async getTelegramFileDataUrl(fileId: string) {
    if (!this.bot) {
      throw new Error('Bot não inicializado.');
    }

    const [cachedPhoto] = (await this.prisma.$queryRawUnsafe(
      'SELECT "dataUrl" FROM "PhotoCache" WHERE "fileId" = ?',
      fileId,
    )) as Array<{ dataUrl: string }>;
    if (cachedPhoto?.dataUrl) {
      return cachedPhoto.dataUrl;
    }

    const fileUrl = await this.bot.telegram.getFileLink(fileId);
    const response = await fetch(fileUrl.toString());

    if (!response.ok) {
      throw new Error(`Falha ao baixar arquivo do Telegram (${response.status}).`);
    }

    const headerContentType = response.headers.get('content-type');
    const normalizedUrl = fileUrl.toString().toLowerCase();
    const contentType =
      headerContentType && headerContentType !== 'application/octet-stream'
        ? headerContentType
        : normalizedUrl.endsWith('.png')
          ? 'image/png'
          : normalizedUrl.endsWith('.webp')
            ? 'image/webp'
            : 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
    const now = new Date().toISOString();

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "PhotoCache" ("fileId", "dataUrl", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?)
       ON CONFLICT("fileId") DO UPDATE SET "dataUrl" = excluded."dataUrl", "updatedAt" = excluded."updatedAt"`,
      fileId,
      dataUrl,
      now,
      now,
    );

    return dataUrl;
  }

  private initializeBot() {
    this.bot?.start(async (ctx) => {
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;
      const canUseAnnouncements = chatId && userId ? await this.canUseAnnouncementAssistant(userId, chatId) : false;

      await ctx.reply(
        [
          'Bot de moderação conectado.',
          '',
          'Eu ajudo a proteger o grupo contra palavras proibidas, flood, bots inline não permitidos e membros sem foto pública.',
          'Também registro logs das ações de moderação para auditoria no painel.',
          '',
          'Use o painel para configurar punições, permissões e regras automáticas.',
        ].join('\n'),
        canUseAnnouncements
          ? Markup.inlineKeyboard([[Markup.button.callback('Criar aviso automático', 'announce:create')]])
          : undefined,
      );
    });

    this.bot?.on('my_chat_member', async (ctx) => {
      const chat = ctx.update.my_chat_member?.chat;
      if (!chat) {
        return;
      }

      const newStatus = ctx.update.my_chat_member?.new_chat_member?.status;
      if (newStatus === 'administrator' || newStatus === 'member') {
        await this.registerGroup(chat);
        await this.syncGroupMembers(this.normalizeTelegramId(chat.id));
        await this.scanKnownMembersWithoutPublicPhoto(this.normalizeTelegramId(chat.id));
        await ctx.telegram.sendMessage(chat.id, 'Bot adicionado ao grupo com sucesso. Sincronizando dados...');
      }
    });

    this.bot?.on('new_chat_members', async (ctx) => {
      const chat = ctx.chat;
      const members = ctx.message?.new_chat_members || [];
      for (const member of members) {
        if (!member.is_bot) {
          await this.storeMember(member, this.normalizeTelegramId(chat.id), 'MEMBER', true);
          await this.logEvent('JOIN', member.id, chat.id);
          await this.enforcePublicProfilePhoto(member, chat.id);
        }
      }
      await this.syncGroupMemberCount(chat.id);
    });

    this.bot?.on('left_chat_member', async (ctx) => {
      const chat = ctx.chat;
      const member = ctx.message?.left_chat_member;
      if (!member) {
        return;
      }

      await this.prisma.telegramMember.updateMany({
        where: { telegramId: this.normalizeTelegramId(member.id) },
        data: { status: 'LEFT', updatedAt: new Date() },
      });
      await this.logEvent('LEAVE', member.id, chat.id);
      await this.syncGroupMemberCount(chat.id);
    });

    this.bot?.on('message', async (ctx) => {
      const message = ctx.message as Message.TextMessage | Message.PhotoMessage | any;
      const from = message?.from;
      if (!from) {
        return;
      }

      if (await this.handleFreeCommand(message, ctx.chat?.id)) {
        return;
      }

      if (await this.handleAnnouncementCommand(message, ctx.chat?.id)) {
        return;
      }

      if (await this.handleAnnouncementTextInput(message, ctx.chat?.id)) {
        return;
      }

      const isExempt = await this.isTelegramIdExempt(from.id);
      if (isExempt) {
        await this.storeMessageStats(from, ctx.chat?.id);
        return;
      }

      const settings = await this.moderationSettingsService.getSettings();

      const hasPublicPhoto = await this.enforcePublicProfilePhoto(from, ctx.chat?.id, message.message_id);
      if (!hasPublicPhoto) {
        return;
      }

      const inlineModerated = await this.moderateInlineBotMessage(message, ctx.chat?.id, settings);
      if (inlineModerated) {
        return;
      }

      const moderated = await this.moderateForbiddenWordMessage(message, ctx.chat?.id);
      if (moderated) {
        return;
      }

      const floodModerated = await this.moderateFloodMessage(message, ctx.chat?.id, settings);
      if (floodModerated) {
        return;
      }

      await this.storeMessageStats(from, ctx.chat?.id);
    });

    this.bot?.action(/^moderation:(unmute|unban):(-?\d+)$/, async (ctx: any) => {
      const action = ctx.match?.[1] as 'unmute' | 'unban';
      const telegramId = ctx.match?.[2] as string;
      const requesterId = ctx.from?.id;
      const chatId = ctx.chat?.id;

      if (!action || !telegramId || !requesterId || !chatId) {
        await ctx.answerCbQuery('Não foi possível concluir essa ação agora.', { show_alert: true });
        return;
      }

      if (!(await this.isAuthorizedCallbackActor(requesterId, chatId))) {
        await ctx.answerCbQuery('Apenas o owner ou administradores podem usar este botão.', {
          show_alert: true,
        });
        return;
      }

      try {
        await this.restoreMemberStatusFromGroupAction(action, telegramId, this.formatTelegramActorName(ctx.from));

        try {
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
        } catch (error) {
          this.logger.warn(`Não foi possível remover o botão de moderação da mensagem: ${error}`);
        }

        await ctx.answerCbQuery(action === 'unban' ? 'Membro desbanido.' : 'Silêncio removido.');
      } catch (error) {
        this.logger.error(`Erro ao processar botão de moderação do grupo: ${error}`);
        await ctx.answerCbQuery('Não foi possível concluir a ação.', { show_alert: true });
      }
    });

    this.bot?.action(/^announce:(create|frequency|pin|delete|end|confirm|cancel)(?::(.+))?$/, async (ctx: any) => {
      const command = ctx.match?.[1] as string;
      const value = ctx.match?.[2] as string | undefined;
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;
      const key = chatId && userId ? this.getAnnouncementDraftKey(chatId, userId) : '';
      const draftForAccess = key ? this.announcementDrafts.get(key) : null;
      const targetChatId = draftForAccess?.targetChatId
        ? this.toTelegramNumber(draftForAccess.targetChatId)
        : chatId
          ? await this.resolveAnnouncementTargetChatId(chatId)
          : null;

      if (!chatId || !userId || !targetChatId || !(await this.getAnnouncementAssistantAccess(userId, targetChatId)).allowed) {
        await ctx.answerCbQuery('Essa opção está disponível apenas para owner/sub dono com permissão de administrador.', {
          show_alert: true,
        });
        return;
      }

      if (command === 'cancel') {
        this.announcementDrafts.delete(key);
        await ctx.editMessageText('Criação de aviso automático cancelada.');
        return;
      }

      if (command === 'create') {
        this.announcementDrafts.set(key, { step: 'text', targetChatId: this.normalizeTelegramId(targetChatId) });
        await ctx.editMessageText('Envie agora o texto do aviso automático. Depois disso, as próximas escolhas serão por botões.');
        return;
      }

      const draft = this.announcementDrafts.get(key);
      if (!draft) {
        await ctx.answerCbQuery('Comece novamente pelo /start.', { show_alert: true });
        return;
      }

      if (command === 'frequency') {
        draft.frequencySeconds = Number(value);
        draft.step = 'start';
        await ctx.editMessageText('Quando o aviso deve começar? Horário considerado: Brasília.', this.buildAnnouncementKeyboard('start'));
        return;
      }

      if (command === 'pin') {
        draft.pinWithNotification = value === 'yes';
        draft.step = 'delete';
        await ctx.editMessageText('Quando enviar um novo aviso, devo apagar o aviso anterior?', this.buildAnnouncementKeyboard('delete'));
        return;
      }

      if (command === 'delete') {
        draft.deleteLastMessage = value !== 'no';
        draft.step = 'end';
        await ctx.editMessageText('Quando esse aviso automático deve terminar?', this.buildAnnouncementKeyboard('end'));
        return;
      }

      if (command === 'end') {
        draft.endAfterSeconds = value === 'never' ? null : Number(value);
        draft.step = 'confirm';
        await ctx.editMessageText('Revise e confirme o aviso automático.', this.buildAnnouncementKeyboard('confirm'));
        return;
      }

      if (command === 'confirm') {
        await this.createScheduledAnnouncement(chatId, userId, this.formatTelegramActorName(ctx.from), draft);
        this.announcementDrafts.delete(key);
        await ctx.editMessageText('Aviso automático criado com sucesso.');
        return;
      }
    });

    this.bot?.action(/^announce:start:(.+)$/, async (ctx: any) => {
      const value = ctx.match?.[1] as string;
      const chatId = ctx.chat?.id;
      const userId = ctx.from?.id;
      if (!chatId || !userId) return;
      const key = this.getAnnouncementDraftKey(chatId, userId);
      const draft = this.announcementDrafts.get(key);
      if (!draft) return;
      const targetChatId = draft.targetChatId ? this.toTelegramNumber(draft.targetChatId) : await this.resolveAnnouncementTargetChatId(chatId);
      if (!targetChatId || !(await this.getAnnouncementAssistantAccess(userId, targetChatId)).allowed) {
        await ctx.answerCbQuery('Sem permissão para configurar aviso automático.', { show_alert: true });
        return;
      }
      draft.startDelaySeconds = value === 'tomorrow9' ? this.getTomorrowAtBrasiliaNineDelaySeconds() : Number(value);
      draft.step = 'pin';
      await ctx.editMessageText('O aviso deve ser fixado no grupo?', this.buildAnnouncementKeyboard('pin'));
    });

    this.logger.log('Bot Telegram configurado.');
  }

  private async registerGroup(chat: any) {
    const chatId = this.normalizeTelegramId(chat.id);
    const title = chat.title || chat.first_name || 'Sem nome';
    const username = chat.username || null;
    const description = chat.description || null;
    const photoId = chat.photo?.big_file_id || null;
    const isPrivate = chat.type === 'private' || chat.type === 'supergroup';

    try {
      await this.prisma.telegramGroup.upsert({
        where: { telegramChatId: chatId },
        create: {
          telegramChatId: chatId,
          title,
          username,
          description,
          photoFileId: photoId,
          memberCount: 0,
          isPrivate,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        update: {
          title,
          username,
          description,
          photoFileId: photoId,
          isPrivate,
          updatedAt: new Date(),
        },
      });
      this.groupId = chatId;
      this.logger.log(`Grupo registrado: ${title} (${chatId})`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erro ao registrar grupo: ${error}`);
    }
  }

  private async syncGroupMembers(chatId: string) {
    if (!this.bot) {
      throw new Error('Bot não inicializado.');
    }

    try {
      await this.syncGroupMetadata(chatId);
      const admins = await this.bot.telegram.getChatAdministrators(this.toTelegramNumber(chatId));

      for (const admin of admins) {
        if ('user' in admin) {
          await this.storeMember(admin.user, chatId, 'ADMIN', true);
        }
      }

      await this.syncGroupMemberCount(chatId);
      this.lastSyncAt = new Date();
      this.lastError = null;
      this.logger.log(`${admins.length} administradores sincronizados.`);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erro ao sincronizar membros do grupo: ${error}`);
    }
  }

  private async storeMember(user: any, _chatId: string, status: string = 'MEMBER', refreshPhoto: boolean = false) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const resolvedStatus = user.is_bot ? 'BOT' : status.toUpperCase();
    const telegramId = this.normalizeTelegramId(user.id);

    try {
      const existingMember = await this.prisma.telegramMember.findUnique({
        where: { telegramId },
        select: { photoFileId: true },
      });

      const photoFileId =
        !user.is_bot && (refreshPhoto || !existingMember?.photoFileId)
          ? await this.resolveMemberPhotoFileId(telegramId)
          : existingMember?.photoFileId || null;

      await this.prisma.telegramMember.upsert({
        where: { telegramId },
        update: {
          telegramUsername: user.username || null,
          fullName,
          photoFileId: photoFileId ?? existingMember?.photoFileId ?? null,
          status: resolvedStatus,
          isBot: user.is_bot || false,
          updatedAt: new Date(),
        },
        create: {
          telegramId,
          telegramUsername: user.username || null,
          fullName,
          photoFileId,
          status: resolvedStatus,
          isBot: user.is_bot || false,
          messageCount: 0,
          firstMessageAt: null,
          lastMessageAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`Erro ao armazenar membro ${user.id}: ${error}`);
    }
  }

  private async storeMessageStats(user: any, chatId?: number) {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();

    try {
      await this.prisma.telegramMember.upsert({
        where: { telegramId: this.normalizeTelegramId(user.id) },
        update: {
          telegramUsername: user.username || null,
          fullName,
          lastMessageAt: new Date(),
          messageCount: { increment: 1 },
          updatedAt: new Date(),
        },
        create: {
          telegramId: this.normalizeTelegramId(user.id),
          telegramUsername: user.username || null,
          fullName,
          photoFileId: null,
          status: user.is_bot ? 'BOT' : 'MEMBER',
          isBot: user.is_bot || false,
          messageCount: 1,
          firstMessageAt: new Date(),
          lastMessageAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (chatId && !this.groupId) {
        this.groupId = this.normalizeTelegramId(chatId);
      }
    } catch (error) {
      this.logger.error(`Erro ao atualizar stats do membro ${user.id}: ${error}`);
    }
  }

  async muteUser(
    telegramId: string | number,
    durationSeconds: number,
    reason: string,
    durationValue: number,
    durationUnit: ModerationDurationUnit,
  ) {
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;
    const untilDate = Math.floor(Date.now() / 1000) + durationSeconds;
    const durationLabel = this.formatDurationLabel(durationValue, durationUnit);

    await bot.telegram.restrictChatMember(this.toTelegramNumber(groupId), this.toTelegramNumber(telegramId), {
      permissions: { can_send_messages: false },
      until_date: untilDate,
    });
    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      await this.buildModerationNotice({
        actionLabel: 'Silenciamento',
        telegramId,
        durationLabel,
        reason,
      }),
      {
        reply_markup: this.buildModerationActionKeyboard('unmute', telegramId).reply_markup,
      },
    );
    this.scheduleModerationExpiration('unmute', telegramId, durationSeconds);
  }

  async banUser(
    telegramId: string | number,
    durationSeconds: number | null,
    reason: string,
    durationValue?: number | null,
    durationUnit?: ModerationDurationUnit | null,
  ) {
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;
    const untilDate = durationSeconds ? Math.floor(Date.now() / 1000) + durationSeconds : undefined;
    const durationLabel =
      durationSeconds && durationValue && durationUnit ? this.formatDurationLabel(durationValue, durationUnit) : null;

    await bot.telegram.banChatMember(this.toTelegramNumber(groupId), this.toTelegramNumber(telegramId), untilDate);
    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      await this.buildModerationNotice({
        actionLabel: 'Banimento',
        telegramId,
        durationLabel: durationLabel || 'Permanente',
        reason,
      }),
      {
        reply_markup: this.buildModerationActionKeyboard('unban', telegramId).reply_markup,
      },
    );
    this.scheduleModerationExpiration('unban', telegramId, durationSeconds);
  }

  async restoreMutedUser(telegramId: string | number, options: ReversalMessageOptions = {}) {
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;

    this.cancelModerationTimer('unmute', telegramId);

    await bot.telegram.restrictChatMember(this.toTelegramNumber(groupId), this.toTelegramNumber(telegramId), {
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
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false,
        can_manage_topics: false,
      },
    });

    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      await this.buildMemberReversalMessage('unmute', telegramId, options),
    );
  }

  async restoreBannedUser(telegramId: string | number, options: ReversalMessageOptions = {}) {
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;

    this.cancelModerationTimer('unban', telegramId);

    await bot.telegram.unbanChatMember(this.toTelegramNumber(groupId), this.toTelegramNumber(telegramId), {
      only_if_banned: true,
    });

    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      await this.buildMemberReversalMessage('unban', telegramId, options),
    );
  }

  async unmuteUser(telegramId: string | number, reason: string = 'Reversão manual pelo painel') {
    return this.restoreMutedUser(telegramId);
    
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;

    await bot.telegram.restrictChatMember(this.toTelegramNumber(groupId), this.toTelegramNumber(telegramId), {
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
        can_change_info: false,
        can_invite_users: true,
        can_pin_messages: false,
        can_manage_topics: false,
      },
    });
    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      await this.buildModerationMessage({
        actionLabel: 'Remoção de silêncio',
        telegramId,
        durationLabel: 'Encerrado manualmente',
        reason,
      }),
    );
  }

  async unbanUser(telegramId: string | number, reason: string = 'Reversão manual pelo painel') {
    return this.restoreBannedUser(telegramId);
    
    await this.ensureGroupReady();
    const bot = this.bot!;
    const groupId = this.groupId!;

    await bot.telegram.unbanChatMember(this.toTelegramNumber(groupId), this.toTelegramNumber(telegramId), {
      only_if_banned: true,
    });
    await bot.telegram.sendMessage(
      this.toTelegramNumber(groupId),
      await this.buildModerationMessage({
        actionLabel: 'Remoção de banimento',
        telegramId,
        durationLabel: 'Encerrado manualmente',
        reason,
      }),
    );
  }

  async syncCurrentGroup(actorId?: number) {
    await this.ensureBotClient();

    if (!this.groupId) {
      await this.loadLastGroup();
    }

    if (!this.groupId) {
      return this.getGroupInfo();
    }

    await this.syncGroupMembers(this.groupId);
    await this.scanKnownMembersWithoutPublicPhoto(this.groupId);
    if (actorId) {
      await this.prisma.actionLog.create({
        data: {
          type: 'PANEL_ACTION',
          origin: 'PANEL',
          actorId,
          reason: 'Sincronizou os dados do grupo pelo painel.',
        },
      });
    }
    return this.getGroupInfo();
  }

  async getGroupInfo() {
    if (!this.groupId) {
      await this.loadLastGroup();
    }

    return this.prisma.telegramGroup.findFirst({ orderBy: { createdAt: 'desc' } });
  }

  async getGroupPhotoDataUrl() {
    await this.ensureBotClient();

    let group = await this.getGroupInfo();

    if (!group?.photoFileId && this.groupId) {
      await this.syncGroupMetadata(this.groupId);
      group = await this.getGroupInfo();
    }

    if (!group?.photoFileId) {
      return null;
    }

    return this.getTelegramFileDataUrl(group.photoFileId);
  }

  async getMemberPhotoDataUrl(memberId: number) {
    await this.ensureBotClient();

    const member = await this.prisma.telegramMember.findUnique({
      where: { id: memberId },
      select: { id: true, telegramId: true, photoFileId: true, isBot: true },
    });

    if (!member) {
      return null;
    }

    let photoFileId = member.photoFileId;

    if (!photoFileId && !member.isBot) {
      photoFileId = await this.resolveMemberPhotoFileId(member.telegramId);

      if (photoFileId) {
        await this.prisma.telegramMember.update({
          where: { id: member.id },
          data: { photoFileId, updatedAt: new Date() },
        });
      }
    }

    if (!photoFileId) {
      return null;
    }

    return this.getTelegramFileDataUrl(photoFileId);
  }

  getStatus() {
    return {
      tokenConfigured: this.hasValidToken(),
      botUsername: this.botUsername,
      clientReady: !!this.bot,
      botReady: this.botIsReady,
      groupId: this.groupId,
      ownerTelegramId: this.ownerTelegramId,
      lastError: this.lastError,
      lastSyncAt: this.lastSyncAt,
    };
  }

  async clearStoredData(actorId?: number) {
    const memberIds = (
      await this.prisma.telegramMember.findMany({
        select: { id: true },
      })
    ).map((member: { id: number }) => member.id);

    const logWhere =
      memberIds.length > 0
        ? {
            OR: [{ origin: 'TELEGRAM' }, { targetMemberId: { in: memberIds } }, { targetTelegramId: { not: null } }],
          }
        : {
            OR: [{ origin: 'TELEGRAM' }, { targetTelegramId: { not: null } }],
          };

    const [deletedLogs, deletedMembers, deletedGroups] = await this.prisma.$transaction([
      this.prisma.actionLog.deleteMany({ where: logWhere }),
      this.prisma.telegramMember.deleteMany(),
      this.prisma.telegramGroup.deleteMany(),
    ]);

    this.groupId = null;
    this.lastSyncAt = null;
    this.lastError = null;

    if (actorId) {
      await this.prisma.actionLog.create({
        data: {
          type: 'PANEL_ACTION',
          origin: 'PANEL',
          actorId,
          reason: 'Limpeza completa dos dados do bot executada pelo owner',
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
    try {
      const targetMember = await this.prisma.telegramMember.findUnique({
        where: { telegramId: this.normalizeTelegramId(telegramId) },
        select: { id: true },
      });

      await this.prisma.actionLog.create({
        data: {
          type,
          origin: 'TELEGRAM',
          targetTelegramId: this.normalizeTelegramId(telegramId),
          targetMemberId: targetMember?.id,
          reason: `Evento ${type} capturado no chat ${chatId}`,
        },
      });
    } catch (error) {
      this.logger.error(`Erro ao registrar evento do Telegram: ${error}`);
    }
  }

  private async syncGroupMemberCount(chatId: string | number) {
    if (!this.bot) {
      return;
    }

    try {
      const normalizedChatId = this.normalizeTelegramId(chatId);
      const memberCount = await this.bot.telegram.getChatMembersCount(this.toTelegramNumber(normalizedChatId));
      await this.prisma.telegramGroup.updateMany({
        where: { telegramChatId: normalizedChatId },
        data: { memberCount, updatedAt: new Date() },
      });
    } catch (error) {
      this.logger.warn(`Não foi possível atualizar a contagem de membros do grupo ${chatId}: ${error}`);
    }
  }
}
