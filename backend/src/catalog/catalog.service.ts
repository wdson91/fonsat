import { lockCompanyFinance } from "../invoices/invoice-source";
import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { TenantService } from "../database/tenant.service";
import { ScopeService } from "../common/scope.service";
import { date, integer, text } from "../common/validation";
import type { CurrentUser } from "../identity/identity";

export type CatalogKind = "trades" | "clients" | "workers" | "sites";

export interface CatalogInput {
  name: unknown;
  tradeId?: unknown;
  clientId?: unknown;
  userId?: unknown;
  taxId?: unknown;
  location?: unknown;
  active?: unknown;
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly tenant: TenantService,
    private readonly scope: ScopeService,
  ) {}

  list(user: CurrentUser) {
    return this.tenant.inCompany(user.company_id, async (tx) => {
      const ids = await this.scope.siteIds(tx, user);
      const sites = await tx.site.findMany({
        where: { id: { in: ids } },
        orderBy: { name: "asc" },
      });

      return {
        sites,
        workers: await tx.worker.findMany({ orderBy: { name: "asc" } }),
        trades: await tx.trade.findMany({ orderBy: { name: "asc" } }),
        clients: await tx.client.findMany({
          where:
            user.role === "admin"
              ? {}
              : {
                  id: {
                    in: sites.flatMap((s) => (s.clientId ? [s.clientId] : [])),
                  },
                },
          orderBy: { name: "asc" },
        }),
        users: await tx.demoUser.findMany({
          select: { id: true, name: true, role: true },
        }),
        responsibilities: await tx.siteResponsibility.findMany({
          where: { siteId: { in: ids } },
        }),
      };
    });
  }

  save(user: CurrentUser, kind: CatalogKind, input: CatalogInput, id?: number) {
    const name = text(input.name);
    if (input.active !== undefined && typeof input.active !== "boolean") {
      throw new BadRequestException("Estado inválido.");
    }
    const active =
      input.active === undefined ? true : (input.active as boolean);

    return this.tenant.inCompany(user.company_id, async (tx) => {
      await lockCompanyFinance(tx, user.company_id);
      const base = { name, active };
      const companyId = user.company_id;

      if (kind === "trades") {
        return id
          ? tx.trade.update({ where: { id }, data: base })
          : tx.trade.create({ data: { ...base, companyId } });
      }

      if (kind === "clients") {
        const userId =
          input.userId == null || input.userId === ""
            ? null
            : integer(input.userId);

        if (
          userId &&
          !(await tx.demoUser.findFirst({
            where: { id: userId, role: "client" },
          }))
        ) {
          throw new BadRequestException(
            "Selecione um utilizador cliente da empresa.",
          );
        }

        const data = {
          ...base,
          userId,
          taxId: typeof input.taxId === "string" ? input.taxId.trim() : "",
        };

        return id
          ? tx.client.update({ where: { id }, data })
          : tx.client.create({ data: { ...data, companyId } });
      }

      if (kind === "workers") {
        const tradeId = integer(input.tradeId);
        if (
          !(await tx.trade.findFirst({ where: { id: tradeId, active: true } }))
        ) {
          throw new BadRequestException("Ofício indisponível.");
        }

        const userId =
          input.userId == null || input.userId === ""
            ? null
            : integer(input.userId);

        if (
          userId &&
          !(await tx.demoUser.findFirst({
            where: { id: userId, role: "worker" },
          }))
        ) {
          throw new BadRequestException(
            "Selecione um utilizador trabalhador da empresa.",
          );
        }

        const data = { ...base, tradeId, userId };
        return id
          ? tx.worker.update({ where: { id }, data })
          : tx.worker.create({ data: { ...data, companyId } });
      }

      if (kind === "sites") {
        const clientId = integer(input.clientId);
        if (
          !(await tx.client.findFirst({
            where: { id: clientId, active: true },
          }))
        ) {
          throw new BadRequestException("Cliente indisponível.");
        }

        if (id) {
          const old = await tx.site.findUnique({ where: { id } });
          if (!old) {
            throw new NotFoundException("Obra não encontrada.");
          }
          if (
            old.clientId !== clientId &&
            (await tx.entryVersion.count({ where: { siteId: id } }))
          ) {
            throw new BadRequestException(
              "Obra com horas: transfira os registos para outra obra em vez de mudar o cliente.",
            );
          }
        }

        const data = {
          ...base,
          clientId,
          location:
            typeof input.location === "string" ? input.location.trim() : "",
        };

        return id
          ? tx.site.update({ where: { id }, data })
          : tx.site.create({ data: { ...data, companyId } });
      }

      throw new BadRequestException("Cadastro inválido.");
    });
  }

  responsibility(
    user: CurrentUser,
    body: {
      siteId: unknown;
      userId: unknown;
      startsOn: unknown;
      endsOn?: unknown;
      replaceId?: unknown;
      id?: unknown;
    },
  ) {
    const siteId = integer(body.siteId);
    const userId = integer(body.userId);
    const startsOn = date(body.startsOn);
    const endsOn = body.endsOn ? date(body.endsOn) : null;

    if (endsOn && endsOn < startsOn) {
      throw new BadRequestException("Vigência inválida.");
    }

    return this.tenant.inCompany(user.company_id, async (tx) => {
      await this.scope.site(tx, user, siteId);

      if (
        !(await tx.demoUser.findFirst({
          where: { id: userId, role: "foreman" },
        }))
      ) {
        throw new BadRequestException("Encarregado inválido.");
      }

      await lockCompanyFinance(tx, user.company_id);
      const id = body.id == null ? null : integer(body.id);
      const replaceId = body.replaceId == null ? null : integer(body.replaceId);
      if (id && replaceId)
        throw new BadRequestException("Escolha editar ou substituir.");
      const previous =
        id || replaceId
          ? await tx.siteResponsibility.findUnique({
              where: { id: (id ?? replaceId)! },
            })
          : null;
      if ((id || replaceId) && (!previous || previous.siteId !== siteId))
        throw new NotFoundException(
          "Responsabilidade não encontrada nesta obra.",
        );
      if (replaceId && previous) {
        if (
          startsOn <= previous.startsOn ||
          (previous.endsOn && startsOn > previous.endsOn)
        )
          throw new BadRequestException(
            "A substituição deve começar dentro da vigência anterior e depois do seu início. Para corrigir as datas, use Editar.",
          );
        if (previous.userId === userId)
          throw new BadRequestException(
            "Escolha outro encarregado para substituir.",
          );
      }
      const overlap = await tx.siteResponsibility.findFirst({
        where: {
          siteId,
          userId,
          ...(id ? { id: { not: id } } : {}),
          ...(endsOn ? { startsOn: { lte: endsOn } } : {}),
          OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
        },
      });
      if (overlap)
        throw new ConflictException(
          "Este encarregado já tem responsabilidade nesta obra durante essas datas. Edite o período existente.",
        );
      if (replaceId)
        await tx.siteResponsibility.update({
          where: { id: replaceId },
          data: { endsOn: new Date(+startsOn - 86400000) },
        });
      const data = { siteId, userId, startsOn, endsOn };
      const result = id
        ? await tx.siteResponsibility.update({ where: { id }, data })
        : await tx.siteResponsibility.create({
            data: { ...data, companyId: user.company_id },
          });
      await tx.auditEvent.create({
        data: {
          companyId: user.company_id,
          authorId: user.id,
          action: replaceId
            ? "responsibility.replace"
            : id
              ? "responsibility.edit"
              : "responsibility.add",
          entityId: String(result.id),
          payload: {
            before: previous
              ? {
                  id: previous.id,
                  startsOn: previous.startsOn.toISOString(),
                  endsOn: previous.endsOn?.toISOString() ?? null,
                  userId: previous.userId,
                }
              : null,
            replaceId,
            startsOn: startsOn.toISOString(),
            endsOn: endsOn?.toISOString() ?? null,
            userId,
            siteId,
          },
        },
      });
      return result;
    });
  }
}
