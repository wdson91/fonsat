import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL é obrigatório.");
    super({ adapter: new PrismaPg({ connectionString, max: 5 }) });
  }
  // O contexto fica preso à mesma transação/conexão e desaparece no fim.
  inCompany<T>(
    companyId: number,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT set_config('app.company_id', ${String(companyId)}, true)`;
        return operation(tx);
      },
      { maxWait: 5000, timeout: 10000 },
    );
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
