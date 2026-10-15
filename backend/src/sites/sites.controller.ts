import { Controller, Get, Header, Param, ParseIntPipe } from "@nestjs/common";
import { Actor, CurrentUser, Roles } from "../identity/identity";
import { SitesService } from "./sites.service";

@Controller("sites")
@Roles("admin", "foreman")
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  findAll(@Actor() user: CurrentUser) {
    return this.sitesService.findAll(user);
  }

  @Get(":id")
  @Header("Cache-Control", "no-store")
  findOne(
    @Actor() user: CurrentUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.sitesService.findOne(user, id);
  }
}
