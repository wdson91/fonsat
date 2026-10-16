import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  IS_PUBLIC_KEY,
  ROLES_KEY,
  type CurrentUser,
  type Role,
} from "./identity";
import { IdentityService } from "./identity.service";

@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly identityService: IdentityService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown>; actor?: CurrentUser }>();
    const header = request.headers["x-user-id"];
    if (
      typeof header !== "string" ||
      !/^[1-9]\d*$/.test(header) ||
      Number(header) > 2147483647
    ) {
      throw new UnauthorizedException("Selecione um utilizador válido.");
    }

    const user = await this.identityService.resolveUser(Number(header));
    if (!user) {
      throw new UnauthorizedException(
        "Utilizador desconhecido. Volte a selecionar.",
      );
    }

    request.actor = user;

    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(
      ROLES_KEY,
      targets,
    );
    if (requiredRoles && !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        "Este perfil não tem acesso a esta operação.",
      );
    }

    return true;
  }
}
