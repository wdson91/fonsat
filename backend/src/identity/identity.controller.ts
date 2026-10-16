import { Controller, Get, Header } from "@nestjs/common";
import { Actor, type CurrentUser, Public } from "./identity";
import { IdentityService } from "./identity.service";

@Controller()
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Public()
  @Get("demo-users")
  @Header("Cache-Control", "no-store")
  listUsers() {
    return this.identityService.listDemoUsers();
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  me(@Actor() user: CurrentUser) {
    return user;
  }
}
