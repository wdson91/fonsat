import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantService } from '../database/tenant.service';
import type { Prisma } from '../generated/prisma/client';
import type { CurrentUser } from '../identity/identity';

@Injectable()
export class SitesService {
  constructor(private readonly tenant: TenantService) {}

  findAll(user: CurrentUser) {
    return this.tenant.inCompany(user.company_id, (tx) =>
      tx.site.findMany({
        where: this.buildScope(user),
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findOne(user: CurrentUser, id: number) {
    const site = await this.tenant.inCompany(user.company_id, (tx) =>
      tx.site.findFirst({
        where: { ...this.buildScope(user), id },
        select: { id: true, name: true },
      }),
    );
    if (!site) {
      throw new NotFoundException('Obra não encontrada.');
    }
    return site;
  }

  private buildScope(user: CurrentUser): Prisma.SiteWhereInput {
    if (user.role === 'admin') {
      return {};
    }
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: user.time_zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
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
}

