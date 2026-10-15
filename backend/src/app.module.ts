import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./database/prisma.module";
import { HealthController } from "./health.controller";
import { IdentityController } from "./identity/identity.controller";
import { IdentityGuard } from "./identity/identity.guard";
import { SitesController } from "./sites/sites.controller";
@Module({
  imports: [PrismaModule],
  controllers: [HealthController, IdentityController, SitesController],
  providers: [{ provide: APP_GUARD, useClass: IdentityGuard }],
})
export class AppModule {}
