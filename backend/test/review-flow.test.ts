import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { TenantService } from "../src/database/tenant.service";

let app: INestApplication, tenant: TenantService;
let company: number,
  admin: number,
  workerUser: number,
  worker: number,
  site: number,
  plannedSite: number,
  trade: number,
  foremanA: number,
  foremanB: number,
  client: number;
const shift = randomUUID();
const send = (
  method: "get" | "post",
  path: string,
  body?: object,
  actor = admin,
) =>
  request(app.getHttpServer())
    [method]("/api" + path)
    .set("X-User-Id", String(actor))
    .send(body);
beforeAll(async () => {
  app = await createApp();
  await app.init();
  tenant = app.get(TenantService);
  const users = (await request(app.getHttpServer()).get("/api/demo-users"))
    .body;
  const owner = users.find((u: any) => u.role === "admin");
  company = owner.company_id;
  admin = owner.id;
  await tenant.inCompany(company, async (tx) => {
    const tag = randomUUID();
    const foremen = users.filter(
      (u: any) => u.company_id === company && u.role === "foreman",
    );
    foremanA = foremen[0].id;
    foremanB = foremen[1].id;
    workerUser = users.find(
      (u: any) => u.company_id === company && u.role === "worker",
    ).id;
    const currentWorker = await tx.worker.findUniqueOrThrow({
      where: { userId: workerUser },
    });
    worker = currentWorker.id;
    trade = currentWorker.tradeId;
    client = (
      await tx.client.create({
        data: { companyId: company, name: `Client ${tag}` },
      })
    ).id;
    site = (
      await tx.site.create({
        data: { companyId: company, clientId: client, name: `Actual ${tag}` },
      })
    ).id;
    plannedSite = (
      await tx.site.create({
        data: { companyId: company, clientId: client, name: `Planned ${tag}` },
      })
    ).id;
    await tx.rate.create({
      data: {
        companyId: company,
        clientId: client,
        tradeId: trade,
        startsOn: new Date("2037-01-01"),
        cents: 2000,
      },
    });
    await tx.allocation.create({
      data: {
        companyId: company,
        workerId: worker,
        siteId: plannedSite,
        day: new Date("2037-01-01"),
        changedBy: admin,
      },
    });
  });
});
afterAll(async () => {
  await app?.close();
});

it("impede sobreposição do mesmo encarregado, permite coencarregado e substitui sem sobrepor o anterior", async () => {
  const original = await send("post", "/catalog/responsibilities", {
    siteId: site,
    userId: foremanA,
    startsOn: "2037-01-01",
  });
  expect(original.status).toBe(201);
  expect(
    (
      await send("post", "/catalog/responsibilities", {
        siteId: site,
        userId: foremanA,
        startsOn: "2037-02-01",
      })
    ).status,
  ).toBe(409);
  const replacement = await send("post", "/catalog/responsibilities", {
    siteId: site,
    userId: foremanB,
    startsOn: "2037-02-01",
    replaceId: original.body.id,
  });
  expect(replacement.status).toBe(201);
  const previous = await tenant.inCompany(company, (tx) =>
    tx.siteResponsibility.findUniqueOrThrow({
      where: { id: original.body.id },
    }),
  );
  expect(previous.endsOn?.toISOString().slice(0, 10)).toBe("2037-01-31");
  const additional = await send("post", "/catalog/responsibilities", {
    siteId: site,
    userId: foremanA,
    startsOn: "2037-02-01",
  });
  expect(additional.status).toBe(201);
  expect(
    (
      await send("post", "/catalog/responsibilities", {
        id: original.body.id,
        siteId: site,
        userId: foremanA,
        startsOn: "2037-01-01",
        endsOn: "2037-02-01",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await send("post", "/catalog/responsibilities", {
        id: additional.body.id,
        siteId: site,
        userId: foremanA,
        startsOn: "2037-02-02",
      })
    ).status,
  ).toBe(201);
});
it("uma substituição recusada não termina a responsabilidade anterior", async () => {
  const rows = (await send("get", "/catalog")).body.responsibilities.filter(
    (r: any) => r.siteId === site,
  );
  const active = rows.find((r: any) => r.userId === foremanB);
  expect(
    (
      await send("post", "/catalog/responsibilities", {
        siteId: site,
        userId: foremanA,
        startsOn: "2037-03-01",
        replaceId: active.id,
      })
    ).status,
  ).toBe(409);
  const unchanged = await tenant.inCompany(company, (tx) =>
    tx.siteResponsibility.findUniqueOrThrow({ where: { id: active.id } }),
  );
  expect(unchanged.endsOn).toBeNull();
});
it("bootstrap fornece a obra distribuída por data para pré-selecionar a picagem", async () => {
  const response = await send(
    "get",
    "/attendance/bootstrap",
    undefined,
    workerUser,
  );
  expect(response.status).toBe(200);
  expect(response.body.allocations).toContainEqual({
    day: "2037-01-01T00:00:00.000Z",
    siteId: plannedSite,
  });
});
it("a correção resolve a exceção da distribuição; novos eventos reabrem revisão e preço em falta continua pendente", async () => {
  const events = ["in", "out"].map((kind, i) => ({
    id: randomUUID(),
    shiftId: shift,
    siteId: site,
    kind,
    occurredAt: `2037-01-01T${i ? "17" : "08"}:00:00Z`,
  }));
  const synced = await send("post", "/attendance/sync", { events }, workerUser);
  expect(synced.body.results.every((r: any) => r.accepted)).toBe(true);
  const find = async () =>
    (await send("get", "/attendance/entries", undefined, workerUser)).body.find(
      (e: any) => e.id === shift,
    );
  const before = await find();
  expect(before.alerts).toContain("Obra diferente da distribuição deste dia.");
  const corrected = await send("post", `/attendance/${shift}/corrections`, {
    expectedVersion: before.currentVersion,
    siteId: site,
    tradeId: trade,
    startAt: "2037-01-01T08:00:00Z",
    endAt: "2037-01-01T15:00:00Z",
    reason: "Obra e ofício confirmados; saída corrigida.",
  });
  expect(corrected.status).toBe(201);
  const after = await find();
  expect(after.alerts).toEqual([]);
  expect(after.observations[0]).toContain("Exceção confirmada");
  expect(after.events).toHaveLength(2);
  expect(after.versions).toHaveLength(3);
  await send(
    "post",
    "/attendance/sync",
    {
      events: [
        { ...events[1], id: randomUUID(), occurredAt: "2037-01-01T16:00:00Z" },
      ],
    },
    workerUser,
  );
  expect((await find()).alerts).toContain(
    "Marcação tardia após correção manual: requer revisão.",
  );
  await tenant.inCompany(company, (tx) =>
    tx.rate.updateMany({
      where: { clientId: client },
      data: { startsOn: new Date("2037-02-01") },
    }),
  );
  expect((await find()).alerts).toContain(
    "Sem preço para o cliente e ofício nesta data.",
  );
});
