import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import type { CurrentUser } from "../identity/identity";
import type { FinancialEntry } from "./invoice-engine";

export const INVOICE_SOURCE = Symbol("INVOICE_SOURCE");
export interface InvoiceClient {
  id: number;
  name: string;
}
export interface InvoiceExclusion {
  entryId: string;
  reason: string;
  authorName: string;
  createdAt: string;
}

/** Implemented by phases 2–5. All reads must use tx, after the financial lock.
 * Return every current company entry, including voided and transferred entries;
 * never omit previously billed entries. Resolve client and price on the server.
 */
export interface InvoiceSource {
  clients(
    tx: Prisma.TransactionClient,
    actor: CurrentUser,
  ): Promise<InvoiceClient[]>;
  clientForUser(
    tx: Prisma.TransactionClient,
    actor: CurrentUser,
  ): Promise<number | null>;
  entries(
    tx: Prisma.TransactionClient,
    companyId: number,
  ): Promise<FinancialEntry[]>;
  exclusions?(
    tx: Prisma.TransactionClient,
    clientId: number,
    period: string,
  ): Promise<InvoiceExclusion[]>;
}

/** Fail closed until the operational modules publish their source adapter. */
export class MissingInvoiceSource implements InvoiceSource {
  async clients(): Promise<InvoiceClient[]> {
    return this.unavailable();
  }
  async clientForUser(): Promise<number | null> {
    return this.unavailable();
  }
  async entries(): Promise<FinancialEntry[]> {
    return this.unavailable();
  }
  private unavailable(): never {
    throw new ServiceUnavailableException(
      "A faturação aguarda a integração dos registos e preços das fases 2 a 5.",
    );
  }
}

/** Corrections, source renames and price changes affecting billing must acquire
 * this SAME lock BEFORE reading/changing data, inside their existing transaction.
 */
export async function lockCompanyFinance(
  tx: Prisma.TransactionClient,
  companyId: number,
): Promise<void> {
  await tx.$queryRaw`SELECT public.app_lock_finance(${companyId}::integer)::text`;
}
