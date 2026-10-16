import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';
import { TenantService } from '../src/database/tenant.service';
let app: INestApplication,
  tenant: TenantService,
  admin: number,
  user: number,
  company: number,
  client: number,
  site: number,
  trade: number,
  defaultTrade: number,
  draftId: string,
  missing: string,
  incomplete: string;
const call = (
  method: 'get' | 'post' | 'patch',
  path: string,
  body?: object,
  id = admin,
) =>
  request(app.getHttpServer())
    [method]('/api' + path)
    .set('X-User-Id', String(id))
    .send(body);
async function entry(day: string, minutes: number | null, usedTrade = trade) {
  const id = randomUUID();
  const start = day + 'T08:00:00Z';
  const end =
    minutes === null
      ? null
      : new Date(Date.parse(start) + minutes * 60000).toISOString();
  const result = await call(
    'post',
    '/attendance/sync',
    {
      events: [
        {
          id: randomUUID(),
          shiftId: id,
          siteId: site,
          kind: 'in',
          occurredAt: start,
        },
      ],
    },
    user,
  );
  expect(result.body.results[0].accepted).toBe(true);
  const corrected = await call('post', `/attendance/${id}/corrections`, {
    expectedVersion: 1,
    siteId: site,
    tradeId: usedTrade,
    startAt: start,
    endAt: end,
    reason: 'Preparar horas reais para validação',
  });
  expect(corrected.status).toBe(201);
  return id;
}
const generate = (period = '2025-01') =>
  call('post', '/billing/drafts', { clientId: client, period });
beforeAll(async () => {
  app = await createApp();
  await app.init();
  tenant = app.get(TenantService);
  const users = (await request(app.getHttpServer()).get('/api/demo-users'))
    .body;
  company = users[0].company_id;
  admin = users.find(
    (u: any) => u.company_id === company && u.role === 'admin',
  ).id;
  user = users.find(
    (u: any) => u.company_id === company && u.role === 'worker',
  ).id;
  const c = (await call('get', '/catalog')).body;
  site = c.sites[0].id;
  client = c.sites[0].clientId;
  defaultTrade = c.workers[0].tradeId;
  const created = await call('post', '/catalog/trades', {
    name: 'Validação preços ' + randomUUID(),
  });
  expect(created.status).toBe(201);
  trade = created.body.id;
});
afterAll(async () => {
  await app?.close();
});
it('define duas vigências, recusa sobreposição também no banco e protege preços por perfil', async () => {
  expect(
    (
      await call('post', '/billing/rates', {
        clientId: client,
        tradeId: trade,
        cents: 100,
        startsOn: '2024-01-01',
        endsOn: '2025-01-15',
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await call('post', '/billing/rates', {
        clientId: client,
        tradeId: trade,
        cents: 200,
        startsOn: '2025-01-16',
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await call('post', '/billing/rates', {
        clientId: client,
        tradeId: trade,
        cents: 100,
        startsOn: '2025-01-15',
      })
    ).status,
  ).toBe(409);
  await expect(
    tenant.inCompany(company, (tx) =>
      tx.rate.create({
        data: {
          companyId: company,
          clientId: client,
          tradeId: trade,
          cents: 10,
          startsOn: new Date('2025-01-15'),
        },
      }),
    ),
  ).rejects.toThrow();
  expect((await call('get', '/billing/rates', undefined, user)).status).toBe(
    403,
  );
});
it('usa ofício exercido, preço a meio do mês, trabalho tardio e arredonda uma vez por linha', async () => {
  await entry('2025-01-10', 1);
  await entry('2025-01-11', 1);
  await entry('2025-01-20', 60);
  await entry('2024-12-31', 60);
  const result = await generate();
  expect(result.status).toBe(201);
  draftId = result.body.id;
  const lines = result.body.snapshot.lines.filter(
    (l: any) => l.tradeId === trade,
  );
  expect(lines).toHaveLength(2);
  expect(
    lines
      .map((l: any) => [l.targetMinutes, l.amountCents])
      .sort((a: number[], b: number[]) => a[0] - b[0]),
  ).toEqual([
    [60, 200],
    [62, 103],
  ]);
  expect(
    lines
      .flatMap((l: any) => l.after)
      .some((e: any) => e.workedOn === '2024-12-31'),
  ).toBe(true);
});
it('mostra bloqueios por preço ausente e registo incompleto e exige motivo para excluir', async () => {
  missing = await entry('2025-01-12', 60, defaultTrade);
  incomplete = await entry('2025-01-13', null);
  const result = await generate();
  expect(result.body.id).toBe(draftId);
  const problems = result.body.snapshot.problems;
  expect(problems.some((p: any) => p.entryId === missing)).toBe(true);
  expect(problems.some((p: any) => p.entryId === incomplete)).toBe(true);
  expect(
    (
      await call('post', `/billing/drafts/${draftId}/exclusions`, {
        entryId: missing,
        reason: ' ',
      })
    ).status,
  ).toBe(400);
  for (const id of [missing, incomplete])
    expect(
      (
        await call('post', `/billing/drafts/${draftId}/exclusions`, {
          entryId: id,
          reason: 'Resolver no próximo período',
        })
      ).status,
    ).toBe(201);
  const updated = (await generate()).body;
  expect(
    updated.exclusions.some(
      (e: any) =>
        e.entryId === missing && e.reason === 'Resolver no próximo período',
    ),
  ).toBe(true);
  expect(
    updated.snapshot.problems.some((p: any) =>
      [missing, incomplete].includes(p.entryId),
    ),
  ).toBe(false);
  const next = (await generate('2025-02')).body;
  expect(next.snapshot.problems.some((p: any) => p.entryId === missing)).toBe(
    true,
  );
  expect(
    next.snapshot.problems.some((p: any) => p.entryId === incomplete),
  ).toBe(true);
});
it('a fonte comercial usa vínculo explícito e não o nome do utilizador', async () => {
  const clients = await tenant.inCompany(company, (tx) => tx.client.findMany());
  expect(clients.filter((c) => c.userId !== null)).toHaveLength(2);
});

it('duas criações concorrentes do mesmo preço resultam num único preço', async () => {
  const t = (
    await call('post', '/catalog/trades', {
      name: 'Concorrência ' + randomUUID(),
    })
  ).body.id;
  const body = {
    clientId: client,
    tradeId: t,
    cents: 100,
    startsOn: '2025-01-01',
  };
  const results = await Promise.all([
    call('post', '/billing/rates', body),
    call('post', '/billing/rates', body),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
});
