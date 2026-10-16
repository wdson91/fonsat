import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantService } from '../database/tenant.service';
import type { Prisma } from '../generated/prisma/client';
import type { CurrentUser } from '../identity/identity';
import { integer, text, uuid } from '../common/validation';
import {
  computeInvoice,
  ROUNDING_RULE,
  type PostedLine,
} from '../invoices/invoice-engine';
import { lockCompanyFinance } from '../invoices/invoice-source';
import { OperationalInvoiceSource } from './operational-invoice-source';
@Injectable()
export class BillingService {
  constructor(
    private readonly tenant: TenantService,
    private readonly source: OperationalInvoiceSource,
  ) {}
  private period(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new BadRequestException('Mês inválido.');
    return value;
  }
  private async calculate(
    tx: Prisma.TransactionClient,
    user: CurrentUser,
    clientId: number,
    period: string,
    excluded: string[],
  ) {
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente não encontrado.');
    const company = await tx.company.findUniqueOrThrow({
      where: { id: user.company_id },
    });
    const invoices = await tx.issuedFinancialDocument.findMany({
      orderBy: [
        { issuedAt: 'asc' },
        { sequenceYear: 'asc' },
        { sequenceNumber: 'asc' },
      ],
    });
    if (invoices.some((i) => i.clientId === clientId && i.period >= period))
      throw new ConflictException(
        'Já existe emissão neste mês ou num mês posterior. Use o mês seguinte.',
      );
    const history = invoices.flatMap((i) =>
      (i.snapshot as unknown as { lines: PostedLine[] }).lines.map((line) => ({
        ...line,
        invoiceId: i.id,
        invoiceNumber: i.number,
      })),
    );
    const previouslyBilled = new Set(
      history.flatMap((l) => [...l.before, ...l.after].map((e) => e.id)),
    );
    if (excluded.some((id) => previouslyBilled.has(id)))
      throw new ConflictException(
        'Um registo já faturado exige um ajuste; não pode ser excluído do rascunho.',
      );
    const entries = (await this.source.entries(tx, user.company_id)).filter(
      (e) => !excluded.includes(e.id),
    );
    return {
      ...computeInvoice({ entries, history, clientId, period }),
      client: { id: client.id, name: client.name },
      company: {
        id: company.id,
        name: company.name,
        timeZone: company.timeZone,
      },
      period,
      roundingRule: ROUNDING_RULE,
    };
  }
  generate(user: CurrentUser, body: { clientId: unknown; period: unknown }) {
    const clientId = integer(body.clientId),
      period = this.period(body.period);
    return this.tenant.inCompany(user.company_id, async (tx) => {
      await lockCompanyFinance(tx, user.company_id);
      const previous = await tx.billingDraft.findUnique({
        where: {
          companyId_clientId_period: {
            companyId: user.company_id,
            clientId,
            period,
          },
        },
        include: { exclusions: true },
      });
      const snapshot = await this.calculate(
        tx,
        user,
        clientId,
        period,
        previous?.exclusions.map((e) => e.entryId) ?? [],
      );
      const data = {
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
        generatedBy: user.id,
        generatedAt: new Date(),
      };
      const draft = await tx.billingDraft.upsert({
        where: {
          companyId_clientId_period: {
            companyId: user.company_id,
            clientId,
            period,
          },
        },
        create: { companyId: user.company_id, clientId, period, ...data },
        update: data,
        include: {
          exclusions: { include: { author: { select: { name: true } } } },
        },
      });
      return { ...draft, snapshot };
    });
  }
  exclude(
    user: CurrentUser,
    draftId: string,
    body: { entryId: unknown; reason: unknown },
  ) {
    uuid(draftId);
    const entryId = uuid(body.entryId),
      reason = text(body.reason, 'Motivo da exclusão');
    return this.tenant.inCompany(user.company_id, async (tx) => {
      await lockCompanyFinance(tx, user.company_id);
      const draft = await tx.billingDraft.findUnique({
        where: { id: draftId },
        include: { exclusions: true },
      });
      if (!draft) throw new NotFoundException('Rascunho não encontrado.');
      const current = (await this.source.entries(tx, user.company_id)).find(
        (e) => e.id === entryId,
      );
      if (
        !current ||
        current.clientId !== draft.clientId ||
        current.workedOn.slice(0, 7) > draft.period
      )
        throw new BadRequestException('Registo fora deste rascunho.');
      const existing = draft.exclusions.find((e) => e.entryId === entryId);
      if (existing) {
        if (existing.reason !== reason)
          throw new ConflictException(
            'Exclusão já registada com outro motivo.',
          );
        return existing;
      }
      const excluded = [...draft.exclusions.map((e) => e.entryId), entryId];
      const snapshot = await this.calculate(
        tx,
        user,
        draft.clientId,
        draft.period,
        excluded,
      );
      const exclusion = await tx.draftExclusion.create({
        data: {
          companyId: user.company_id,
          draftId,
          entryId,
          reason,
          authorId: user.id,
        },
      });
      await tx.billingDraft.update({
        where: { id: draftId },
        data: {
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
          generatedBy: user.id,
          generatedAt: new Date(),
        },
      });
      await tx.auditEvent.create({
        data: {
          companyId: user.company_id,
          authorId: user.id,
          action: 'billing.exclude',
          entityId: entryId,
          payload: { draftId, period: draft.period, reason },
        },
      });
      return exclusion;
    });
  }
}
