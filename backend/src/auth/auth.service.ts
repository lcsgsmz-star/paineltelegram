import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { LoginUser } from './interfaces/authenticated-request.interface';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService, private readonly jwtService: JwtService) {}

  async onModuleInit() {
    await this.ensureOwner();
  }

  async validateUser(username: string, password: string) {
    const user = await this.prisma.panelUser.findFirst({
      where: {
        OR: [{ username }, { email: username }],
      },
    });
    if (!user || !user.isActive) return null;
    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) return null;
    return { id: user.id, username: user.username, role: user.role, email: user.email, permissions: user.permissions };
  }

  async ensureOwner() {
    const ownerUsername = process.env.OWNER_USERNAME || 'admin';
    const ownerPassword = process.env.OWNER_PASSWORD || 'change-me-123';
    const ownerEmail = process.env.OWNER_EMAIL || 'owner@painel.local';
    const existing = await this.prisma.panelUser.findFirst({
      where: {
        OR: [{ username: ownerUsername }, { email: ownerEmail }, { role: 'OWNER' }],
      },
    });
    if (existing) return existing;
    const hashed = await bcrypt.hash(ownerPassword, 12);
    const owner = await this.prisma.panelUser.create({
      data: {
        email: ownerEmail,
        username: ownerUsername,
        passwordHash: hashed,
        role: 'OWNER',
        permissions: JSON.stringify(['VIEW_LOGS', 'MANAGE_MEMBERS', 'MANAGE_FORBIDDEN_WORDS', 'MANAGE_BOT', 'MANAGE_PANEL_USERS']),
        isActive: true,
      },
    });
    this.logger.log(`Owner inicial criado: ${owner.username}`);
    return owner;
  }

  async login(user: LoginUser) {
    await this.registerPanelLog('PANEL_LOGIN', user.id, `Login realizado por ${user.username}`);
    return this.buildAuthResponse(user);
  }

  async refresh(userId: number) {
    const user = await this.prisma.panelUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inativo ou inexistente');
    }

    return this.buildAuthResponse(user);
  }

  async me(userId: number) {
    const user = await this.prisma.panelUser.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Usuario inativo ou inexistente');
    }

    return user;
  }

  private buildAuthResponse(user: Pick<LoginUser, 'id' | 'username' | 'role' | 'email' | 'permissions'>) {
    const payload = { sub: user.id, username: user.username, role: user.role, permissions: user.permissions };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
    };
  }

  private async registerPanelLog(type: string, actorId: number, reason: string) {
    try {
      await this.prisma.actionLog.create({
        data: {
          type,
          origin: 'PANEL',
          actorId,
          reason,
        },
      });
    } catch (error) {
      this.logger.warn(`Falha ao registrar log de autenticação: ${error}`);
    }
  }

  async registerOwner(email: string, password: string) {
    const hashed = await bcrypt.hash(password, 12);
    return this.prisma.panelUser.create({
      data: {
        email,
        username: email,
        passwordHash: hashed,
        role: 'OWNER',
        permissions: JSON.stringify(['VIEW_LOGS', 'MANAGE_MEMBERS', 'MANAGE_FORBIDDEN_WORDS', 'MANAGE_BOT', 'MANAGE_PANEL_USERS']),
        isActive: true,
      },
    });
  }
}
