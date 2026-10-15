import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
const connectionString = process.env.ADMIN_DATABASE_URL;
if (!connectionString) throw new Error('ADMIN_DATABASE_URL é obrigatório para os dados de demonstração.');
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
async function seed() {
  for (const name of ['FONSAT', 'Construções Horizonte']) {
    await db.company.upsert({ where: { name }, update: {}, create: { name } });
  }
}
seed().finally(() => db.$disconnect()).catch((error) => { console.error(error); process.exitCode = 1; });
