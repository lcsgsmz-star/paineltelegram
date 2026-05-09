import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

const panelUserPublicSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  permissions: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

const roleRank: Record<string, number> = {
  OWNER: 50,
  SUB_OWNER: 40,
  ADMIN: 30,
  HELPER: 20,
  MODERATOR: 10,
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.panelUser.findMany({
      orderBy: { createdAt: 'desc' },
      select: panelUserPublicSelect,
    });
  }

  async findById(id: number) {
    const user = await this.prisma.panelUser.findUnique({
      where: { id },
      select: panelUserPublicSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async findProfile(id: number, requesterId: number) {
    const [requester, user] = await Promise.all([
      this.prisma.panelUser.findUnique({
        where: { id: requesterId },
        select: { id: true, role: true },
      }),
      this.prisma.panelUser.findUnique({
        where: { id },
        select: panelUserPublicSelect,
      }),
    ]);

    if (!requester) {
      throw new ForbiddenException('Usuário autenticado não encontrado');
    }

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (requester.id !== user.id && this.getRoleRank(requester.role) <= this.getRoleRank(user.role)) {
      throw new ForbiddenException('Você só pode abrir perfis de administradores com cargo abaixo do seu.');
    }

    return user;
  }

  async create(dto: CreateUserDto, actorId: number) {
    const passwordHash = await bcrypt.hash(dto.password, 12);

    try {
      const user = await this.prisma.panelUser.create({
        data: {
          username: dto.username,
          email: dto.email,
          passwordHash,
          role: dto.role || 'ADMIN',
          permissions: JSON.stringify(dto.permissions || []),
          isActive: true,
        },
        select: panelUserPublicSelect,
      });

      await this.logPanelAction(
        actorId,
        `Criou o usuário ${user.username} (${user.role}) com permissões: ${this.formatPermissions(dto.permissions || [])}`,
      );
      return user;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('Já existe um usuário com esse e-mail ou username');
      }
      throw error;
    }
  }

  async updateStatus(id: number, isActive: boolean, actorId: number) {
    const user = await this.prisma.panelUser.update({
      where: { id },
      data: { isActive },
      select: panelUserPublicSelect,
    });

    await this.logPanelAction(actorId, `${isActive ? 'Ativou' : 'Desativou'} o usuário ${user.username}`);
    return user;
  }

  async delete(id: number, actorId: number) {
    const user = await this.prisma.panelUser.findUnique({
      where: { id },
      select: { id: true, username: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    if (user.role === 'OWNER') {
      throw new ConflictException('O usuário OWNER não pode ser removido');
    }

    await this.prisma.panelUser.delete({ where: { id } });
    await this.logPanelAction(actorId, `Removeu o usuário ${user.username}`);
    return { success: true };
  }

  private getRoleRank(role: string) {
    return roleRank[role] || 0;
  }

  private formatPermissions(permissions: string[]) {
    if (!permissions.length) return 'nenhuma permissão extra';
    return permissions.join(', ');
  }

  private async logPanelAction(actorId: number, reason: string) {
    await this.prisma.actionLog.create({
      data: {
        type: 'PANEL_ACTION',
        origin: 'PANEL',
        actorId,
        reason,
      },
    });
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }
}
