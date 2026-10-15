import { Module } from "@nestjs/common";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { IdentityModule } from "./identity/identity.module";
import { SitesController } from "./sites/sites.controller";
@Module({
  imports: [PrismaModule, HealthModule, IdentityModule],
  controllers: [SitesController],
})
export class AppModule {}
