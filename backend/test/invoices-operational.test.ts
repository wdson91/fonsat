import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Pool } from "pg";
import { createApp } from "../src/app";
import { TenantService } from "../src/database/tenant.service";
import { lockCompanyFinance } from "../src/invoices/invoice-source";
import type { InvoiceDocument } from "../src/invoices/invoices.service";
import { invoiceTestDatabase } from "./invoice-test-database";

describe("Fases 2 a 7 integradas com registos e preços reais", () => {
  let app: INestApplication, owner: Pool, tenant: TenantService;
  let database: Awaited<ReturnType<typeof invoiceTestDatabase>>;
  const originalAppUrl = process.env.DATABASE_URL,
    originalAdminUrl = process.env.ADMIN_DATABASE_URL;
  let admin: number, worker: number, company: number, otherAdmin: number;
  let clientA: number,
    clientB: number,
    clientUserA: number,
    clientUserB: number,
    siteA: number,
    siteB: number,
    trade: number,
    otherTrade: number;
  let entryId: string, original: InvoiceDocument;
  const suffix = randomUUID();
  const call = (
    method: "get" | "post" | "patch",
    path: string,
    body?: object,
    actor = admin,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/api${path}`)
      .set("X-User-Id", String(actor));
    return body === undefined ? req : req.send(body);
  };
  async function created(path: string, body: object) {
    const result = await call("post", path, body);
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body as { id: number };
  }
  async function newEntry(day: string, minutes: number) {
    const id = randomUUID();
    const startAt = `${day}T08:00:00Z`;
    const sync = await call(
      "post",
      "/attendance/sync",
      {
        events: [
          {
            id: randomUUID(),
            shiftId: id,
            siteId: siteA,
            kind: "in",
            occurredAt: startAt,
          },
        ],
      },
      worker,
    );
    expect(sync.body.results[0].accepted).toBe(true);
    const corrected = await call("post", `/attendance/${id}/corrections`, {
      expectedVersion: 1,
      siteId: siteA,
      tradeId: trade,
      startAt,
      endAt: new Date(Date.parse(startAt) + minutes * 60000).toISOString(),
      reason: "Confirmar horas efetivas",
    });
    expect(corrected.status, JSON.stringify(corrected.body)).toBe(201);
    return id;
  }
  async function correct(
    version: number,
    minutes: number,
    siteId = siteA,
    tradeId = trade,
  ) {
    const startAt = "2024-01-10T08:00:00Z";
    const result = await call("post", `/attendance/${entryId}/corrections`, {
      expectedVersion: version,
      siteId,
      tradeId,
      startAt,
      endAt: new Date(Date.parse(startAt) + minutes * 60000).toISOString(),
      reason: `Revisão ${version + 1}`,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
  }
  async function draft(period: string, clientId = clientA) {
    const result = await call("post", "/invoices/drafts", { clientId, period });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body as InvoiceDocument;
  }
  async function issue(document: InvoiceDocument) {
    const result = await call("post", `/invoices/${document.id}/issue`, {
      expectedHash: document.reviewHash,
    });
    expect(result.status, JSON.stringify(result.body)).toBe(201);
    return result.body as InvoiceDocument;
  }

  beforeAll(async () => {
    database = await invoiceTestDatabase();
    process.env.DATABASE_URL = database.appUrl;
    process.env.ADMIN_DATABASE_URL = database.adminUrl;
    app = await createApp();
    await app.init();
    tenant = app.get(TenantService);
    owner = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
    const users = (await request(app.getHttpServer()).get("/api/demo-users"))
      .body as { id: number; company_id: number; role: string }[];
    company = users[0].company_id;
    admin = users.find(
      (u) => u.company_id === company && u.role === "admin",
    )!.id;
    worker = users.find(
      (u) => u.company_id === company && u.role === "worker",
    )!.id;
    otherAdmin = users.find(
      (u) => u.company_id !== company && u.role === "admin",
    )!.id;
    const people = await owner.query<{ id: number }>(
      `INSERT INTO demo_users (company_id, name, role) VALUES ($1, $2, 'client'), ($1, $3, 'client') RETURNING id`,
      [company, `Pessoa A ${suffix}`, `Pessoa B ${suffix}`],
    );
    [clientUserA, clientUserB] = people.rows.map((row) => row.id);
    clientA = (
      await created("/catalog/clients", {
        name: `Empresa A ${suffix}`,
        userId: clientUserA,
      })
    ).id;
    clientB = (
      await created("/catalog/clients", {
        name: `Empresa B ${suffix}`,
        userId: clientUserB,
      })
    ).id;
    siteA = (
      await created("/catalog/sites", {
        name: `Obra A ${suffix}`,
        clientId: clientA,
      })
    ).id;
    siteB = (
      await created("/catalog/sites", {
        name: `Obra B ${suffix}`,
        clientId: clientB,
      })
    ).id;
    trade = (await created("/catalog/trades", { name: `Pedreiro ${suffix}` }))
      .id;
    otherTrade = (
      await created("/catalog/trades", { name: `Pintor ${suffix}` })
    ).id;
    for (const [clientId, tradeId, cents] of [
      [clientA, trade, 100],
      [clientA, otherTrade, 200],
      [clientB, trade, 200],
    ]) {
      await created("/billing/rates", {
        clientId,
        tradeId,
        cents,
        startsOn: "2024-01-01",
      });
    }
    entryId = await newEntry("2024-01-10", 60);
  }, 60000);
  afterAll(async () => {
    try {
      await app?.close();
      await owner?.end();
      await database?.close();
    } finally {
      if (originalAppUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalAppUrl;
      if (originalAdminUrl === undefined) delete process.env.ADMIN_DATABASE_URL;
      else process.env.ADMIN_DATABASE_URL = originalAdminUrl;
    }
  });

  it("emite o registo real, congela os nomes e aplica o vínculo explícito do cliente", async () => {
    const prepared = await draft("2024-01");
    expect(prepared.totalCents).toBe(100);
    expect(prepared.lines[0].after[0]).toMatchObject({
      id: entryId,
      version: 2,
      minutes: 60,
    });
    expect(
      (await call("get", `/invoices/${prepared.id}`, undefined, clientUserA))
        .status,
    ).toBe(404);
    original = await issue(prepared);
    expect(
      (await call("get", `/invoices/${original.id}`, undefined, clientUserA))
        .body,
    ).toEqual(original);
    const renamed = await call("patch", `/catalog/sites/${siteA}`, {
      name: `Nome posterior ${suffix}`,
      clientId: clientA,
    });
    expect(renamed.status).toBe(200);
    expect((await call("get", `/invoices/${original.id}`)).body).toEqual(
      original,
    );
    expect(
      (await call("get", `/invoices/${original.id}`, undefined, clientUserB))
        .status,
    ).toBe(404);
    expect(
      (await call("get", `/invoices/${original.id}`, undefined, otherAdmin))
        .status,
    ).toBe(404);
  });
  it("uma correção real após emissão entra como ajuste único com auditoria", async () => {
    await correct(2, 90);
    const invoice = await issue(await draft("2024-02"));
    expect(invoice.totalCents).toBe(50);
    expect(invoice.lines[0].before[0].version).toBe(2);
    expect(invoice.lines[0].after[0].version).toBe(3);
    expect(invoice.lines[0].changes[0]).toMatchObject({
      reason: "Revisão 3",
      correctedBy: expect.any(String),
      correctedAt: expect.any(String),
    });
    expect((await draft("2024-03")).lines).toEqual([]);
  });
  it("mudança de ofício e reversão mantêm os grupos e o acumulado faturado", async () => {
    await correct(3, 90, siteA, otherTrade);
    const changed = await issue(await draft("2024-03"));
    expect(changed.totalCents).toBe(150);
    expect(
      changed.lines.map((line) => line.amountCents).sort((a, b) => a - b),
    ).toEqual([-150, 300]);
    await correct(4, 60);
    expect((await issue(await draft("2024-04"))).totalCents).toBe(-200);
    expect((await draft("2024-05")).lines).toEqual([]);
  });
  it("a transferência real permite emitir primeiro o débito e mantém o crédito pendente", async () => {
    await correct(5, 60, siteB);
    const debit = await issue(await draft("2024-05", clientB));
    expect(debit.totalCents).toBe(200);
    const pendingCredit = await draft("2024-05");
    expect(pendingCredit.totalCents).toBe(-100);
    const credit = await issue(pendingCredit);
    expect(credit.lines.flatMap((line) => line.after)).toEqual([]);
    expect(
      credit.lines
        .flatMap((line) => line.references)
        .some((ref) => ref.invoiceId === debit.id),
    ).toBe(false);
    expect(credit.lines[0].changes[0].reason).toBe("Revisão 6");
    expect(
      (await call("get", `/invoices/${debit.id}`, undefined, clientUserA))
        .status,
    ).toBe(404);
    expect(
      (await call("get", `/invoices/${credit.id}`, undefined, clientUserB))
        .status,
    ).toBe(404);
    for (const clientId of [clientA, clientB])
      expect((await draft("2024-06", clientId)).lines).toEqual([]);
  });
  it("exclusão da fase 5 invalida a revisão, fica no snapshot e regressa no mês seguinte", async () => {
    await newEntry("2024-06-01", 60);
    const deferred = await newEntry("2024-06-02", 60);
    const prepared = await draft("2024-06");
    expect(prepared.totalCents).toBe(200);
    const billing = await call("post", "/billing/drafts", {
      clientId: clientA,
      period: "2024-06",
    });
    expect(billing.status).toBe(201);
    expect(
      (
        await call("post", `/billing/drafts/${billing.body.id}/exclusions`, {
          entryId: deferred,
          reason: "Confirmar com cliente no mês seguinte",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await call("post", `/invoices/${prepared.id}/issue`, {
          expectedHash: prepared.reviewHash,
        })
      ).status,
    ).toBe(409);
    const invoice = await issue(await draft("2024-06"));
    expect(invoice.totalCents).toBe(100);
    expect(invoice.exclusions).toContainEqual(
      expect.objectContaining({
        entryId: deferred,
        reason: "Confirmar com cliente no mês seguinte",
      }),
    );
    expect((await issue(await draft("2024-07"))).totalCents).toBe(100);
    expect((await draft("2024-08")).lines).toEqual([]);
  });
  it("uma alteração operacional sob o bloqueio financeiro é revalidada depois do commit", async () => {
    await newEntry("2024-08-01", 30);
    const prepared = await draft("2024-08");
    let ready!: () => void, release!: () => void;
    const acquired = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const change = tenant.inCompany(company, async (tx) => {
      await lockCompanyFinance(tx, company);
      await tx.site.update({
        where: { id: siteA },
        data: { name: `Outro nome ${suffix}` },
      });
      ready();
      await hold;
    });
    await acquired;
    const pending = call("post", `/invoices/${prepared.id}/issue`, {
      expectedHash: prepared.reviewHash,
    }).then((result) => result);
    release();
    await change;
    expect((await pending).status).toBe(409);
  });
});
