import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import type { Prisma } from "../generated/prisma/client";

@Injectable()
export class TenantService {
  constructor(private readonly prisma: PrismaService) {}

  inCompany<T>(
    companyId: number,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.company_id', ${String(companyId)}, true)`;
        return operation(tx);
      },
      { maxWait: 5000, timeout: 10000, isolationLevel: "Serializable" },
    );
  }
}
