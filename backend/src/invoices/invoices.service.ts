import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InvoiceTransactions } from "./invoice-transactions";
import type { Prisma } from "../generated/prisma/client";
import type { CurrentUser } from "../identity/identity";
import {
  computeInvoice,
  ROUNDING_RULE,
  type InvoiceComputation,
  type PostedLine,
} from "./invoice-engine";
import {
  INVOICE_SOURCE,
  type InvoiceClient,
  type InvoiceExclusion,
  type InvoiceSource,
} from "./invoice-source";

export interface InvoiceSnapshot extends InvoiceComputation {
  company: { id: number; name: string; timeZone: string };
  client: InvoiceClient;
  period: string;
  roundingRule: string;
  exclusions: InvoiceExclusion[];
  issuedByName?: string;
}
interface DraftRow {
  id: string;
  client_id: number;
  period: string;
  review_hash: string;
  snapshot: InvoiceSnapshot;
  generated_by: number;
  generated_at: Date;
}
interface IssuedRow {
  id: string;
  client_id: number;
  period: string;
  review_hash: string;
  snapshot: InvoiceSnapshot;
  number: string;
  issued_by: number;
  issued_at: Date;
}
export type InvoiceDocument = InvoiceSnapshot & {
  id: string;
  status: "draft" | "issued";
  reviewHash: string;
  number: string | null;
  generatedAt?: string;
  generatedBy?: number;
  issuedAt?: string;
  issuedBy?: number;
};

