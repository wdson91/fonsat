import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { Prisma } from "../generated/prisma/client";
import { lockCompanyFinance } from "./invoice-source";

@Injectable()
export class InvoiceTransactions {
  constructor(private readonly prisma: PrismaService) {}

  inCompany<T>(
    companyId: number,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.company_id', ${String(companyId)}, true)`;
        await lockCompanyFinance(tx, companyId);
        return operation(tx);
      },
      {
        maxWait: 10000,
        timeout: 20000,
        // Each statement sees changes committed by the previous lock holder.
        // Serializable would fix a snapshot before waiting for the advisory lock.
        isolationLevel: "ReadCommitted",
      },
    );
  }
}
