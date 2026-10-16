import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
} from "@nestjs/common";
import { Actor, Roles, type CurrentUser } from "../identity/identity";
import { InvoicesService } from "./invoices.service";

function object(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new BadRequestException("Pedido inválido.");
  return body as Record<string, unknown>;
}

@Controller("invoices")
@Roles("admin", "client")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get("clients")
  @Roles("admin")
  @Header("Cache-Control", "no-store")
  clients(@Actor() actor: CurrentUser) {
    return this.invoices.clients(actor);
  }

  @Get()
  @Header("Cache-Control", "no-store")
  list(@Actor() actor: CurrentUser) {
    return this.invoices.list(actor);
  }

  @Post("drafts")
  @Roles("admin")
  @Header("Cache-Control", "no-store")
  draft(@Actor() actor: CurrentUser, @Body() body: unknown) {
    const value = object(body);
    if (typeof value.clientId !== "number" || typeof value.period !== "string")
      throw new BadRequestException("Indique cliente e mês.");
    return this.invoices.draft(actor, value.clientId, value.period);
  }

  @Post(":id/issue")
  @Roles("admin")
  @Header("Cache-Control", "no-store")
  issue(
    @Actor() actor: CurrentUser,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const value = object(body);
    if (typeof value.expectedHash !== "string")
      throw new BadRequestException("Confirme o rascunho antes de emitir.");
    return this.invoices.issue(actor, id, value.expectedHash);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  get(@Actor() actor: CurrentUser, @Param("id") id: string) {
    return this.invoices.get(actor, id);
  }
}
