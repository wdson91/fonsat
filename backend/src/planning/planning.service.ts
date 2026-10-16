import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TenantService } from "../database/tenant.service";
import { ScopeService } from "../common/scope.service";
import { date, dayInZone, integer } from "../common/validation";
import type { CurrentUser } from "../identity/identity";
@Injectable()
export class PlanningService {
  constructor(
    private readonly tenant: TenantService,
    private readonly scope: ScopeService,
  ) {}
  private week(value: unknown) {
    const start = date(value);
    if (start.getUTCDay() !== 1)
      throw new BadRequestException("Escolha a segunda-feira da semana.");
    const end = new Date(+start + 7 * 86400000);
    return { start, end };
  }
  list(user: CurrentUser, value: unknown) {
    const { start, end } = this.week(value);
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const sites = await this.scope.siteIds(tx, user);
      return tx.allocation.findMany({
        where: { day: { gte: start, lt: end }, siteId: { in: sites } },
        orderBy: [{ day: "asc" }, { workerId: "asc" }],
      });
    });
  }
  save(
    user: CurrentUser,
    body: {
      workerId: unknown;
      siteId: unknown;
      tradeId?: unknown;
      day: unknown;
    },
  ) {
    const day = date(body.day),
      workerId = integer(body.workerId),
      siteId = integer(body.siteId);
    const tradeId =
      body.tradeId == null || body.tradeId === ""
        ? null
        : integer(body.tradeId);
    if (day < date(dayInZone(new Date(), user.time_zone)))
      throw new BadRequestException(
        "A distribuição no passado não pode ser alterada.",
      );
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const target = await this.scope.site(tx, user, siteId);
      if (!target.active) throw new BadRequestException("Obra inativa.");
      const old = await tx.allocation.findUnique({
        where: {
          companyId_workerId_day: { companyId: user.company_id, workerId, day },
        },
      });
      if (old) await this.scope.site(tx, user, old.siteId);
      if (
        !(await tx.worker.findFirst({ where: { id: workerId, active: true } }))
      )
        throw new BadRequestException("Trabalhador indisponível.");
      if (
        tradeId &&
        !(await tx.trade.findFirst({ where: { id: tradeId, active: true } }))
      )
        throw new BadRequestException("Ofício indisponível.");
      return tx.allocation.upsert({
        where: {
          companyId_workerId_day: { companyId: user.company_id, workerId, day },
        },
        create: {
          companyId: user.company_id,
          workerId,
          siteId,
          tradeId,
          day,
          changedBy: user.id,
        },
        update: { siteId, tradeId, changedBy: user.id },
      });
    });
  }
  remove(user: CurrentUser, id: number) {
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const cell = await tx.allocation.findUnique({ where: { id } });
      if (!cell) throw new NotFoundException("Distribuição não encontrada.");
      await this.scope.site(tx, user, cell.siteId);
      if (cell.day < date(dayInZone(new Date(), user.time_zone)))
        throw new BadRequestException(
          "A distribuição no passado não pode ser alterada.",
        );
      return tx.allocation.delete({ where: { id } });
    });
  }
  copy(user: CurrentUser, value: unknown) {
    const { start, end } = this.week(value);
    const today = date(dayInZone(new Date(), user.time_zone));
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const ids = await this.scope.siteIds(tx, user);
      const previous = await tx.allocation.findMany({
        where: { day: { gte: new Date(+start - 7 * 86400000), lt: start } },
        include: { worker: true, site: true, trade: true },
      });
      const existing = await tx.allocation.findMany({
        where: { day: { gte: start, lt: end } },
      });
      const skipped: { workerId: number; day: string; reason: string }[] = [];
      let copied = 0;
      for (const cell of previous) {
        const day = new Date(+cell.day + 7 * 86400000);
        if (!ids.includes(cell.siteId)) {
          if (user.role === "admin")
            skipped.push({
              workerId: cell.workerId,
              day: day.toISOString().slice(0, 10),
              reason: "Sem responsabilidade ativa.",
            });
          continue;
        }
        const reason =
          day < today
            ? "Dia passado."
            : existing.some(
                  (x) => x.workerId === cell.workerId && +x.day === +day,
                )
              ? "Célula preenchida."
              : !cell.worker.active ||
                  !cell.site.active ||
                  cell.trade?.active === false
                ? "Cadastro inativo."
                : null;
        if (reason) {
          skipped.push({
            workerId: cell.workerId,
            day: day.toISOString().slice(0, 10),
            reason,
          });
          continue;
        }
        await tx.allocation.create({
          data: {
            companyId: user.company_id,
            workerId: cell.workerId,
            siteId: cell.siteId,
            tradeId: cell.tradeId,
            day,
            changedBy: user.id,
          },
        });
        copied++;
      }
      return { copied, skipped };
    });
  }
}