function draftDocument(row: DraftRow): InvoiceDocument {
  return {
    ...row.snapshot,
    id: row.id,
    status: "draft",
    number: null,
    reviewHash: row.review_hash,
    generatedAt: row.generated_at.toISOString(),
    generatedBy: row.generated_by,
  };
}
function issuedDocument(row: IssuedRow): InvoiceDocument {
  return {
    ...row.snapshot,
    id: row.id,
    status: "issued",
    reviewHash: row.review_hash,
    number: row.number,
    issuedAt: row.issued_at.toISOString(),
    issuedBy: row.issued_by,
  };
}
function uuid(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    throw new BadRequestException("Identificador de fatura inválido.");
}
function admin(actor: CurrentUser) {
  if (actor.role !== "admin")
    throw new ForbiddenException(
      "Apenas o administrativo pode preparar e emitir faturas.",
    );
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly tenant: InvoiceTransactions,
    @Inject(INVOICE_SOURCE) private readonly source: InvoiceSource,
  ) {}

  clients(actor: CurrentUser) {
    admin(actor);
    return this.tenant.inCompany(actor.company_id, (tx) =>
      this.source.clients(tx, actor),
    );
  }

  private async history(tx: Prisma.TransactionClient): Promise<PostedLine[]> {
    const issued = await tx.$queryRaw<
      IssuedRow[]
    >`SELECT * FROM financial_invoices ORDER BY issued_at, sequence_year, sequence_number`;
    return issued.flatMap((invoice) =>
      invoice.snapshot.lines.map((line) => ({
        ...line,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
      })),
    );
  }

  private async compute(
    tx: Prisma.TransactionClient,
    actor: CurrentUser,
    clientId: number,
    period: string,
  ) {
    const clients = await this.source.clients(tx, actor);
    const client = clients.find((item) => item.id === clientId);
    if (!client) throw new NotFoundException("Cliente não encontrado.");
    const company = await tx.company.findUniqueOrThrow({
      where: { id: actor.company_id },
    });
    const currentMonth = new Intl.DateTimeFormat("sv-SE", {
      timeZone: company.timeZone,
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    if (period > currentMonth)
      throw new BadRequestException("Não é possível faturar um mês futuro.");
    const later = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM financial_invoices WHERE client_id = ${clientId} AND period >= ${period} LIMIT 1`;
    if (later.length)
      throw new ConflictException(
        "Já existe uma fatura neste mês ou num mês posterior. Use o mês seguinte para ajustes.",
      );
    const history = await this.history(tx);
    const entries = await this.source.entries(tx, actor.company_id);
    const exclusions = (
      (await this.source.exclusions?.(tx, clientId, period)) ?? []
    ).sort((a, b) => a.entryId.localeCompare(b.entryId));
    const excludedIds = new Set(exclusions.map((entry) => entry.entryId));
    if (
      history.some((line) =>
        [...line.before, ...line.after].some((entry) =>
          excludedIds.has(entry.id),
        ),
      )
    )
      throw new ConflictException(
        "Um registo já faturado exige um ajuste e não pode ser excluído.",
      );
    const result = computeInvoice({
      entries: entries.filter((entry) => !excludedIds.has(entry.id)),
      history,
      clientId,
      period,
    });
    const snapshot: InvoiceSnapshot = {
      ...result,
      company: {
        id: company.id,
        name: company.name,
        timeZone: company.timeZone,
      },
      client,
      period,
      roundingRule: ROUNDING_RULE,
      exclusions,
    };
    const historicalIds = new Set(
      history
        .filter((line) => line.clientId === clientId)
        .flatMap((line) =>
          [...line.before, ...line.after].map((entry) => entry.id),
        ),
    );
    // Include source versions and justifications even when a change rounds to zero.
    const relevant = entries
      .filter(
        (entry) => entry.clientId === clientId || historicalIds.has(entry.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    const reviewHash = createHash("sha256")
      .update(JSON.stringify({ snapshot, entries: relevant }))
      .digest("hex");
    return { snapshot, reviewHash };
  }

  async draft(
    actor: CurrentUser,
    clientId: number,
    period: string,
  ): Promise<InvoiceDocument> {
    admin(actor);
    if (
      !Number.isSafeInteger(clientId) ||
      clientId < 1 ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
    )
      throw new BadRequestException("Indique cliente e mês válidos (AAAA-MM).");
    return this.tenant.inCompany(actor.company_id, async (tx) => {
      const { snapshot, reviewHash } = await this.compute(
        tx,
        actor,
        clientId,
        period,
      );
      const [row] = await tx.$queryRaw<DraftRow[]>`
        INSERT INTO financial_drafts (id, company_id, client_id, period, review_hash, snapshot, generated_by)
        VALUES (${randomUUID()}::uuid, ${actor.company_id}, ${clientId}, ${period}, ${reviewHash}, ${JSON.stringify(snapshot)}::jsonb, ${actor.id})
        ON CONFLICT (company_id, client_id, period) DO UPDATE SET
          review_hash = EXCLUDED.review_hash, snapshot = EXCLUDED.snapshot,
          generated_by = EXCLUDED.generated_by, generated_at = clock_timestamp()
        RETURNING *`;
      return draftDocument(row);
    });
  }

  async issue(
    actor: CurrentUser,
    id: string,
    expectedHash: string,
  ): Promise<InvoiceDocument> {
    admin(actor);
    uuid(id);
    if (!/^[a-f0-9]{64}$/.test(expectedHash))
      throw new BadRequestException(
        "Confirme o rascunho revisto antes de emitir.",
      );
    return this.tenant.inCompany(actor.company_id, async (tx) => {
      const [existing] = await tx.$queryRaw<
        IssuedRow[]
      >`SELECT * FROM financial_invoices WHERE id = ${id}::uuid`;
      if (existing) {
        if (existing.review_hash !== expectedHash)
          throw new ConflictException(
            "A confirmação não corresponde ao documento emitido.",
          );
        return issuedDocument(existing);
      }
      const [draft] = await tx.$queryRaw<
        DraftRow[]
      >`SELECT * FROM financial_drafts WHERE id = ${id}::uuid`;
      if (!draft) throw new NotFoundException("Rascunho não encontrado.");
      if (draft.review_hash !== expectedHash)
        throw new ConflictException(
          "O rascunho foi atualizado. Reveja-o antes de emitir.",
        );
      const { snapshot, reviewHash } = await this.compute(
        tx,
        actor,
        draft.client_id,
        draft.period,
      );
      if (reviewHash !== expectedHash)
        throw new ConflictException(
          "Os dados mudaram desde a revisão. Gere e confirme um novo rascunho.",
        );
      if (snapshot.problems.length)
        throw new ConflictException({
          message: "Resolva os bloqueios antes de emitir.",
          problems: snapshot.problems,
        });
      if (!snapshot.lines.length)
        throw new ConflictException(
          "Não existem valores ou horas por faturar.",
        );
      const now = new Date();
      const year = Number(
        new Intl.DateTimeFormat("en", {
          timeZone: snapshot.company.timeZone,
          year: "numeric",
        }).format(now),
      );
      const [counter] = await tx.$queryRaw<{ last_number: number }[]>`
        INSERT INTO financial_counters (company_id, year, last_number) VALUES (${actor.company_id}, ${year}, 1)
        ON CONFLICT (company_id, year) DO UPDATE SET last_number = financial_counters.last_number + 1 RETURNING last_number`;
      const number = `FT ${year}/${counter.last_number}`;
      const issuedSnapshot = { ...snapshot, issuedByName: actor.name };
      const [invoice] = await tx.$queryRaw<IssuedRow[]>`
        INSERT INTO financial_invoices (id, company_id, client_id, period, sequence_year, sequence_number, number, review_hash, snapshot, total_cents, issued_by, issued_at)
        VALUES (${id}::uuid, ${actor.company_id}, ${draft.client_id}, ${draft.period}, ${year}, ${counter.last_number}, ${number}, ${expectedHash}, ${JSON.stringify(issuedSnapshot)}::jsonb, ${snapshot.totalCents}, ${actor.id}, ${now})
        RETURNING *`;
      return issuedDocument(invoice);
    });
  }

  async list(actor: CurrentUser): Promise<InvoiceDocument[]> {
    return this.tenant.inCompany(actor.company_id, async (tx) => {
      const clientId = await this.clientScope(tx, actor);
      const issued =
        clientId === null
          ? await tx.$queryRaw<
              IssuedRow[]
            >`SELECT * FROM financial_invoices ORDER BY issued_at DESC`
          : await tx.$queryRaw<
              IssuedRow[]
            >`SELECT * FROM financial_invoices WHERE client_id = ${clientId} ORDER BY issued_at DESC`;
      if (actor.role === "client") return issued.map(issuedDocument);
      const drafts = await tx.$queryRaw<
        DraftRow[]
      >`SELECT d.* FROM financial_drafts d WHERE NOT EXISTS (SELECT 1 FROM financial_invoices i WHERE i.id = d.id) ORDER BY generated_at DESC`;
      return [...drafts.map(draftDocument), ...issued.map(issuedDocument)];
    });
  }

  async get(actor: CurrentUser, id: string): Promise<InvoiceDocument> {
    uuid(id);
    return this.tenant.inCompany(actor.company_id, async (tx) => {
      const clientId = await this.clientScope(tx, actor);
      const [invoice] = await tx.$queryRaw<
        IssuedRow[]
      >`SELECT * FROM financial_invoices WHERE id = ${id}::uuid`;
      if (invoice && (clientId === null || invoice.client_id === clientId))
        return issuedDocument(invoice);
      if (actor.role === "admin") {
        const [draft] = await tx.$queryRaw<
          DraftRow[]
        >`SELECT * FROM financial_drafts WHERE id = ${id}::uuid`;
        if (draft) return draftDocument(draft);
      }
      throw new NotFoundException("Fatura não encontrada.");
    });
  }

  private async clientScope(
    tx: Prisma.TransactionClient,
    actor: CurrentUser,
  ): Promise<number | null> {
    if (actor.role === "admin") return null;
    if (actor.role !== "client")
      throw new ForbiddenException("Este perfil não pode consultar faturas.");
    const clientId = await this.source.clientForUser(tx, actor);
    if (clientId === null || !Number.isSafeInteger(clientId) || clientId < 1)
      throw new NotFoundException("Cliente não encontrado.");
    return clientId;
  }
}
