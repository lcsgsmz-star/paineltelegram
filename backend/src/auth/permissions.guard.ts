import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler());
    if (!requiredPermissions?.length) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (user?.role === 'OWNER') return true;

    const userPermissions = this.parsePermissions(user?.permissions);
    return requiredPermissions.every((permission) => userPermissions.includes(permission));
  }

  private parsePermissions(rawPermissions?: string) {
    try {
      const permissions = JSON.parse(rawPermissions || '[]');
      return Array.isArray(permissions) ? permissions : [];
    } catch {
      return [];
    }
  }
}
