import { Module } from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module";
import { OperationalInvoiceSource } from "./operational-invoice-source";
import { PricingService } from "./pricing.service";
import { BillingService } from "./billing.service";
import { BillingController } from "./billing.controller";
@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [OperationalInvoiceSource, PricingService, BillingService],
  exports: [OperationalInvoiceSource, BillingService],
})
export class BillingModule {}
