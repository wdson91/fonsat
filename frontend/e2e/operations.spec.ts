import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';
async function fixture(request: APIRequestContext) {
  const users = await (await request.get('/api/demo-users')).json();
  const admin = users.find((u: any) => u.name === 'Sofia Ramos');
  const worker = users.find((u: any) => u.name === 'João Silva');
  const secondWorker = users.find((u: any) => u.name === 'André Costa');
  const headers = { 'X-User-Id': String(admin.id) };
  const catalog = await (await request.get('/api/catalog', { headers })).json();
  return {
    admin,
    worker,
    secondWorker,
    headers,
    catalog,
    site: catalog.sites.find((s: any) => s.name === 'Edifício Aurora'),
  };
}
async function choose(page: any, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(name) }).click();
}
test('admin gere cadastro e distribui um trabalhador pela grelha', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await choose(page, 'Sofia Ramos');
  await page.getByRole('button', { name: 'Cadastros', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Cadastro', exact: true })
    .selectOption('trades');
  const name = 'Ofício browser ' + randomUUID().slice(0, 8);
  await page.getByLabel('Nome', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByText('Cadastro guardado.')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Editar ' + name }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Distribuição', exact: true }).click();
  await page
    .getByRole('button', { name: 'Semana seguinte', exact: true })
    .click();
  const row = page.getByRole('row').filter({
    has: page.getByRole('rowheader', { name: 'João Silva', exact: true }),
  });
  await row.getByRole('button').first().click();
  await page
    .getByRole('combobox', { name: 'Obra', exact: true })
    .selectOption(String(f.site.id));
  await page
    .getByRole('button', { name: 'Guardar distribuição', exact: true })
    .click();
  await expect(page.getByText('Distribuição guardada.')).toBeVisible();
  await expect(
    row.getByRole('button', { name: /Edifício Aurora/ }),
  ).toBeVisible();
});
test('fila IndexedDB sobrevive a reload e troca de pessoa, sem duplicar o turno', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const old = await (
    await request.get('/api/attendance/entries', {
      headers: { 'X-User-Id': String(f.worker.id) },
    })
  ).json();
  for (const e of old.filter((e: any) => e.current.minutes === null)) {
    const start =
      e.current.startAt ??
      new Date(Date.parse(e.current.endAt) - 60000).toISOString();
    await request.post(`/api/attendance/${e.id}/corrections`, {
      headers: f.headers,
      data: {
        expectedVersion: e.currentVersion,
        siteId: e.current.siteId,
        tradeId: e.current.tradeId,
        startAt: start,
        endAt: new Date(Date.parse(start) + 60000).toISOString(),
        reason: 'Fechar pendência antes do ensaio do navegador',
      },
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/attendance/sync', (route) => route.abort());
  await choose(page, 'João Silva');
  await expect(
    page.getByRole('combobox', { name: 'Obra', exact: true }),
  ).toContainText('Edifício Aurora');
  await page
    .getByRole('combobox', { name: 'Obra', exact: true })
    .selectOption(String(f.site.id));
  await page
    .getByRole('button', { name: 'Registar entrada', exact: true })
    .click();
  await expect(
    page.getByText('1 marcações pendentes de sincronização', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Registar saída', exact: true })
    .click();
  await expect(
    page.getByText('2 marcações pendentes de sincronização', { exact: true }),
  ).toBeVisible();
  const queued = await page.evaluate(
    () =>
      new Promise<any[]>((resolve, reject) => {
        const r = indexedDB.open('fonsat-clock-v1');
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction('events').objectStore('events').getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
        r.onerror = () => reject(r.error);
      }),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath('ponto-offline-mobile.png'),
    fullPage: true,
  });
  expect(queued).toHaveLength(2);
  expect(new Set(queued.map((e) => e.shiftId)).size).toBe(1);
  await page.context().setOffline(false);
  await page.reload();
  await expect(
    page.getByText('2 marcações pendentes de sincronização', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Trocar de utilizador' })
    .selectOption(String(f.secondWorker.id));
  await expect(
    page.getByText('Sem marcações pendentes', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Trocar de utilizador' })
    .selectOption(String(f.worker.id));
  await expect(
    page.getByText('2 marcações pendentes de sincronização', { exact: true }),
  ).toBeVisible();
  await page.unroute('**/api/attendance/sync');
  await page
    .getByRole('button', { name: 'Sincronizar agora', exact: true })
    .click();
  await expect(
    page.getByText('Sem marcações pendentes', { exact: true }),
  ).toBeVisible();
  const entries = await (
    await request.get('/api/attendance/entries', {
      headers: { 'X-User-Id': String(f.worker.id) },
    })
  ).json();
  const entry = entries.find((e: any) => e.id === queued[0].shiftId);
  expect(entry.events).toHaveLength(2);
  expect(entry.current.minutes).toBe(0);
});
test('admin resolve saída esquecida pela interface e vê o histórico', async ({
  page,
  request,
}) => {
  const f = await fixture(request),
    id = randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const response = await request.post('/api/attendance/sync', {
    headers: { 'X-User-Id': String(f.worker.id) },
    data: {
      events: [
        {
          id: randomUUID(),
          shiftId: id,
          siteId: f.site.id,
          kind: 'in',
          occurredAt: today + 'T08:00:00Z',
        },
      ],
    },
  });
  expect((await response.json()).results[0].accepted).toBe(true);
  await choose(page, 'Sofia Ramos');
  await page
    .getByRole('button', { name: 'Equipa e pendências', exact: true })
    .click();
  const record = page.locator(`[data-entry-id="${id}"]`);
  await record
    .getByRole('button', { name: 'Corrigir João Silva', exact: true })
    .click();
  const concurrent = await request.post(`/api/attendance/${id}/corrections`, {
    headers: f.headers,
    data: {
      expectedVersion: 1,
      siteId: f.site.id,
      tradeId: f.catalog.workers.find((w: any) => w.userId === f.worker.id)
        .tradeId,
      startAt: today + 'T08:00:00Z',
      endAt: today + 'T16:00:00Z',
      reason: 'Correção concorrente de outro ecrã',
    },
  });
  expect(concurrent.status()).toBe(201);
  await page.getByLabel(/^Saída/).fill(today + 'T17:00');
  await page
    .getByLabel('Motivo', { exact: true })
    .fill('Saída esquecida confirmada com a equipa');
  await page
    .getByRole('button', { name: 'Guardar correção', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Guardar correção', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      'O registo mudou. Atualize a equipa e abra novamente a correção.',
    ),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Atualizar equipa', exact: true })
    .click();
  await page.getByRole('checkbox', { name: 'Só pendências' }).uncheck();
  await record
    .getByRole('button', { name: 'Corrigir João Silva', exact: true })
    .click();
  await page.getByLabel(/^Saída/).fill(today + 'T17:00');
  await page
    .getByLabel('Motivo', { exact: true })
    .fill('Saída esquecida confirmada com a equipa');
  await page
    .getByRole('button', { name: 'Guardar correção', exact: true })
    .click();
  await expect(
    page.getByText('Correção guardada; o original foi preservado.'),
  ).toBeVisible();
  await record
    .getByText('Histórico e marcações originais', { exact: true })
    .click();
  await expect(
    record.getByText(/Saída esquecida confirmada com a equipa/),
  ).toBeVisible();
  await expect(
    record.getByText('Versão 1 · Marcações', { exact: true }),
  ).toBeVisible();
});
test('admin cria preço e revê rascunho mensal com valores explicáveis', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const trade = await (
    await request.post('/api/catalog/trades', {
      headers: f.headers,
      data: { name: 'Preço browser ' + randomUUID().slice(0, 8) },
    })
  ).json();
  const id = randomUUID();
  expect(
    (
      await (
        await request.post('/api/attendance/sync', {
          headers: { 'X-User-Id': String(f.worker.id) },
          data: {
            events: [
              {
                id: randomUUID(),
                shiftId: id,
                siteId: f.site.id,
                kind: 'in',
                occurredAt: '2025-01-10T08:00:00Z',
              },
            ],
          },
        })
      ).json()
    ).results[0].accepted,
  ).toBe(true);
  expect(
    (
      await request.post(`/api/attendance/${id}/corrections`, {
        headers: f.headers,
        data: {
          expectedVersion: 1,
          siteId: f.site.id,
          tradeId: trade.id,
          startAt: '2025-01-10T08:00:00Z',
          endAt: '2025-01-10T09:00:00Z',
          reason: 'Confirmar hora para faturação',
        },
      })
    ).ok(),
  ).toBe(true);
  await choose(page, 'Sofia Ramos');
  await page
    .getByRole('button', { name: 'Preços e rascunhos', exact: true })
    .click();
  await page
    .getByText('Gerir preços por cliente e ofício', { exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Cliente do preço', exact: true })
    .selectOption(String(f.site.clientId));
  await page
    .getByRole('combobox', { name: 'Ofício do preço', exact: true })
    .selectOption(String(trade.id));
  await page.getByLabel('Preço por hora (€)', { exact: true }).fill('12,50');
  await page.getByLabel('Válido desde', { exact: true }).fill('2025-01-01');
  await page.getByRole('button', { name: 'Criar preço', exact: true }).click();
  await expect(page.getByText(/Preço guardado/)).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Cliente do rascunho', exact: true })
    .selectOption(String(f.site.clientId));
  await page.getByLabel('Mês do rascunho', { exact: true }).fill('2025-01');
  await page
    .getByRole('button', { name: 'Gerar rascunho mensal', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: /Rascunho ·/ })).toBeVisible();
  const line = page.getByRole('row').filter({ hasText: trade.name });
  await expect(line).toContainText('12,50');
  await line.getByText('Ver registos', { exact: true }).click();
  await expect(line).toContainText('João Silva');
  await expect(line).toContainText('60 min');
});
