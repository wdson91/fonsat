import { lockCompanyFinance } from "../invoices/invoice-source";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TenantService } from "../database/tenant.service";
import { ScopeService } from "../common/scope.service";
import { date, dayInZone, instant, integer, uuid } from "../common/validation";
import type { CurrentUser } from "../identity/identity";
export interface ClockInput {
  id: unknown;
  shiftId: unknown;
  siteId: unknown;
  kind: unknown;
  occurredAt: unknown;
}
@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenant: TenantService,
    private readonly scope: ScopeService,
  ) {}
  bootstrap(user: CurrentUser) {
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const worker = await tx.worker.findUnique({ where: { userId: user.id } });
      if (!worker)
        throw new NotFoundException("Utilizador sem trabalhador associado.");
      const today = date(dayInZone(new Date(), user.time_zone));
      const allocation = await tx.allocation.findUnique({
        where: {
          companyId_workerId_day: {
            companyId: user.company_id,
            workerId: worker.id,
            day: today,
          },
        },
      });
      return {
        worker,
        sites: await tx.site.findMany({
          select: { id: true, name: true, active: true },
        }),
        suggestedSiteId: allocation?.siteId ?? null,
        allocations: await tx.allocation.findMany({
          where: { workerId: worker.id },
          select: { day: true, siteId: true },
          orderBy: { day: "asc" },
        }),
      };
    });
  }
  async sync(user: CurrentUser, batch: unknown) {
    if (!Array.isArray(batch) || batch.length < 1 || batch.length > 100)
      throw new BadRequestException("Envie entre 1 e 100 marcações.");
    const results = [];
    for (const input of batch) {
      try {
        results.push({
          id: input?.id,
          accepted: true,
          ...(await this.record(user, input)),
        });
      } catch (error) {
        const code = (error as { code?: string }).code;
        const status =
          error instanceof HttpException
            ? error.getStatus()
            : ["P2002", "P2034"].includes(code ?? "")
              ? 409
              : code === "P2003"
                ? 400
                : 500;
        results.push({
          id: input?.id,
          accepted: false,
          status,
          message:
            error instanceof HttpException
              ? error.message
              : status === 409
                ? "Conflito de sincronização. Reenvie a marcação."
                : status === 400
                  ? "Referência inválida."
                  : "Falha ao guardar a marcação.",
        });
      }
    }
    return { results };
  }
  private record(user: CurrentUser, input: ClockInput) {
    if (!input || typeof input !== "object")
      throw new BadRequestException("Marcação inválida.");
    const id = uuid(input.id),
      entryId = uuid(input.shiftId),
      siteId = integer(input.siteId),
      occurredAt = instant(input.occurredAt);
    if (
      typeof input.kind !== "string" ||
      !["in", "out", "break_in", "break_out"].includes(input.kind)
    )
      throw new BadRequestException("Tipo de marcação inválido.");
    const kind = input.kind,
      activity = kind.startsWith("break_") ? "break" : "work";
    return this.tenant.inCompany(user.company_id, async (tx) => {
      await lockCompanyFinance(tx, user.company_id);
      const worker = await tx.worker.findUnique({ where: { userId: user.id } });
      if (!worker) throw new NotFoundException("Trabalhador não encontrado.");
      const existing = await tx.clockEvent.findUnique({
        where: { id },
        include: { entry: true },
      });
      if (existing) {
        if (
          existing.entry.workerId !== worker.id ||
          existing.entryId !== entryId ||
          existing.siteId !== siteId ||
          existing.kind !== kind ||
          +existing.occurredAt !== +occurredAt
        )
          throw new ConflictException("O UUID já existe com outro conteúdo.");
        return { duplicate: true };
      }
      if (!(await tx.site.findUnique({ where: { id: siteId } })))
        throw new BadRequestException("Obra não pertence à empresa.");
      let entry = await tx.workEntry.findUnique({ where: { id: entryId } });
      if (entry && entry.workerId !== worker.id)
        throw new BadRequestException("Turno de outro trabalhador.");
      if (entry && entry.activity !== activity)
        throw new ConflictException(
          "Um período não pode misturar trabalho e pausa.",
        );
      if (!entry)
        entry = await tx.workEntry.create({
          data: {
            id: entryId,
            companyId: user.company_id,
            workerId: worker.id,
            activity,
          },
        });
      await tx.clockEvent.create({
        data: {
          id,
          entryId,
          companyId: user.company_id,
          siteId,
          kind,
          occurredAt,
        },
      });
      const current = await tx.entryVersion.findUnique({
        where: {
          companyId_entryId_number: {
            companyId: user.company_id,
            entryId,
            number: entry.currentVersion,
          },
        },
      });
      if (current?.source === "manual")
        return { duplicate: false, needsReview: true };
      const facts = await tx.clockEvent.findMany({
        where: { entryId },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      });
      const start = facts.find((e) => e.kind === "in" || e.kind === "break_in");
      const end = facts.find(
        (e) =>
          (e.kind === "out" || e.kind === "break_out") &&
          (!start || e.occurredAt >= start.occurredAt),
      );
      const basis = start ?? end ?? facts[0];
      const workedOn = date(dayInZone(basis.occurredAt, user.time_zone));
      const allocation = await tx.allocation.findUnique({
        where: {
          companyId_workerId_day: {
            companyId: user.company_id,
            workerId: worker.id,
            day: workedOn,
          },
        },
      });
      const startAt = start?.occurredAt ?? null,
        endAt = end?.occurredAt ?? null;
      const minutes =
        startAt && endAt
          ? Math.floor(+endAt / 60000) - Math.floor(+startAt / 60000)
          : null;
      const number = entry.currentVersion + 1;
      await tx.entryVersion.create({
        data: {
          companyId: user.company_id,
          entryId,
          number,
          siteId: basis.siteId,
          tradeId: allocation?.tradeId ?? worker.tradeId,
          startAt,
          endAt,
          workedOn,
          minutes,
          source: "clock",
          authorId: user.id,
        },
      });
      await tx.workEntry.update({
        where: { id: entryId },
        data: { currentVersion: number },
      });
      return { duplicate: false };
    });
  }
  list(user: CurrentUser) {
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const worker =
        user.role === "worker"
          ? await tx.worker.findUnique({ where: { userId: user.id } })
          : null;
      if (user.role === "worker" && !worker) return [];
      const ids =
        user.role === "foreman" ? await this.scope.siteIds(tx, user) : null;
      const entries = await tx.workEntry.findMany({
        where: worker ? { workerId: worker.id } : {},
        include: {
          worker: true,
          versions: {
            orderBy: { number: "desc" },
            include: {
              site: true,
              trade: true,
              author: { select: { id: true, name: true } },
            },
          },
          events: { orderBy: { occurredAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      });
      const allocations = await tx.allocation.findMany();
      const rates = await tx.rate.findMany();
      return entries
        .filter((e) => !ids || ids.includes(e.versions[0]?.siteId))
        .map((e) => {
          const current = e.versions[0];
          const allocation = allocations.find(
            (a) => a.workerId === e.workerId && +a.day === +current.workedOn,
          );
          const alerts: string[] = [];
          const observations: string[] = [];
          const reviewed = current.source === "manual";
          const eventAlerts = reviewed
            ? e.events.filter((ev) => ev.receivedAt > current.createdAt)
            : e.events;
          if (
            e.activity === "work" &&
            !rates.some(
              (r) =>
                r.clientId === current.site.clientId &&
                r.tradeId === current.tradeId &&
                r.startsOn <= current.workedOn &&
                (!r.endsOn || r.endsOn >= current.workedOn),
            )
          )
            alerts.push("Sem preço para o cliente e ofício nesta data.");
          if (current.minutes === null)
            alerts.push("Registo incompleto: falta entrada ou saída.");
          if (!allocation || allocation.siteId !== current.siteId) {
            const planned = allocation;
            const explanation = planned
              ? "Obra diferente da distribuição deste dia."
              : "Sem distribuição para este trabalhador neste dia.";
            if (reviewed)
              observations.push(
                explanation + " Exceção confirmada na correção.",
              );
            else alerts.push(explanation);
          }
          if (
            eventAlerts.some(
              (ev) => Math.abs(+ev.receivedAt - +ev.occurredAt) > 86400000,
            )
          )
            alerts.push("Marcação recebida com atraso ou relógio desviado.");
          if (
            current.source === "manual" &&
            e.events.some((ev) => ev.receivedAt > current.createdAt)
          )
            alerts.push(
              "Marcação tardia após correção manual: requer revisão.",
            );
          if (
            eventAlerts.filter(
              (ev) => ev.kind === "in" || ev.kind === "break_in",
            ).length > 1 ||
            eventAlerts.filter(
              (ev) => ev.kind === "out" || ev.kind === "break_out",
            ).length > 1 ||
            eventAlerts.some((ev) => ev.siteId !== current.siteId) ||
            eventAlerts.some(
              (ev) =>
                (ev.kind === "out" || ev.kind === "break_out") &&
                current.startAt &&
                ev.occurredAt < current.startAt,
            )
          )
            alerts.push("Marcações inconsistentes: requer revisão.");
          return {
            ...e,
            versions: ids
              ? e.versions.filter((v) => ids.includes(v.siteId))
              : e.versions,
            events: ids
              ? e.events.filter((ev) => ids.includes(ev.siteId))
              : e.events,
            current,
            alerts,
            observations,
            overtime: e.activity === "work" && (current.minutes ?? 0) > 480,
          };
        });
    });
  }
  async team(user: CurrentUser) {
    const entries = await this.list(user);
    const today = dayInZone(new Date(), user.time_zone);
    const missing = await this.tenant.inCompany(user.company_id, async (tx) => {
      const ids = await this.scope.siteIds(tx, user);
      const allocated = await tx.allocation.findMany({
        where: { day: date(today), siteId: { in: ids } },
        include: { worker: true, site: true },
      });
      return allocated.filter(
        (a) =>
          !entries.some(
            (e) =>
              e.activity === "work" &&
              e.workerId === a.workerId &&
              e.current.workedOn.toISOString().startsWith(today) &&
              e.current.startAt,
          ),
      );
    });
    return { entries, missing };
  }
}
