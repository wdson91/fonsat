import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import type { CurrentUser, DemoUser } from "./identity";

@Injectable()
export class IdentityService {
  constructor(private readonly prisma: PrismaService) {}

  listDemoUsers() {
    return this.prisma.$queryRaw<
      DemoUser[]
    >`SELECT * FROM public.app_demo_users()`;
  }

  async resolveUser(id: number): Promise<CurrentUser | null> {
    const users = await this.prisma.$queryRaw<
      CurrentUser[]
    >`SELECT * FROM public.app_resolve_user(${id}::integer)`;
    return users[0] ?? null;
  }
}
