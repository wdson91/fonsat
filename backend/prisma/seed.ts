import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '../src/generated/prisma/client';
const connectionString = process.env.ADMIN_DATABASE_URL;
if (!connectionString)
  throw new Error(
    'ADMIN_DATABASE_URL é obrigatório para os dados de demonstração.',
  );
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
async function seed() {
  await db.$transaction(async (tx) => {
    const examples = [
      {
        name: 'FONSAT',
        color: '#ec405c',
        names: [
          'João Silva',
          'Carlos Mendes',
          'Sofia Ramos',
          'Mota Obras',
          'Rita Santos',
          'Teixeira Construções',
        ],
      },
      {
        name: 'Construções Horizonte',
        color: '#138a96',
        names: [
          'André Costa',
          'Helena Sousa',
          'Ana Martins',
          'Lusovia Engenharia',
          'Pedro Faria',
          'Obras do Norte',
        ],
      },
    ];
    const roles: UserRole[] = [
      'worker',
      'foreman',
      'admin',
      'client',
      'foreman',
      'client',
    ];
    for (const example of examples) {
      const company = await tx.company.upsert({
        where: { name: example.name },
        update: {},
        create: { name: example.name, brandColor: example.color },
      });
      const users = [];
      for (let i = 0; i < example.names.length; i++) {
        users.push(
          await tx.demoUser.upsert({
            where: {
              companyId_name: { companyId: company.id, name: example.names[i] },
            },
            update: {},
            create: {
              companyId: company.id,
              name: example.names[i],
              role: roles[i],
            },
          }),
        );
      }
      const trade = await tx.trade.upsert({
        where: { companyId_name: { companyId: company.id, name: 'Pedreiro' } },
        update: {},
        create: { companyId: company.id, name: 'Pedreiro' },
      });
      await tx.trade.upsert({
        where: { companyId_name: { companyId: company.id, name: 'Pintor' } },
        update: {},
        create: { companyId: company.id, name: 'Pintor' },
      });
      if (!(await tx.worker.findUnique({ where: { userId: users[0].id } })))
        await tx.worker.upsert({
          where: {
            companyId_name: { companyId: company.id, name: users[0].name },
          },
          update: {},
          create: {
            companyId: company.id,
            name: users[0].name,
            userId: users[0].id,
            tradeId: trade.id,
          },
        });
      const clients = [];
      for (const u of [users[3], users[5]]) {
        const linked = await tx.client.findUnique({ where: { userId: u.id } });
        clients.push(
          linked ??
            (await tx.client.upsert({
              where: {
                companyId_name: { companyId: company.id, name: u.name },
              },
              update: {},
              create: { companyId: company.id, name: u.name, userId: u.id },
            })),
        );
      }
      for (let i = 0; i < clients.length; i++)
        if (!clients[i].userId)
          await tx.client.update({
            where: { id: clients[i].id },
            data: { userId: [users[3], users[5]][i].id },
          });
      for (const [name, foreman] of [
        ['Edifício Aurora', users[1]],
        ['Armazém Norte', users[4]],
      ] as const) {
        const site = await tx.site.upsert({
          where: { companyId_name: { companyId: company.id, name } },
          update: {},
          create: { companyId: company.id, name },
        });
        if (!site.clientId)
          await tx.site.update({
            where: { id: site.id },
            data: { clientId: clients[name === 'Edifício Aurora' ? 0 : 1].id },
          });
        const startsOn = new Date('2026-01-01T00:00:00Z');
        await tx.siteResponsibility.upsert({
          where: {
            companyId_siteId_userId_startsOn: {
              companyId: company.id,
              siteId: site.id,
              userId: foreman.id,
              startsOn,
            },
          },
          update: {},
          create: {
            companyId: company.id,
            siteId: site.id,
            userId: foreman.id,
            startsOn,
          },
        });
      }
    }
  });
}
seed()
  .finally(() => db.$disconnect())
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
