import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("emite, explica ajustes e transfere cobrança sem misturar os documentos dos clientes", async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const users = (await (await request.get("/api/demo-users")).json()) as {
    id: number;
    role: string;
    name: string;
    company_id: number;
  }[];
  const company = users[0].company_id;
  const admin = users.find(
    (u) => u.company_id === company && u.role === "admin",
  )!;
  const worker = users.find(
    (u) => u.company_id === company && u.role === "worker",
  )!;
  const headers = { "X-User-Id": String(admin.id) };
  const catalog = await (await request.get("/api/catalog", { headers })).json();
  const post = async (path: string, data: object) => {
    const result = await request.post(`/api${path}`, { headers, data });
    expect(result.ok(), await result.text()).toBe(true);
    return result.json();
  };
  // Each run uses its own commercial clients in the disposable browser-test DB.
  const clientUsers = users.filter(
    (u) => u.company_id === company && u.role === "client",
  );
  for (const person of clientUsers) {
    const previous = catalog.clients.find(
      (client: { userId: number | null }) => client.userId === person.id,
    );
    if (previous) {
      const unbound = await request.patch(
        `/api/catalog/clients/${previous.id}`,
        { headers, data: { ...previous, userId: null } },
      );
      expect(unbound.ok()).toBe(true);
    }
  }
  const suffix = randomUUID();
  const clientA = await post("/catalog/clients", {
    name: `Finance A ${suffix}`,
    userId: clientUsers[0].id,
  });
  const clientB = await post("/catalog/clients", {
    name: `Finance B ${suffix}`,
    userId: clientUsers[1].id,
  });
  const siteA = await post("/catalog/sites", {
    name: `Obra A ${suffix}`,
    clientId: clientA.id,
  });
  const siteB = await post("/catalog/sites", {
    name: `Obra B ${suffix}`,
    clientId: clientB.id,
  });
  const trade = await post("/catalog/trades", {
    name: `Ofício faturação ${randomUUID()}`,
  });
  for (const [clientId, cents] of [
    [clientA.id, 100],
    [clientB.id, 200],
  ]) {
    await post("/billing/rates", {
      clientId,
      tradeId: trade.id,
      cents,
      startsOn: "2023-01-01",
    });
  }
  const entryId = randomUUID();
  const sync = await request.post("/api/attendance/sync", {
    headers: { "X-User-Id": String(worker.id) },
    data: {
      events: [
        {
          id: randomUUID(),
          shiftId: entryId,
          siteId: siteA.id,
          kind: "in",
          occurredAt: "2023-01-10T08:00:00Z",
        },
      ],
    },
  });
  expect((await sync.json()).results[0].accepted).toBe(true);
  const correction = (
    expectedVersion: number,
    minutes: number,
    siteId = siteA.id,
  ) =>
    post(`/attendance/${entryId}/corrections`, {
      expectedVersion,
      siteId,
      tradeId: trade.id,
      startAt: "2023-01-10T08:00:00Z",
      endAt: new Date(
        Date.parse("2023-01-10T08:00:00Z") + minutes * 60000,
      ).toISOString(),
      reason: `Revisão ${expectedVersion + 1}`,
    });
  await correction(1, 60);
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(admin.name) }).click();
  const panel = page.getByRole("region", { name: "Faturação", exact: true });
  async function emit(clientId: number, period: string, total: number) {
    await panel.getByLabel("Cliente da fatura").selectOption(String(clientId));
    await panel.getByLabel("Mês da fatura").fill(period);
    await panel
      .getByRole("button", { name: "Gerar rascunho", exact: true })
      .click();
    await expect(
      panel.getByRole("heading", { name: "Rever rascunho" }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (result) =>
        result.url().endsWith("/issue") && result.request().method() === "POST",
    );
    await panel.getByRole("button", { name: "Emitir fatura revista" }).click();
    const issued = await response;
    expect(issued.status()).toBe(201);
    const invoice = await issued.json();
    expect(invoice.totalCents).toBe(total);
    await expect(
      panel.getByRole("heading", { name: invoice.number, exact: true }),
    ).toBeVisible();
    return invoice;
  }
  const original = await emit(clientA.id, "2023-01", 100);
  await panel.getByText("Explicar linha 1", { exact: true }).click();
  await expect(panel.getByText(/Versão 2 ·/)).toBeVisible();
  await correction(2, 90);
  const adjustment = await emit(clientA.id, "2023-02", 50);
  await panel.getByText("Explicar linha 1", { exact: true }).click();
  await expect(panel.getByText("150 − 100 = 50 cêntimos")).toBeVisible();
  await expect(panel.getByText(/Versão 3 ·/)).toBeVisible();
  await correction(3, 90, siteB.id);
  const debit = await emit(clientB.id, "2023-03", 300);
  const credit = await emit(clientA.id, "2023-03", -150);
  expect(
    credit.lines
      .flatMap(
        (line: { references: { invoiceId: string }[] }) => line.references,
      )
      .some((ref: { invoiceId: string }) => ref.invoiceId === debit.id),
  ).toBe(false);

  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(clientA.userId));
  await expect(
    page.getByRole("heading", { name: "As minhas faturas", level: 1 }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: new RegExp(original.number) }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: new RegExp(adjustment.number) }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: new RegExp(debit.number) }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Emitir fatura revista" }),
  ).toHaveCount(0);
  await panel
    .getByRole("button", { name: new RegExp(original.number) })
    .click();
  await expect(
    panel.getByRole("heading", { name: original.number, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    panel.getByRole("button", { name: new RegExp(credit.number) }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(clientB.userId));
  await expect(
    panel.getByRole("button", { name: new RegExp(debit.number) }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: new RegExp(credit.number) }),
  ).toHaveCount(0);
});

test("consulta de faturas funciona num ecrã móvel sem transbordar", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const users = (await (await request.get("/api/demo-users")).json()) as {
    id: number;
    role: string;
    name: string;
  }[];
  const user = users.find((person) => person.role === "client")!;
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(user.name) }).click();
  await expect(
    page.getByRole("heading", { name: "Documentos emitidos" }),
  ).toBeVisible();
  await expect(page.getByText("A carregar faturas…")).toHaveCount(0);
  const invoice = page
    .getByRole("region", { name: "Faturação", exact: true })
    .getByRole("button")
    .first();
  if (await invoice.count()) await invoice.click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("administrativo consulta a faturação com nomes longos em 390 px", async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const users = (await (await request.get("/api/demo-users")).json()) as {
    id: number;
    role: string;
    name: string;
  }[];
  const admin = users.find((user) => user.role === "admin")!;
  const response = await request.post("/api/catalog/clients", {
    headers: { "X-User-Id": String(admin.id) },
    data: {
      name: `Cliente de demonstração com nome comercial longo para verificar a largura no telemóvel ${randomUUID()}`,
    },
  });
  expect(response.ok()).toBe(true);
  const client = await response.json();
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(admin.name) }).click();
  await page
    .getByRole("combobox", { name: "Cliente da fatura" })
    .selectOption(String(client.id));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
