import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from "@nestjs/common";
import { Actor, Roles, type CurrentUser } from "../identity/identity";
import { PricingService } from "./pricing.service";
import { BillingService } from "./billing.service";
@Controller("billing")
@Roles("admin")
export class BillingController {
  constructor(
    private readonly pricing: PricingService,
    private readonly billing: BillingService,
  ) {}

  @Get("rates")
  rates(@Actor() u: CurrentUser) {
    return this.pricing.list(u);
  }

  @Post("rates")
  rate(
    @Actor() u: CurrentUser,
    @Body() b: Parameters<PricingService["create"]>[1],
  ) {
    return this.pricing.create(u, b);
  }

  @Patch("rates/:id")
  close(
    @Actor() u: CurrentUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() b: { endsOn: unknown },
  ) {
    return this.pricing.close(u, id, b.endsOn);
  }

  @Post("drafts")
  draft(
    @Actor() u: CurrentUser,
    @Body() b: Parameters<BillingService["generate"]>[1],
  ) {
    return this.billing.generate(u, b);
  }

  @Post("drafts/:id/exclusions")
  exclude(
    @Actor() u: CurrentUser,
    @Param("id") id: string,
    @Body() b: Parameters<BillingService["exclude"]>[2],
  ) {
    return this.billing.exclude(u, id, b);
  }
}
