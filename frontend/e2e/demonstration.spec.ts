import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { addDays, monday } from "../src/lib/operations";

test("percorre distribuição, grelha offline, correção, preço, emissão, explicação e ajuste", async ({
  page,
  context,
  request,
}, info) => {
  test.setTimeout(120000);
  const users = await (await request.get("/api/demo-users")).json();
  const admin = users.find((user: any) => user.name === "Sofia Ramos"),
    worker = users.find((user: any) => user.name === "João Silva"),
    customer = users.find((user: any) => user.name === "Mota Obras");
  const headers = { "X-User-Id": String(admin.id) };
  const send = async (path: string, data: object) => {
    const response = await request.post(`/api${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const catalog = await (await request.get("/api/catalog", { headers })).json();
  const oldClient = catalog.clients.find(
    (client: any) => client.userId === customer.id,
  );
  if (oldClient)
    expect(
      (
        await request.patch(`/api/catalog/clients/${oldClient.id}`, {
          headers,
          data: { ...oldClient, userId: null },
        })
      ).ok(),
    ).toBe(true);
  const client = await send("/catalog/clients", {
    name: `Cliente demonstração ${randomUUID().slice(0, 8)}`,
    userId: customer.id,
  });
  const site = await send("/catalog/sites", {
    name: `Obra demonstração ${randomUUID().slice(0, 8)}`,
    clientId: client.id,
  });
  const workerRecord = catalog.workers.find(
    (row: any) => row.userId === worker.id,
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const currentMonth = today.slice(0, 7);
  const existing = await (
    await request.get("/api/attendance/entries", {
      headers: { "X-User-Id": String(worker.id) },
    })
  ).json();
  const usedDays = new Set(
    existing.map((entry: any) => entry.current.workedOn.slice(0, 10)),
  );
  let workedOn = addDays(`${currentMonth}-01`, -1);
  while (usedDays.has(workedOn)) workedOn = addDays(workedOn, -1);
  const period = workedOn.slice(0, 7);
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(admin.name) }).click();
  await page.getByRole("link", { name: "Distribuição", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Distribuição", level: 1 }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("02-distribuicao.png"),
    fullPage: true,
  });
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(worker.id));
  await expect(
    page.getByText("Ponto disponível offline neste dispositivo.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  const gap = Math.round(
    (Date.parse(monday(today)) - Date.parse(monday(workedOn))) / 604800000,
  );
  for (let i = 0; i < gap; i++)
    await page
      .getByRole("button", { name: "Semana de horas anterior" })
      .click();
  await context.setOffline(true);
  for (const [category, start, end] of [
    ["Trabalho", "09:00", "13:30"],
    ["Pausa", "13:30", "13:45"],
    ["Trabalho", "13:45", "14:00"],
    ["Pausa", "14:00", "15:00"],
    ["Trabalho", "15:00", "18:00"],
  ]) {
    await page
      .getByRole("button", { name: `Adicionar período em ${workedOn}` })
      .click();
    const dialog = page.getByRole("dialog", { name: "Adicionar período" });
    await dialog.getByRole("button", { name: category, exact: true }).click();
    await dialog.getByLabel("Hora de início").fill(start);
    await dialog.getByLabel("Hora de fim").fill(end);
    await dialog
      .getByRole("combobox", { name: "Local de trabalho" })
      .selectOption(String(site.id));
    await dialog.getByRole("button", { name: "Aplicar" }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(
    page.getByText("10 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
  const day = page.getByRole("region", {
    name: `Horas de ${workedOn}`,
    exact: true,
  });
  await expect(day).toContainText("7h 45m de trabalho");
  await expect(day).toContainText("1h 15m de pausa");
  await page.screenshot({
    path: info.outputPath("01-ponto-grelha.png"),
    fullPage: true,
  });
  await context.setOffline(false);
  await expect(
    page.getByText("Sem marcações pendentes", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  const entries = await (
    await request.get("/api/attendance/entries", {
      headers: { "X-User-Id": String(worker.id) },
    })
  ).json();
  const last = entries.find(
    (entry: any) =>
      entry.current.siteId === site.id &&
      entry.activity === "work" &&
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Lisbon",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(entry.current.startAt)) === "15:00",
  );
  expect(last).toBeTruthy();
  const correct = (version: number, extraMinutes: number) =>
    send(`/attendance/${last.id}/corrections`, {
      expectedVersion: version,
      siteId: site.id,
      tradeId: workerRecord.tradeId,
      startAt: last.current.startAt,
      endAt: new Date(
        Date.parse(last.current.endAt) + extraMinutes * 60000,
      ).toISOString(),
      reason: `Confirmar saída: mais ${extraMinutes} minutos`,
    });
  await correct(last.currentVersion, 15);
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(admin.id));
  await page
    .getByRole("link", { name: "Equipa e pendências", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Estado da equipa e pendências" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sem entrada hoje" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("03-equipa.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Preços e rascunhos", exact: true })
    .click();
  await page
    .getByText("Gerir preços por cliente e ofício", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Cliente do preço" })
    .selectOption(String(client.id));
  await page
    .getByRole("combobox", { name: "Ofício do preço" })
    .selectOption(String(workerRecord.tradeId));
  await page.getByLabel("Preço por hora (€)").fill("22,50");
  await page.getByLabel("Válido desde", { exact: true }).fill(`${period}-01`);
  await page.getByRole("button", { name: "Criar preço", exact: true }).click();
  await expect(
    page.getByText(
      "Preço guardado. Gere novamente o rascunho para o atualizar.",
    ),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Cliente do rascunho" })
    .selectOption(String(client.id));
  await page.getByLabel("Mês do rascunho").fill(period);
  await page.getByRole("button", { name: "Gerar rascunho mensal" }).click();
  await expect(
    page.getByText("Sem bloqueios. Revise as linhas e os registos."),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("04-rascunho.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Faturação", exact: true }).click();
  const financial = page.getByRole("region", {
    name: "Faturação",
    exact: true,
  });
  async function issue(month: string, expected: number) {
    await financial
      .getByRole("combobox", { name: "Cliente da fatura" })
      .selectOption(String(client.id));
    await financial.getByLabel("Mês da fatura").fill(month);
    await financial
      .getByRole("button", { name: "Gerar rascunho", exact: true })
      .click();
    await expect(
      financial.getByRole("heading", { name: "Rever rascunho" }),
    ).toBeVisible();
    const response = page.waitForResponse(
      (row) =>
        row.url().endsWith("/issue") && row.request().method() === "POST",
    );
    await financial
      .getByRole("button", { name: "Emitir fatura revista" })
      .click();
    const document = await (await response).json();
    expect(document.totalCents).toBe(expected);
    return document;
  }
  const original = await issue(period, 18000);
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(customer.id));
  await financial
    .getByRole("button", { name: new RegExp(original.number) })
    .click();
  await financial.getByText("Explicar linha 1", { exact: true }).click();
  await expect(
    financial.getByText(/Confirmar saída: mais 15 minutos/).first(),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("05-fatura-explicacao.png"),
    fullPage: true,
  });
  await correct(last.currentVersion + 1, 30);
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(admin.id));
  const adjustment = await issue(currentMonth, 563);
  expect(
    adjustment.lines[0].references.some(
      (reference: any) => reference.invoiceId === original.id,
    ),
  ).toBe(true);
  const stillOriginal = await (
    await request.get(`/api/invoices/${original.id}`, { headers })
  ).json();
  expect(stillOriginal.totalCents).toBe(18000);
});

test("uma falha de leitura apresenta recuperação sem deixar carregamento permanente", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Sofia Ramos/ }).click();
  await page.route("**/api/billing/rates", (route) =>
    route.fulfill({
      status: 503,
      json: { message: "Leitura temporariamente indisponível" },
    }),
  );
  await page
    .getByRole("link", { name: "Preços e rascunhos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Tentar carregar preços" }),
  ).toBeVisible();
  await expect(
    page.getByText("A carregar preços…", { exact: true }),
  ).toHaveCount(0);
  await page.unroute("**/api/billing/rates");
  await page.getByRole("button", { name: "Tentar carregar preços" }).click();
  await expect(
    page.getByText("Gerir preços por cliente e ofício", { exact: true }),
  ).toBeVisible();
});
