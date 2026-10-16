import { BillingModule } from './billing/billing.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PlanningModule } from './planning/planning.module';
import { CatalogModule } from './catalog/catalog.module';
import { Module } from '@nestjs/common';
import { InvoicesModule } from './invoices/invoices.module';
import { INVOICE_SOURCE } from './invoices/invoice-source';
import { OperationalInvoiceSource } from './billing/operational-invoice-source';
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
    InvoicesModule.withSource({ provide: INVOICE_SOURCE, useExisting: OperationalInvoiceSource }, [BillingModule]),
    SitesModule,
    CatalogModule,
    PlanningModule,
    AttendanceModule,
    BillingModule,
  ],
})
export class AppModule {}

