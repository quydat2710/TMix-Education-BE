import { IS_PUBLIC_KEY, ROLES_KEY } from '@/decorator/customize.decorator';
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleEnum } from './roles.enum';
import { PermissionEntity } from 'modules/permissions/entities/permission.entity';
import { DataSource } from 'typeorm';
import { RoleEntity } from './entities/role.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private dataSource: DataSource,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip for public endpoints
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Unauthenticated');

    // Admin bypass — admins can access everything
    if (user.role?.id === RoleEnum.admin) {
      return true;
    }

    // Check if endpoint has @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<number[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If @Roles() is specified, check if user's role is in the allowed list
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = requiredRoles.includes(user.role?.id);
      if (!hasRole) {
        throw new ForbiddenException('Insufficient role');
      }
    }

    // Permission-based check (DB-driven) for non-admin users
    const method = request.method.toUpperCase();
    const path = request.route.path

    let role: RoleEntity & { permissions?: PermissionEntity[] } = user.role;
    if (!role?.permissions) {
      role = await this.dataSource.getRepository(RoleEntity).findOne({
        where: { id: user.role.id },
        relations: ['permissions'],
      }) as any;
    }

    // If role has no permissions defined in DB, allow access
    // (permission-based restriction is opt-in via DB configuration)
    if (!role?.permissions?.length) {
      return true;
    }

    const allowed = this.matchPermission(method, path, role.permissions);
    if (!allowed) {
      throw new ForbiddenException(`Permission denied: ${method} ${path}`);
    }

    return true;
  }

  private matchPermission(method: string, path: string, permissions: PermissionEntity[]): boolean {
    return permissions.some(p => {
      if (p.method.toUpperCase() !== method) return false;
      const originPath = `/api/v${p.version.toString()}${p.path}`
      return path === originPath;
    });
  }
}
