import {
  Controller,
  Get,
  Inject,
  ServiceUnavailableException,
} from "@nestjs/common";
import { PrismaService } from "./database/prisma.service";
@Controller("health")
export class HealthController {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}
  @Get()
  async health() {
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Base de dados indisponível.");
    }
    return { status: "ok", database: "ok" };
  }
}
