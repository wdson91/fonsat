import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IdentityService } from "./identity.service";
import type { Role } from "./identity";
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    private readonly identityService: IdentityService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>("public", targets))
      return true;
    const request = context.switchToHttp().getRequest();
    const header = request.headers["x-user-id"];
    if (
      typeof header !== "string" ||
      !/^[1-9]\d*$/.test(header) ||
      Number(header) > 2147483647
    ) {
      throw new UnauthorizedException("Selecione um utilizador válido.");
    }
    const user = await this.identityService.resolveUser(Number(header));
    if (!user)
      throw new UnauthorizedException(
        "Utilizador desconhecido. Volte a selecionar.",
      );
    request.actor = user;
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", targets);
    if (roles && !roles.includes(user.role))
      throw new ForbiddenException(
        "Este perfil não tem acesso a esta operação.",
      );
    return true;
  }
}
