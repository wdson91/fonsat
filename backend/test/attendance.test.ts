import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app';
import { TenantService } from '../src/database/tenant.service';
let app: INestApplication,
  tenant: TenantService,
  user: number,
  admin: number,
  company: number,
  site: number,
  otherSite: number,
  shift = randomUUID();
const call = (
  method: 'get' | 'post',
  path: string,
  body?: object,
  id = user,
) =>
  request(app.getHttpServer())
    [method]('/api' + path)
    .set('X-User-Id', String(id))
    .send(body);
const event = (kind: string, time: string, extra = {}) => ({
  id: randomUUID(),
  shiftId: shift,
  siteId: site,
  kind,
  occurredAt: time,
  ...extra,
});
const sync = async (events: unknown[]) =>
  (await call('post', '/attendance/sync', { events })).body.results;
beforeAll(async () => {
  app = await createApp();
  await app.init();
  tenant = app.get(TenantService);
  const users = (await request(app.getHttpServer()).get('/api/demo-users'))
    .body;
  company = users[0].company_id;
  user = users.find(
    (u: any) => u.company_id === company && u.role === 'worker',
  ).id;
  admin = users.find(
    (u: any) => u.company_id === company && u.role === 'admin',
  ).id;
  site = (await call('get', '/attendance/bootstrap')).body.sites[0].id;
  otherSite = (
    await tenant.inCompany(company === 1 ? 2 : 1, (tx) =>
      tx.site.findFirstOrThrow(),
    )
  ).id;
});
afterAll(async () => {
  await app?.close();
});
it('preserva saída antes da entrada e reconstitui turno a atravessar meia-noite', async () => {
  expect((await sync([event('out', '2026-10-15T02:30:19Z')]))[0].accepted).toBe(
    true,
  );
  const start = event('in', '2026-10-14T23:00:59Z');
  expect((await sync([start]))[0].accepted).toBe(true);
  const entries = (await call('get', '/attendance/entries')).body;
  const entry = entries.find((e: any) => e.id === shift);
  expect(entry.current.minutes).toBe(210);
  expect(entry.current.workedOn).toBe('2026-10-15T00:00:00.000Z');
  expect(entry.versions).toHaveLength(2);
  expect((await sync([start]))[0]).toMatchObject({
    accepted: true,
    duplicate: true,
  });
  expect(
    (await sync([{ ...start, occurredAt: '2026-10-14T22:00:00Z' }]))[0],
  ).toMatchObject({ accepted: false, status: 409 });
});
it('pausa origina períodos separados sem faturar o intervalo', async () => {
  const shifts: string[] = [];
  for (const [a, b] of [
    ['08:00', '12:00'],
    ['13:00', '17:00'],
  ]) {
    const shiftId = randomUUID();
    shifts.push(shiftId);
    const results = await sync([
      event('in', `2026-10-16T${a}:00Z`, { shiftId }),
      event('out', `2026-10-16T${b}:00Z`, { shiftId }),
    ]);
    expect(results.every((r: any) => r.accepted)).toBe(true);
  }
  const entries = (await call('get', '/attendance/entries')).body.filter(
    (e: any) => shifts.includes(e.id),
  );
  expect(entries.reduce((s: number, e: any) => s + e.current.minutes, 0)).toBe(
    480,
  );
});
it('aceita anomalia fora da distribuição, mas não referências de outra empresa nem payload inválido', async () => {
  const results = await sync([
    event('in', '2026-10-16T08:00:00Z', { siteId: otherSite }),
    event('in', 'inválido'),
    event('in', '2026-10-16T08:00:00Z', { shiftId: randomUUID() }),
  ]);
  expect(results.map((r: any) => r.accepted)).toEqual([false, false, true]);
  const entries = (await call('get', '/attendance/entries')).body;
  expect(
    entries.some((e: any) => e.alerts.includes('Fora da distribuição.')),
  ).toBe(true);
});
it('outra identidade não envia marcações em nome do trabalhador', async () => {
  expect(
    (await call('post', '/attendance/sync', { events: [] }, admin)).status,
  ).toBe(403);
});
it('o banco recusa alteração dos factos e das versões', async () => {
  await expect(
    tenant.inCompany(company, (tx) =>
      tx.clockEvent.updateMany({
        where: { entryId: shift },
        data: { kind: 'out' },
      }),
    ),
  ).rejects.toThrow();
  await expect(
    tenant.inCompany(company, (tx) =>
      tx.entryVersion.updateMany({
        where: { entryId: shift },
        data: { reason: 'apagar original' },
      }),
    ),
  ).rejects.toThrow();
});
