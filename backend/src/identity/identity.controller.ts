import { Controller, Get, Header } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Actor, CurrentUser, DemoUser, Public } from "./identity";
@Controller()
export class IdentityController {
  constructor(private readonly prisma: PrismaService) {}
  @Public()
  @Get("demo-users")
  @Header("Cache-Control", "no-store")
  listUsers() {
    return this.prisma.$queryRaw<DemoUser[]>`SELECT * FROM public.app_demo_users()`;
  }
  @Get("me")
  @Header("Cache-Control", "no-store")
  me(@Actor() user: CurrentUser) {
    return user;
  }
}
