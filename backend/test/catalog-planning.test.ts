import { afterAll, beforeAll, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { TenantService } from "../src/database/tenant.service";
import { PrismaService } from "../src/database/prisma.service";
let app: INestApplication,
  tenant: TenantService,
  company: number,
  admin: number,
  foreman: number,
  worker: number,
  site: number,
  other: number,
  trade: number,
  createdTrade: number;
const send = (
  method: "get" | "post" | "put" | "patch",
  path: string,
  body?: object,
  id = admin,
) =>
  request(app.getHttpServer())
    [method]("/api" + path)
    .set("X-User-Id", String(id))
    .send(body);
beforeAll(async () => {
  app = await createApp();
  await app.init();
  tenant = app.get(TenantService);
  const users = (await request(app.getHttpServer()).get("/api/demo-users"))
    .body;
  company = users[0].company_id;
  admin = users.find(
    (u: any) => u.company_id === company && u.role === "admin",
  ).id;
  foreman = users.find(
    (u: any) => u.company_id === company && u.role === "foreman",
  ).id;
  const data = (await send("get", "/catalog")).body;
  worker = data.workers[0].id;
  trade = data.trades[0].id;
  site = data.sites.find((s: any) => s.name === "Edifício Aurora").id;
  other = data.sites.find((s: any) => s.id !== site).id;
});
afterAll(async () => {
  if (tenant)
    await tenant.inCompany(company, async (tx) => {
      await tx.allocation.deleteMany({
        where: { day: { gte: new Date("2035-01-01") } },
      });
      if (createdTrade) await tx.trade.delete({ where: { id: createdTrade } });
    });
  await app?.close();
});
it("admin cria e edita cadastro; encarregado não pode criar", async () => {
  const result = await send("post", "/catalog/trades", {
    name: "Teste fase 2",
  });
  expect(result.status).toBe(201);
  createdTrade = result.body.id;
  expect(
    (
      await send("patch", `/catalog/trades/${createdTrade}`, {
        name: "Teste atualizado",
        active: false,
      })
    ).status,
  ).toBe(200);
  expect(
    (await send("post", "/catalog/trades", { name: "Indevido" }, foreman))
      .status,
  ).toBe(403);
});
it("cadastros novos ficam invisíveis sem contexto de empresa", async () => {
  expect(await app.get(PrismaService).trade.findMany()).toEqual([]);
  expect(await app.get(PrismaService).worker.findMany()).toEqual([]);
});
it("recusa data passada e permite atribuir trabalhador livre com ofício alternativo", async () => {
  expect(
    (
      await send("put", "/planning", {
        workerId: worker,
        siteId: site,
        tradeId: trade,
        day: "2020-01-01",
      })
    ).status,
  ).toBe(400);
  const result = await send("put", "/planning", {
    workerId: worker,
    siteId: other,
    tradeId: trade,
    day: "2035-01-01",
  });
  expect(result.status).toBe(200);
  expect(result.body.tradeId).toBe(trade);
});
it("encarregado não retira trabalhador de uma obra fora do âmbito", async () => {
  expect(
    (
      await send(
        "put",
        "/planning",
        { workerId: worker, siteId: site, day: "2035-01-01" },
        foreman,
      )
    ).status,
  ).toBe(403);
});
it("cópia mantém células preenchidas e informa as que não copia", async () => {
  expect(
    (await send("post", "/planning/copy", { week: "2035-01-08" })).body.copied,
  ).toBe(1);
  const again = await send("post", "/planning/copy", { week: "2035-01-08" });
  expect(again.body.copied).toBe(0);
  expect(again.body.skipped[0].reason).toMatch(/preenchida/);
});
it("referências de outra empresa e identificadores inválidos são recusados", async () => {
  const foreign = await tenant.inCompany(company === 1 ? 2 : 1, (tx) =>
    tx.trade.findFirstOrThrow(),
  );
  expect(
    (
      await send("post", "/catalog/workers", {
        name: "Indevido",
        tradeId: foreign.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await send("put", "/planning", {
        workerId: worker,
        siteId: site,
        day: "2035-02-30",
      })
    ).status,
  ).toBe(400);
});

it("permite libertar uma célula futura respeitando o âmbito", async () => {
  const cells = (await send("get", "/planning?week=2035-01-01")).body;
  const cell = cells.find((c: any) => c.workerId === worker);
  expect(
    (
      await request(app.getHttpServer())
        .delete("/api/planning/" + cell.id)
        .set("X-User-Id", String(foreman))
    ).status,
  ).toBe(403);
  expect(
    (
      await request(app.getHttpServer())
        .delete("/api/planning/" + cell.id)
        .set("X-User-Id", String(admin))
    ).status,
  ).toBe(200);
});
