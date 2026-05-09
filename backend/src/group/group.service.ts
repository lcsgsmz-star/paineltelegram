import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { BotService } from '../bot/bot.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService, private botService: BotService) {}

  async getGroup() {
    return this.prisma.telegramGroup.findFirst({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getGroupPhoto() {
    return {
      dataUrl: await this.botService.getGroupPhotoDataUrl(),
    };
  }

  async getGroupStats() {
    const group = await this.getGroup();
    if (!group) {
      return null;
    }

    const [trackedMemberCount, activeMemberCount, adminCount, botCount, mutedCount, bannedCount, aggregate] =
      await Promise.all([
        this.prisma.telegramMember.count(),
        this.prisma.telegramMember.count({
          where: {
            isBot: false,
            status: { notIn: ['BANNED', 'LEFT'] },
          },
        }),
        this.prisma.telegramMember.count({ where: { status: 'ADMIN' } }),
        this.prisma.telegramMember.count({ where: { isBot: true } }),
        this.prisma.telegramMember.count({ where: { status: 'MUTED' } }),
        this.prisma.telegramMember.count({ where: { status: 'BANNED' } }),
        this.prisma.telegramMember.aggregate({
          where: { isBot: false },
          _sum: { messageCount: true },
        }),
      ]);

    return {
      ...group,
      memberCount: group.memberCount ?? activeMemberCount,
      trackedMemberCount,
      activeMemberCount,
      adminCount,
      botCount,
      mutedCount,
      bannedCount,
      capturedMessageCount: aggregate._sum.messageCount ?? 0,
    };
  }
}
