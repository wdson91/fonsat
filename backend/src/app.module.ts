import { AttendanceModule } from './attendance/attendance.module';
import { PlanningModule } from './planning/planning.module';
import { CatalogModule } from './catalog/catalog.module';
import { Module } from '@nestjs/common';
import { InvoicesModule } from './invoices/invoices.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './database/prisma.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { SitesModule } from './sites/sites.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    IdentityModule,
    InvoicesModule,
    SitesModule,
    CatalogModule,
    PlanningModule,
    AttendanceModule,
  ],
})
export class AppModule {}

