import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { invoiceTestDatabase } from "./invoice-test-database";
let app: INestApplication,
  database: Awaited<ReturnType<typeof invoiceTestDatabase>>,
  worker: number,
  admin: number,
  site: number,
  client: number,
  trade: number;
const previous = {
  app: process.env.DATABASE_URL,
  admin: process.env.ADMIN_DATABASE_URL,
};
const headers = () => ({ "X-User-Id": String(admin) });
beforeAll(async () => {
  database = await invoiceTestDatabase();
  process.env.DATABASE_URL = database.appUrl;
  process.env.ADMIN_DATABASE_URL = database.adminUrl;
  app = await createApp();
  await app.init();
  const users = (await request(app.getHttpServer()).get("/api/demo-users"))
    .body;
  worker = users.find((u: any) => u.name === "João Silva").id;
  admin = users.find((u: any) => u.name === "Sofia Ramos").id;
  const catalog = (
    await request(app.getHttpServer()).get("/api/catalog").set(headers())
  ).body;
  const original = catalog.sites.find(
    (row: any) => row.name === "Edifício Aurora",
  );
  site = original.id;
  client = original.clientId;
  trade = catalog.workers.find((row: any) => row.userId === worker).tradeId;
  expect(
    (
      await request(app.getHttpServer())
        .post("/api/billing/rates")
        .set(headers())
        .send({
          clientId: client,
          tradeId: trade,
          cents: 100,
          startsOn: "2024-01-01",
          endsOn: "2024-12-31",
        })
    ).status,
  ).toBe(201);
}, 60000);
afterAll(async () => {
  await app?.close();
  await database?.close();
  process.env.DATABASE_URL = previous.app;
  process.env.ADMIN_DATABASE_URL = previous.admin;
});
const work = randomUUID(),
  pause = randomUUID();
it("regista trabalho e pausas separados, sem faturar os intervalos de pausa", async () => {
  const events = [];
  for (const [shiftId, start, end, activity] of [
    [work, "09:00", "13:30", "work"],
    [pause, "13:30", "13:45", "break"],
    [randomUUID(), "13:45", "14:00", "work"],
    [randomUUID(), "14:00", "15:00", "break"],
    [randomUUID(), "15:00", "18:00", "work"],
  ]) {
    events.push(
      {
        id: randomUUID(),
        shiftId,
        siteId: site,
        kind: activity === "work" ? "in" : "break_in",
        occurredAt: `2024-06-03T${start}:00+01:00`,
      },
      {
        id: randomUUID(),
        shiftId,
        siteId: site,
        kind: activity === "work" ? "out" : "break_out",
        occurredAt: `2024-06-03T${end}:00+01:00`,
      },
    );
  }
  const response = await request(app.getHttpServer())
    .post("/api/attendance/sync")
    .set("X-User-Id", String(worker))
    .send({ events });
  expect(
    response.body.results.every((row: any) => row.accepted),
    JSON.stringify(response.body),
  ).toBe(true);
  const list = (
    await request(app.getHttpServer())
      .get("/api/attendance/entries")
      .set(headers())
  ).body;
  expect(list.find((row: any) => row.id === pause)).toMatchObject({
    activity: "break",
    current: { minutes: 15 },
  });
  const draft = await request(app.getHttpServer())
    .post("/api/invoices/drafts")
    .set(headers())
    .send({ clientId: client, period: "2024-06" });
  expect(draft.status).toBe(201);
  expect(draft.body.totalMinutes).toBe(465);
  expect(draft.body.totalCents).toBe(775);
  expect(
    draft.body.lines
      .flatMap((line: any) => line.after)
      .some((entry: any) => entry.id === pause),
  ).toBe(false);
});
it("o mesmo período não pode misturar trabalho e pausa nem trocar de categoria", async () => {
  const response = await request(app.getHttpServer())
    .post("/api/attendance/sync")
    .set("X-User-Id", String(worker))
    .send({
      events: [
        {
          id: randomUUID(),
          shiftId: work,
          siteId: site,
          kind: "break_in",
          occurredAt: "2024-06-03T09:00:00+01:00",
        },
      ],
    });
  expect(response.body.results[0]).toMatchObject({
    accepted: false,
    status: 409,
  });
});
