import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { UpdateModerationSettingsDto } from './dto/update-moderation-settings.dto';

export type ModerationPunishment = 'WARNING' | 'MUTE' | 'BAN';
export type ModerationDurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';

export type ModerationSettings = {
  floodEnabled: boolean;
  floodMessageLimit: number;
  floodTimeWindowSeconds: number;
  floodPunishment: ModerationPunishment;
  floodDurationValue: number;
  floodDurationUnit: ModerationDurationUnit;
  inlineBotsEnabled: boolean;
  allowedInlineBots: string[];
  inlineBotPunishment: ModerationPunishment;
  inlineBotDurationValue: number;
  inlineBotDurationUnit: ModerationDurationUnit;
  scheduledAnnouncementsEnabled: boolean;
};

const SETTINGS_KEY = 'moderation';

export const defaultModerationSettings: ModerationSettings = {
  floodEnabled: false,
  floodMessageLimit: 5,
  floodTimeWindowSeconds: 10,
  floodPunishment: 'MUTE',
  floodDurationValue: 10,
  floodDurationUnit: 'MINUTES',
  inlineBotsEnabled: true,
  allowedInlineBots: [],
  inlineBotPunishment: 'WARNING',
  inlineBotDurationValue: 10,
  inlineBotDurationUnit: 'MINUTES',
  scheduledAnnouncementsEnabled: false,
};

@Injectable()
export class ModerationSettingsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(): Promise<ModerationSettings> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ value: string }>>(
      'SELECT "value" FROM "ModerationSetting" WHERE "key" = ?',
      SETTINGS_KEY,
    );

    if (!rows[0]?.value) return defaultModerationSettings;

    try {
      return this.normalizeSettings(JSON.parse(rows[0].value));
    } catch {
      return defaultModerationSettings;
    }
  }

  async updateSettings(dto: UpdateModerationSettingsDto, actorId?: number) {
    const current = await this.getSettings();
    const next = this.normalizeSettings({ ...current, ...dto });
    const now = new Date().toISOString();

    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "ModerationSetting" ("key", "value", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?)
       ON CONFLICT("key") DO UPDATE SET "value" = excluded."value", "updatedAt" = excluded."updatedAt"`,
      SETTINGS_KEY,
      JSON.stringify(next),
      now,
      now,
    );

    if (actorId) {
      await this.prisma.actionLog.create({
        data: {
          type: 'PANEL_ACTION',
          origin: 'PANEL',
          actorId,
          reason: 'Atualizou as configurações de flood e bots inline.',
        },
      });
    }

    return next;
  }

  private normalizeSettings(value: any): ModerationSettings {
    const merged = { ...defaultModerationSettings, ...value };
    const floodPunishment = ['WARNING', 'MUTE', 'BAN'].includes(merged.floodPunishment)
      ? merged.floodPunishment
      : defaultModerationSettings.floodPunishment;
    const inlineBotPunishment = ['WARNING', 'MUTE', 'BAN'].includes(merged.inlineBotPunishment)
      ? merged.inlineBotPunishment
      : defaultModerationSettings.inlineBotPunishment;
    const floodDurationUnit = ['SECONDS', 'MINUTES', 'DAYS'].includes(merged.floodDurationUnit)
      ? merged.floodDurationUnit
      : defaultModerationSettings.floodDurationUnit;
    const inlineBotDurationUnit = ['SECONDS', 'MINUTES', 'DAYS'].includes(merged.inlineBotDurationUnit)
      ? merged.inlineBotDurationUnit
      : defaultModerationSettings.inlineBotDurationUnit;
    return {
      ...merged,
      floodPunishment,
      inlineBotPunishment,
      floodDurationUnit,
      inlineBotDurationUnit,
      floodMessageLimit: Math.max(1, Number(merged.floodMessageLimit) || defaultModerationSettings.floodMessageLimit),
      floodTimeWindowSeconds: Math.max(
        1,
        Number(merged.floodTimeWindowSeconds) || defaultModerationSettings.floodTimeWindowSeconds,
      ),
      floodDurationValue: Math.max(1, Number(merged.floodDurationValue) || defaultModerationSettings.floodDurationValue),
      inlineBotDurationValue: Math.max(
        1,
        Number(merged.inlineBotDurationValue) || defaultModerationSettings.inlineBotDurationValue,
      ),
      allowedInlineBots: Array.from(
        new Set(
          (merged.allowedInlineBots || [])
            .map((bot: string) => bot.replace(/^@/, '').trim().toLowerCase())
            .filter(Boolean),
        ),
      ),
    };
  }
}
