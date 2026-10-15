import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Public } from "./identity/identity";
import { PrismaService } from "./database/prisma.service";
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException("Base de dados indisponível.");
    }
    return { status: "ok", database: "ok" };
  }
}
