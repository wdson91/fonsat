import {
  Module,
  type DynamicModule,
  type ModuleMetadata,
  type Provider,
} from "@nestjs/common";
import { PrismaModule } from "../database/prisma.module";
import { INVOICE_SOURCE, MissingInvoiceSource } from "./invoice-source";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { InvoiceTransactions } from "./invoice-transactions";

@Module({
  imports: [PrismaModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceTransactions,
    { provide: INVOICE_SOURCE, useClass: MissingInvoiceSource },
  ],
  exports: [InvoicesService],
})
export class InvoicesModule {
  static withSource(
    provider: Provider,
    imports: ModuleMetadata["imports"] = [],
  ): DynamicModule {
    return { module: InvoicesModule, imports, providers: [provider] };
  }
}
