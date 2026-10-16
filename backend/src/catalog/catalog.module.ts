import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { PrismaModule } from "../database/prisma.module";
import { DatabaseFilter } from "../common/database.filter";
import { ScopeService } from "../common/scope.service";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

@Module({
  imports: [PrismaModule],
  controllers: [CatalogController],
  providers: [
    CatalogService,
    ScopeService,
    { provide: APP_FILTER, useClass: DatabaseFilter },
  ],
  exports: [ScopeService],
})
export class CatalogModule {}
