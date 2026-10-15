import { Controller, Get, Header } from "@nestjs/common";
import { IdentityService } from "./identity.service";
import { Actor, CurrentUser, Public } from "./identity";
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
