import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BotService } from '../bot/bot.service';
import { ModerationActionDto } from './dto/moderation-action.dto';

type DurationUnit = 'SECONDS' | 'MINUTES' | 'DAYS';

type ResolvedDuration = {
  value: number;
  unit: DurationUnit;
  seconds: number;
  minutesForLegacyField: number;
};

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService, private botService: BotService) {}

  async list(filters: any = {}) {
    const where: any = {};

    if (filters.type) {
      const normalizedType = String(filters.type).toUpperCase();
      if (normalizedType === 'BOT') where.isBot = true;
      if (normalizedType === 'HUMAN') where.isBot = false;
    }

    if (filters.status) where.status = String(filters.status).toUpperCase();
    if (filters.query) {
      where.OR = [
        { telegramUsername: { contains: filters.query } },
        { fullName: { contains: filters.query } },
      ];
    }

    return this.prisma.telegramMember.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { messageCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findById(id: number) {
    const member = await this.prisma.telegramMember.findUnique({
      where: { id },
      include: {
        actionLogs: {
          orderBy: { createdAt: 'desc' },
          include: {
            actor: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    return member;
  }

  async getPhoto(memberId: number) {
    const member = await this.prisma.telegramMember.findUnique({
      where: { id: memberId },
      select: { id: true },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    return {
      dataUrl: await this.botService.getMemberPhotoDataUrl(memberId),
    };
  }

  async muteMember(memberId: number, dto: ModerationActionDto, actorId: number) {
    const member = await this.prisma.telegramMember.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    const duration = this.resolveDuration(dto, true) || this.buildDuration(60, 'MINUTES');

    await this.botService.muteUser(member.telegramId, duration.seconds, dto.reason, duration.value, duration.unit);
    await this.prisma.telegramMember.update({
      where: { id: memberId },
      data: { status: 'MUTED' },
    });

    return this.prisma.actionLog.create({
      data: {
        type: 'MUTE',
        actorId,
        targetMemberId: memberId,
        reason: dto.reason,
        durationMinutes: duration.minutesForLegacyField,
        durationValue: duration.value,
        durationUnit: duration.unit,
        durationSeconds: duration.seconds,
        origin: 'PANEL',
      },
    });
  }

  async banMember(memberId: number, dto: ModerationActionDto, actorId: number) {
    const member = await this.prisma.telegramMember.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    const duration = this.resolveDuration(dto, false);

    await this.botService.banUser(
      member.telegramId,
      duration?.seconds ?? null,
      dto.reason,
      duration?.value ?? null,
      duration?.unit ?? null,
    );
    await this.prisma.telegramMember.update({
      where: { id: memberId },
      data: { status: 'BANNED' },
    });

    return this.prisma.actionLog.create({
      data: {
        type: 'BAN',
        actorId,
        targetMemberId: memberId,
        reason: dto.reason,
        durationMinutes: duration?.minutesForLegacyField ?? null,
        durationValue: duration?.value ?? null,
        durationUnit: duration?.unit ?? null,
        durationSeconds: duration?.seconds ?? null,
        origin: 'PANEL',
      },
    });
  }

  async warnMember(memberId: number, dto: ModerationActionDto, actorId: number) {
    const member = await this.prisma.telegramMember.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    return this.botService.warnUser(member.telegramId, dto.reason, actorId, 'PANEL');
  }

  async unmuteMember(memberId: number, actorId: number) {
    const member = await this.prisma.telegramMember.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    const actorName = await this.getActorName(actorId);
    await this.botService.restoreMutedUser(member.telegramId, { manualActorName: actorName });
    await this.prisma.telegramMember.update({
      where: { id: memberId },
      data: { status: member.isBot ? 'BOT' : 'MEMBER' },
    });

    return this.prisma.actionLog.create({
      data: {
        type: 'UNMUTE',
        actorId,
        targetMemberId: memberId,
        origin: 'PANEL',
        reason: `Silenciamento removido de ${member.fullName}`,
      },
    });
  }

  async unbanMember(memberId: number, actorId: number) {
    const member = await this.prisma.telegramMember.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    const actorName = await this.getActorName(actorId);
    await this.botService.restoreBannedUser(member.telegramId, { manualActorName: actorName });
    await this.prisma.telegramMember.update({
      where: { id: memberId },
      data: { status: member.isBot ? 'BOT' : 'MEMBER' },
    });

    return this.prisma.actionLog.create({
      data: {
        type: 'UNBAN',
        actorId,
        targetMemberId: memberId,
        origin: 'PANEL',
        reason: `Banimento removido de ${member.fullName}`,
      },
    });
  }

  private resolveDuration(dto: ModerationActionDto, required: boolean): ResolvedDuration | null {
    const legacyMinutes = dto.minutes;
    const rawValue = dto.durationValue ?? legacyMinutes;

    if (rawValue == null) {
      if (required) {
        return this.buildDuration(60, 'MINUTES');
      }
      return null;
    }

    const rawUnit = dto.durationValue != null ? dto.durationUnit : 'MINUTES';
    const normalizedUnit = this.normalizeDurationUnit(rawUnit);
    return this.buildDuration(rawValue, normalizedUnit);
  }

  private async getActorName(actorId: number) {
    const actor = await this.prisma.panelUser.findUnique({
      where: { id: actorId },
      select: { username: true, email: true },
    });

    return actor?.username || actor?.email || 'administrador';
  }

  private normalizeDurationUnit(value?: string): DurationUnit {
    const normalized = String(value || 'MINUTES').toUpperCase();

    if (normalized === 'SECONDS' || normalized === 'MINUTES' || normalized === 'DAYS') {
      return normalized;
    }

    return 'MINUTES';
  }

  private buildDuration(value: number, unit: DurationUnit): ResolvedDuration {
    const multipliers: Record<DurationUnit, number> = {
      SECONDS: 1,
      MINUTES: 60,
      DAYS: 86400,
    };

    const seconds = value * multipliers[unit];

    return {
      value,
      unit,
      seconds,
      minutesForLegacyField: Math.max(1, Math.ceil(seconds / 60)),
    };
  }
}
