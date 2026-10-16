import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TenantService } from "./tenant.service";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, TenantService],
  exports: [PrismaService, TenantService],
})
export class PrismaModule {}
