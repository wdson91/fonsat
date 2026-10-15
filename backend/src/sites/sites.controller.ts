import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { Actor, CurrentUser, Roles } from "../identity/identity";
import type { Prisma } from "../generated/prisma/client";
function scope(user: CurrentUser): Prisma.SiteWhereInput {
  if (user.role === "admin") return {};
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: user.time_zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const today = new Date(`${day}T00:00:00Z`);
  return {
    responsibilities: {
      some: {
        userId: user.id,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
      },
    },
  };
}
@Controller("sites")
@Roles("admin", "foreman")
export class SitesController {
  constructor(private readonly prisma: PrismaService) {}
  @Get()
  @Header("Cache-Control", "no-store")
  list(@Actor() user: CurrentUser) {
    return this.prisma.inCompany(user.company_id, (tx) =>
      tx.site.findMany({
        where: scope(user),
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    );
  }
  @Get(":id")
  @Header("Cache-Control", "no-store")
  async detail(
    @Actor() user: CurrentUser,
    @Param("id", ParseIntPipe) id: number,
  ) {
    const site = await this.prisma.inCompany(user.company_id, (tx) =>
      tx.site.findFirst({
        where: { ...scope(user), id },
        select: { id: true, name: true },
      }),
    );
    if (!site) throw new NotFoundException("Obra não encontrada.");
    return site;
  }
}
