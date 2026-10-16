import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { invoiceTestDatabase } from './invoice-test-database';
it('repetir seed preserva o vínculo comercial e os nomes editados', async () => {
  const database = await invoiceTestDatabase();
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: database.adminUrl }),
  });
  try {
    const original = await db.client.findFirstOrThrow({
      where: { userId: { not: null } },
    });
    await db.client.update({
      where: { id: original.id },
      data: { userId: null },
    });
    const custom = await db.client.create({
      data: {
        companyId: original.companyId,
        name: 'Cliente ligado pelo administrativo',
        userId: original.userId,
      },
    });
    const worker = await db.worker.findFirstOrThrow({
      where: { companyId: original.companyId },
    });
    await db.worker.update({
      where: { id: worker.id },
      data: { name: 'Nome do trabalhador editado' },
    });
    const before = await db.client.count();
    execFileSync('npm', ['run', 'db:seed'], {
      env: {
        ...process.env,
        DATABASE_URL: database.appUrl,
        ADMIN_DATABASE_URL: database.adminUrl,
      },
      stdio: 'pipe',
    });
    expect(
      (
        await db.client.findUniqueOrThrow({
          where: { userId: original.userId! },
        })
      ).id,
    ).toBe(custom.id);
    expect(
      (await db.client.findUniqueOrThrow({ where: { id: original.id } }))
        .userId,
    ).toBeNull();
    expect(
      (await db.worker.findUniqueOrThrow({ where: { id: worker.id } })).name,
    ).toBe('Nome do trabalhador editado');
    expect(await db.client.count()).toBe(before);
  } finally {
    await db.$disconnect();
    await database.close();
  }
}, 30000);
