import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { IdentityController } from "./identity/identity.controller";
import { IdentityGuard } from "./identity/identity.guard";
import { SitesController } from "./sites/sites.controller";
@Module({
  imports: [PrismaModule, HealthModule],
  controllers: [IdentityController, SitesController],
  providers: [{ provide: APP_GUARD, useClass: IdentityGuard }],
})
export class AppModule {}
