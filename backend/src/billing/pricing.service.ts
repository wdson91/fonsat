import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TenantService } from "../database/tenant.service";
import { date, integer } from "../common/validation";
import { lockCompanyFinance } from "../invoices/invoice-source";
import type { PostedLine } from "../invoices/invoice-engine";
import type { CurrentUser } from "../identity/identity";
@Injectable()
export class PricingService {
  constructor(private readonly tenant: TenantService) {}
  list(user: CurrentUser) {
    return this.tenant.inCompany(user.company_id, (tx) =>
      tx.rate.findMany({ orderBy: [{ startsOn: "desc" }, { id: "asc" }] }),
    );
  }
  create(
    user: CurrentUser,
    input: {
      clientId: unknown;
      tradeId: unknown;
      cents: unknown;
      startsOn: unknown;
      endsOn?: unknown;
    },
  ) {
    const clientId = integer(input.clientId),
      tradeId = integer(input.tradeId),
      cents = integer(input.cents, "Preço em cêntimos", 0),
      startsOn = date(input.startsOn),
      endsOn = input.endsOn ? date(input.endsOn) : null;
    if (endsOn && endsOn < startsOn)
      throw new BadRequestException("Vigência inválida.");
    return this.tenant.inCompany(user.company_id, async (tx) => {
      await lockCompanyFinance(tx, user.company_id);
      if (
        !(await tx.client.findUnique({ where: { id: clientId } })) ||
        !(await tx.trade.findUnique({ where: { id: tradeId } }))
      )
        throw new BadRequestException(
          "Cliente ou ofício não pertence à empresa.",
        );
      if (
        await tx.rate.findFirst({
          where: {
            clientId,
            tradeId,
            startsOn: endsOn ? { lte: endsOn } : undefined,
            OR: [{ endsOn: null }, { endsOn: { gte: startsOn } }],
          },
        })
      )
        throw new ConflictException("Já existe um preço nesta vigência.");
      return tx.rate.create({
        data: {
          companyId: user.company_id,
          clientId,
          tradeId,
          cents,
          startsOn,
          endsOn,
        },
      });
    });
  }
  close(user: CurrentUser, id: number, value: unknown) {
    const endsOn = date(value);
    return this.tenant.inCompany(user.company_id, async (tx) => {
      await lockCompanyFinance(tx, user.company_id);
      const rate = await tx.rate.findUnique({ where: { id } });
      if (!rate) throw new NotFoundException("Preço não encontrado.");
      if (endsOn < rate.startsOn)
        throw new BadRequestException("Fim anterior ao início.");
      const invoices = await tx.issuedFinancialDocument.findMany({
        select: { snapshot: true },
      });
      const used = invoices
        .flatMap(
          (i) => (i.snapshot as unknown as { lines: PostedLine[] }).lines,
        )
        .flatMap((l) => [...l.before, ...l.after])
        .filter((e) => e.rateId === id);
      if (used.some((e) => e.workedOn > endsOn.toISOString().slice(0, 10)))
        throw new ConflictException(
          "A vigência cobre trabalho já faturado e deve ser preservada.",
        );
      if (rate.endsOn && endsOn > rate.endsOn)
        throw new BadRequestException(
          "Para prolongar um preço, crie uma nova vigência.",
        );
      return tx.rate.update({ where: { id }, data: { endsOn } });
    });
  }
}
