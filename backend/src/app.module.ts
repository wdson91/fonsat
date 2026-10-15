import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaService } from "./database/prisma.service";
import { HealthController } from "./health.controller";
import { IdentityController } from "./identity/identity.controller";
import { IdentityGuard } from "./identity/identity.guard";
import { SitesController } from "./sites/sites.controller";
@Module({
  controllers: [HealthController, IdentityController, SitesController],
  providers: [PrismaService, { provide: APP_GUARD, useClass: IdentityGuard }],
})
export class AppModule {}
