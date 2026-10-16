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
import {
  CatalogService,
  type CatalogInput,
  type CatalogKind,
} from "./catalog.service";

@Controller("catalog")
@Roles("admin", "foreman")
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(@Actor() user: CurrentUser) {
    return this.catalog.list(user);
  }

  @Post("responsibilities")
  @Roles("admin")
  responsibility(
    @Actor() user: CurrentUser,
    @Body() body: Parameters<CatalogService["responsibility"]>[1],
  ) {
    return this.catalog.responsibility(user, body);
  }

  @Post(":kind")
  @Roles("admin")
  create(
    @Actor() user: CurrentUser,
    @Param("kind") kind: CatalogKind,
    @Body() body: CatalogInput,
  ) {
    return this.catalog.save(user, kind, body);
  }

  @Patch(":kind/:id")
  @Roles("admin")
  update(
    @Actor() user: CurrentUser,
    @Param("kind") kind: CatalogKind,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: CatalogInput,
  ) {
    return this.catalog.save(user, kind, body, id);
  }
}
