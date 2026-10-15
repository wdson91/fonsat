import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "../database/prisma.module";
import { IdentityController } from "./identity.controller";
import { IdentityGuard } from "./identity.guard";
import { IdentityService } from "./identity.service";

@Module({
  imports: [PrismaModule],
  controllers: [IdentityController],
  providers: [IdentityService, { provide: APP_GUARD, useClass: IdentityGuard }],
  exports: [IdentityService],
})
export class IdentityModule {}
