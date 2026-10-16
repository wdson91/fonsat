import {
  chromium,
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";

async function fixture(request: APIRequestContext) {
  const users = await (await request.get("/api/demo-users")).json();
  const a = users.find((user: { name: string }) => user.name === "João Silva");
  const b = users.find((user: { name: string }) => user.name === "André Costa");
  for (const worker of [a, b]) {
    const admin = users.find(
      (user: { company_id: number; role: string }) =>
        user.company_id === worker.company_id && user.role === "admin",
    );
    const rows = await (
      await request.get("/api/attendance/entries", {
        headers: { "X-User-Id": String(worker.id) },
      })
    ).json();
    for (const entry of rows.filter(
      (row: { current: { minutes: number | null } }) =>
        row.current.minutes === null,
    )) {
      const startAt =
        entry.current.startAt ??
        new Date(Date.parse(entry.current.endAt) - 60000).toISOString();
      expect(
        (
          await request.post(`/api/attendance/${entry.id}/corrections`, {
            headers: { "X-User-Id": String(admin.id) },
            data: {
              expectedVersion: entry.currentVersion,
              siteId: entry.current.siteId,
              tradeId: entry.current.tradeId,
              startAt,
              endAt: new Date(Date.parse(startAt) + 60000).toISOString(),
              reason: "Preparar ensaio offline isolado",
            },
          })
        ).ok(),
      ).toBe(true);
    }
  }
  return { a, b };
}
async function prepare(page: Page, person: { name: string }) {
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(person.name) }).click();
  await expect(
    page.getByText("Ponto disponível offline neste dispositivo.", {
      exact: true,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
}
async function queue(page: Page) {
  return page.evaluate(
    () =>
      new Promise<
        { id: string; userId: number; companyId?: number; shiftId: string }[]
      >((resolve, reject) => {
        const request = indexedDB.open("fonsat-clock-v1");
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction("events"),
            read = tx.objectStore("events").getAll();
          read.onsuccess = () => resolve(read.result);
          tx.oncomplete = () => db.close();
        };
        request.onerror = () => reject(request.error);
      }),
  );
}
async function pair(page: Page) {
  await page
    .getByRole("combobox", { name: "Obra", exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Registar entrada", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Registar saída", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Registar saída", exact: true })
    .click();
  await expect(
    page.getByText("2 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
}

test("fecha o navegador com fila e reabre offline com o último trabalhador, sincronizando ao recuperar rede", async ({
  request,
  baseURL,
}, info) => {
  test.setTimeout(60000);
  const { a } = await fixture(request),
    profile = info.outputPath("persistent-profile");
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      baseURL,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    });
  let context: BrowserContext = await launch();
  try {
    const page = context.pages()[0];
    await prepare(page, a);
    const cachedUrls = await page.evaluate(async () =>
      (
        await Promise.all(
          (await caches.keys()).map(async (key) =>
            (await (await caches.open(key)).keys()).map(
              (request) => new URL(request.url).pathname,
            ),
          ),
        )
      ).flat(),
    );
    expect(cachedUrls).toContain("/");
    expect(cachedUrls.some((url) => url.startsWith("/api/"))).toBe(false);
    await context.setOffline(true);
    await pair(page);
    const saved = await queue(page);
    expect(
      saved.every(
        (event) => event.userId === a.id && event.companyId === a.company_id,
      ),
    ).toBe(true);
    await context.close();
    context = await launch();
    await context.setOffline(true);
    const reopened = context.pages()[0];
    await reopened.goto("/");
    await expect(
      reopened.getByRole("heading", { name: "O meu dia", exact: true }),
    ).toBeVisible();
    await expect(
      reopened.getByText("2 marcações pendentes de sincronização", {
        exact: true,
      }),
    ).toBeVisible();
    expect(await queue(reopened)).toEqual(saved);
    await context.setOffline(false);
    await expect(
      reopened.getByText("Sem marcações pendentes", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    const entries = await (
      await request.get("/api/attendance/entries", {
        headers: { "X-User-Id": String(a.id) },
      })
    ).json();
    expect(
      entries.find((entry: { id: string }) => entry.id === saved[0].shiftId)
        .events,
    ).toHaveLength(2);
  } finally {
    await context.close();
  }
});

test("troca durante um pedido iniciado mantém a autoria e confirma apenas a fila original", async ({
  page,
  request,
}) => {
  const { a, b } = await fixture(request);
  await prepare(page, a);
  let release!: () => void, started!: () => void;
  const hold = new Promise<void>((resolve) => {
      release = resolve;
    }),
    ready = new Promise<void>((resolve) => {
      started = resolve;
    });
  let captured: { user: string | undefined; shift: string } | undefined;
  await page.route("**/api/attendance/sync", async (route) => {
    captured = {
      user: route.request().headers()["x-user-id"],
      shift: route.request().postDataJSON().events[0].shiftId,
    };
    started();
    await hold;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page
    .getByRole("combobox", { name: "Obra", exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Registar entrada", exact: true })
    .click();
  await ready;
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(b.id));
  await expect(page.getByText("Olá, André.")).toBeVisible();
  release();
  await expect
    .poll(
      async () =>
        (await queue(page)).filter((event) => event.userId === a.id).length,
    )
    .toBe(0);
  expect(captured?.user).toBe(String(a.id));
  await expect(
    page.getByRole("button", { name: "Registar entrada", exact: true }),
  ).toBeEnabled();
  const wrong = await (
    await request.get("/api/attendance/entries", {
      headers: { "X-User-Id": String(b.id) },
    })
  ).json();
  expect(
    wrong.some((entry: { id: string }) => entry.id === captured!.shift),
  ).toBe(false);
});

test("resposta perdida conserva eventos e o reenvio não duplica factos", async ({
  page,
  request,
}) => {
  const { a } = await fixture(request);
  await prepare(page, a);
  let responseLost!: () => void;
  const lost = new Promise<void>((resolve) => {
    responseLost = resolve;
  });
  await page.route("**/api/attendance/sync", async (route) => {
    await route.fetch();
    await route.abort();
    responseLost();
  });
  await page
    .getByRole("combobox", { name: "Obra", exact: true })
    .selectOption({ index: 1 });
  await page
    .getByRole("button", { name: "Registar entrada", exact: true })
    .click();
  await expect(
    page.getByText("1 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
  await lost;
  const saved = await queue(page);
  await page.unroute("**/api/attendance/sync");
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(
    page.getByText("Sem marcações pendentes", { exact: true }),
  ).toBeVisible();
  const entries = await (
    await request.get("/api/attendance/entries", {
      headers: { "X-User-Id": String(a.id) },
    })
  ).json();
  expect(
    entries
      .find((entry: { id: string }) => entry.id === saved[0].shiftId)
      .events.filter((event: { id: string }) => event.id === saved[0].id),
  ).toHaveLength(1);
});

test("sem seleção ou com seleção recusada preserva a fila e não a oferece a outra pessoa", async ({
  page,
  context,
  request,
}) => {
  const { a, b } = await fixture(request);
  await prepare(page, a);
  await context.setOffline(true);
  await pair(page);
  const saved = await queue(page);
  await page.evaluate(() => localStorage.removeItem("fonsat.userId"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(b.name) }).click();
  await expect(
    page.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeVisible();
  expect(await queue(page)).toEqual(saved);
  await page.getByRole("button", { name: new RegExp(a.name) }).click();
  await expect(
    page.getByText("2 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 401, json: { message: "Identificador recusado" } }),
  );
  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeVisible();
  expect(await queue(page)).toEqual(saved);
  await context.setOffline(true);
  await page.unroute("**/api/me");
  await page.getByRole("button", { name: new RegExp(a.name) }).click();
  await expect(
    page.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeVisible();
});

test("atualizar a aplicação preserva e adota a fila antiga apenas após verificar a empresa", async ({
  page,
  request,
}) => {
  const { a } = await fixture(request);
  const data = await (
    await request.get("/api/attendance/bootstrap", {
      headers: { "X-User-Id": String(a.id) },
    })
  ).json();
  const id = randomUUID(),
    shiftId = randomUUID(),
    time = new Date().toISOString(),
    siteId = data.sites[0].id;
  await page.goto("/icon.svg");
  await page.evaluate(
    async (event) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("fonsat-clock-v1", 1);
        request.onupgradeneeded = () => {
          const db = request.result,
            events = db.createObjectStore("events", { keyPath: "id" });
          events.createIndex("userId", "userId");
          db.createObjectStore("sessions", { keyPath: "userId" });
        };
        request.onsuccess = () => {
          const db = request.result,
            tx = db.transaction(["events", "sessions"], "readwrite");
          tx.objectStore("events").put(event);
          tx.objectStore("sessions").put({
            userId: event.userId,
            active: {
              shiftId: event.shiftId,
              siteId: event.siteId,
              startAt: event.occurredAt,
            },
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
      localStorage.setItem("fonsat.userId", String(event.userId));
    },
    { id, shiftId, siteId, kind: "in", occurredAt: time, userId: a.id },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "O meu dia", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await queue(page)).length).toBe(0);
  const entries = await (
    await request.get("/api/attendance/entries", {
      headers: { "X-User-Id": String(a.id) },
    })
  ).json();
  expect(
    entries.find((entry: { id: string }) => entry.id === shiftId).events[0].id,
  ).toBe(id);
});
