import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../database/prisma.service";
import type { CurrentUser, Role } from "./identity";
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Reflector) private readonly reflector: Reflector,
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
    const users = await this.db.$queryRaw<
      CurrentUser[]
    >`SELECT * FROM public.app_resolve_user(${Number(header)}::integer)`;
    if (!users[0])
      throw new UnauthorizedException(
        "Utilizador desconhecido. Volte a selecionar.",
      );
    request.actor = users[0];
    const roles = this.reflector.getAllAndOverride<Role[]>("roles", targets);
    if (roles && !roles.includes(users[0].role))
      throw new ForbiddenException(
        "Este perfil não tem acesso a esta operação.",
      );
    return true;
  }
}
