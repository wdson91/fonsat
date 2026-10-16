import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import type { CurrentUser } from '../identity/identity';
import type { InvoiceSource } from '../invoices/invoice-source';
import type { FinancialEntry } from '../invoices/invoice-engine';
@Injectable()
export class OperationalInvoiceSource implements InvoiceSource {
  async exclusions(
    tx: Prisma.TransactionClient,
    clientId: number,
    period: string,
  ) {
    const rows = await tx.draftExclusion.findMany({
      where: { draft: { clientId, period } },
      include: { author: { select: { name: true } } },
      orderBy: { entryId: 'asc' },
    });
    return rows.map((row) => ({
      entryId: row.entryId,
      reason: row.reason,
      authorName: row.author.name,
      createdAt: row.createdAt.toISOString(),
    }));
  }
  clients(tx: Prisma.TransactionClient, _actor: CurrentUser) {
    return tx.client.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  async clientForUser(tx: Prisma.TransactionClient, actor: CurrentUser) {
    return (
      (await tx.client.findUnique({ where: { userId: actor.id } }))?.id ?? null
    );
  }
  async entries(
    tx: Prisma.TransactionClient,
    companyId: number,
  ): Promise<FinancialEntry[]> {
    const entries = await tx.workEntry.findMany({
      where: { companyId },
      include: {
        worker: true,
        versions: {
          orderBy: { number: 'desc' },
          take: 1,
          include: {
            site: { include: { client: true } },
            trade: true,
            author: { select: { name: true } },
          },
        },
      },
    });
    const rates = await tx.rate.findMany();
    return entries.map((entry) => {
      const v = entry.versions[0];
      const rate = rates.find(
        (r) =>
          r.clientId === v.site.clientId &&
          r.tradeId === v.tradeId &&
          r.startsOn <= v.workedOn &&
          (!r.endsOn || r.endsOn >= v.workedOn),
      );
      return {
        id: entry.id,
        version: entry.currentVersion,
        clientId: v.site.clientId ?? 0,
        clientName: v.site.client?.name ?? 'Sem cliente',
        siteId: v.siteId,
        siteName: v.site.name,
        tradeId: v.tradeId,
        tradeName: v.trade.name,
        rateId: rate?.id ?? null,
        rateCents: rate?.cents ?? null,
        rateStartsOn: rate?.startsOn.toISOString().slice(0, 10) ?? null,
        workerId: entry.workerId,
        workerName: entry.worker.name,
        workedOn: v.workedOn.toISOString().slice(0, 10),
        startAt: v.startAt?.toISOString() ?? null,
        endAt: v.endAt?.toISOString() ?? null,
        minutes: v.minutes ?? 0,
        status: v.minutes === null ? 'incomplete' : 'closed',
        reason: v.reason,
        correctedBy: v.source === 'manual' ? v.author.name : null,
        correctedAt: v.source === 'manual' ? v.createdAt.toISOString() : null,
      };
    });
  }
}
