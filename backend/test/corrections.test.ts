import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { TenantService } from "../src/database/tenant.service";
let app: INestApplication,
  user: number,
  admin: number,
  foreman: number,
  site: number,
  otherSite: number,
  trade: number,
  entryId = randomUUID();
const call = (
  method: "get" | "post",
  path: string,
  body?: object,
  id = admin,
) =>
  request(app.getHttpServer())
    [method]("/api" + path)
    .set("X-User-Id", String(id))
    .send(body);
const correction = (extra = {}) => ({
  expectedVersion: 1,
  siteId: site,
  tradeId: trade,
  startAt: "2026-10-15T08:00:00Z",
  endAt: "2026-10-15T17:00:00Z",
  reason: "Saída esquecida",
  ...extra,
});
beforeAll(async () => {
  app = await createApp();
  await app.init();
  const users = (await request(app.getHttpServer()).get("/api/demo-users"))
    .body;
  const company = users[0].company_id;
  user = users.find(
    (u: any) => u.company_id === company && u.role === "worker",
  ).id;
  admin = users.find(
    (u: any) => u.company_id === company && u.role === "admin",
  ).id;
  foreman = users.find(
    (u: any) => u.company_id === company && u.role === "foreman",
  ).id;
  const catalog = (await call("get", "/catalog")).body;
  site = catalog.sites.find((s: any) => s.name === "Edifício Aurora").id;
  otherSite = catalog.sites.find((s: any) => s.id !== site).id;
  trade = catalog.trades[0].id;
  expect(
    (
      await call(
        "post",
        "/attendance/sync",
        {
          events: [
            {
              id: randomUUID(),
              shiftId: entryId,
              siteId: site,
              kind: "in",
              occurredAt: "2026-10-15T08:00:00Z",
            },
          ],
        },
        user,
      )
    ).body.results[0].accepted,
  ).toBe(true);
});
afterAll(async () => {
  await app?.close();
});
it("exige motivo e impede trabalhador e encarregado fora do âmbito", async () => {
  expect(
    (
      await call(
        "post",
        `/attendance/${entryId}/corrections`,
        correction({ reason: " " }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        "post",
        `/attendance/${entryId}/corrections`,
        correction(),
        user,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        "post",
        `/attendance/${entryId}/corrections`,
        correction({ siteId: otherSite }),
        foreman,
      )
    ).status,
  ).toBe(403);
});
it("duas correções concorrentes criam só uma nova versão; preserva original e motivo", async () => {
  const results = await Promise.all([
    call("post", `/attendance/${entryId}/corrections`, correction()),
    call("post", `/attendance/${entryId}/corrections`, correction()),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  const entry = (await call("get", "/attendance/entries")).body.find(
    (e: any) => e.id === entryId,
  );
  expect(entry.versions).toHaveLength(2);
  expect(entry.versions[1].endAt).toBeNull();
  expect(entry.current).toMatchObject({
    minutes: 540,
    reason: "Saída esquecida",
    source: "manual",
  });
  expect(entry.current.author.name).toBeTruthy();
});
it("marcação tardia não substitui a correção manual e aparece para revisão", async () => {
  expect(
    (
      await call(
        "post",
        "/attendance/sync",
        {
          events: [
            {
              id: randomUUID(),
              shiftId: entryId,
              siteId: site,
              kind: "out",
              occurredAt: "2026-10-15T16:00:00Z",
            },
          ],
        },
        user,
      )
    ).body.results[0],
  ).toMatchObject({ accepted: true, needsReview: true });
  const entry = (await call("get", "/attendance/entries")).body.find(
    (e: any) => e.id === entryId,
  );
  expect(entry.current.minutes).toBe(540);
  expect(entry.versions).toHaveLength(2);
  expect(entry.events).toHaveLength(2);
  expect(
    entry.alerts.some((a: string) => a.includes("após correção manual")),
  ).toBe(true);
});

it("o banco recusa uma correção manual com motivo nulo", async () => {
  const me = (await call("get", "/me")).body;
  await expect(
    app.get(TenantService).inCompany(me.company_id, (tx) =>
      tx.entryVersion.create({
        data: {
          companyId: me.company_id,
          entryId,
          number: 99,
          siteId: site,
          tradeId: trade,
          startAt: new Date("2026-10-15T08:00:00Z"),
          endAt: new Date("2026-10-15T17:00:00Z"),
          workedOn: new Date("2026-10-15"),
          minutes: 540,
          source: "manual",
          reason: null,
          authorId: admin,
        },
      }),
    ),
  ).rejects.toThrow();
});
