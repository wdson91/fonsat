import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaService } from "./database/prisma.service";
import { HealthController } from "./health.controller";
import { IdentityController } from "./identity/identity.controller";
import { IdentityGuard } from "./identity/identity.guard";
@Module({
  controllers: [HealthController, IdentityController],
  providers: [PrismaService, { provide: APP_GUARD, useClass: IdentityGuard }],
})
export class AppModule {}
