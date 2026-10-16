import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import type { CurrentUser } from "../identity/identity";
import { date, dayInZone } from "./validation";
@Injectable()
export class ScopeService {
  async site(tx: Prisma.TransactionClient, user: CurrentUser, id: number) {
    const site = await tx.site.findUnique({ where: { id } });
    if (!site) throw new NotFoundException("Obra não encontrada.");
    if (user.role !== "admin") {
      const today = date(dayInZone(new Date(), user.time_zone));
      const responsibility = await tx.siteResponsibility.findFirst({
        where: {
          siteId: id,
          userId: user.id,
          startsOn: { lte: today },
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
      });
      if (user.role !== "foreman" || !responsibility)
        throw new ForbiddenException(
          "Obra fora da sua responsabilidade ativa.",
        );
    }
    return site;
  }
  async siteIds(tx: Prisma.TransactionClient, user: CurrentUser) {
    if (user.role === "admin")
      return (await tx.site.findMany()).map((s) => s.id);
    const today = date(dayInZone(new Date(), user.time_zone));
    return (
      await tx.siteResponsibility.findMany({
        where: {
          userId: user.id,
          startsOn: { lte: today },
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
      })
    ).map((s) => s.siteId);
  }
}
