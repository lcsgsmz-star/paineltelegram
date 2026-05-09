import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

const logActorSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
} as const;

const logTargetMemberSelect = {
  id: true,
  telegramId: true,
  telegramUsername: true,
  fullName: true,
  photoFileId: true,
  status: true,
  isBot: true,
  messageCount: true,
} as const;

@Injectable()
export class LogsService {
  constructor(private prisma: PrismaService) {}

  async list(filters: any = {}) {
    const where: any = {};
    if (filters.type) where.type = filters.type.toUpperCase();
    if (filters.actorId) where.actorId = Number(filters.actorId);
    if (filters.targetMemberId) where.targetMemberId = Number(filters.targetMemberId);
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {};
      if (filters.fromDate) where.createdAt.gte = new Date(filters.fromDate);
      if (filters.toDate) where.createdAt.lte = new Date(filters.toDate);
    }

    return this.prisma.actionLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: logActorSelect },
        targetMember: { select: logTargetMemberSelect },
      },
    });
  }
}
