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
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
