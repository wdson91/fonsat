import "reflect-metadata";
import { randomInt } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Test } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Pool } from "pg";
import { IdentityModule } from "../src/identity/identity.module";
import { PrismaService } from "../src/database/prisma.service";
import { TenantService } from "../src/database/tenant.service";
import { InvoicesModule } from "../src/invoices/invoices.module";
import {
  InvoicesService,
  type InvoiceDocument,
} from "../src/invoices/invoices.service";
import {
  INVOICE_SOURCE,
  lockCompanyFinance,
  type InvoiceSource,
} from "../src/invoices/invoice-source";
import type { FinancialEntry } from "../src/invoices/invoice-engine";
import type { CurrentUser } from "../src/identity/identity";
import { invoiceTestDatabase } from "./invoice-test-database";

describe("Emissão e ajustes com PostgreSQL real", () => {
  let app: INestApplication,
    db: PrismaService,
    tenant: TenantService,
    service: InvoicesService;
  let owner: Pool,
    admin: CurrentUser,
    client: CurrentUser,
    otherAdmin: CurrentUser,
    worker: CurrentUser;
  let database: Awaited<ReturnType<typeof invoiceTestDatabase>>;
  const originalAppUrl = process.env.DATABASE_URL,
    originalAdminUrl = process.env.ADMIN_DATABASE_URL;
  let entries: FinancialEntry[] = [];
  let activeClient = randomInt(1000000, 100000000) * 10;
  const source: InvoiceSource = {
    async clients() {
      return [
        { id: activeClient, name: "Cliente A" },
        { id: activeClient + 1, name: "Cliente B" },
      ];
    },
    async clientForUser() {
      return activeClient;
    },
    async entries() {
      return structuredClone(entries);
    },
  };
  const makeEntry = (
    overrides: Partial<FinancialEntry> = {},
  ): FinancialEntry => ({
    id: `entry-${activeClient}`,
    version: 1,
    clientId: activeClient,
    clientName: "Cliente A",
    siteId: 20,
    siteName: "Obra",
    tradeId: 30,
    tradeName: "Pedreiro",
    rateId: 40,
    rateCents: 100,
    rateStartsOn: "2026-01-01",
    workerId: 50,
    workerName: "João",
    workedOn: "2026-01-10",
    startAt: "2026-01-10T08:00:00Z",
    endAt: "2026-01-10T09:00:00Z",
    minutes: 60,
    reason: null,
    status: "closed",
    ...overrides,
  });
  const draft = (month = "2026-01", clientId = activeClient) =>
    service.draft(admin, clientId, month);
  const issue = (document: InvoiceDocument) =>
    service.issue(admin, document.id, document.reviewHash);
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    database = await invoiceTestDatabase();
    process.env.DATABASE_URL = database.appUrl;
    process.env.ADMIN_DATABASE_URL = database.adminUrl;
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        IdentityModule,
        InvoicesModule,
      ],
    })
      .overrideProvider(INVOICE_SOURCE)
      .useValue(source)
      .compile();
    app = module.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
    db = app.get(PrismaService);
    tenant = app.get(TenantService);
    service = app.get(InvoicesService);
    owner = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
    const users = (await http().get("/api/demo-users")).body as {
      id: number;
      role: string;
      company_id: number;
    }[];
    const company = users[0].company_id;
    const resolve = async (role: string, other = false) =>
      (
        await http()
          .get("/api/me")
          .set(
            "X-User-Id",
            String(
              users.find(
                (u) =>
                  u.role === role &&
                  (other ? u.company_id !== company : u.company_id === company),
              )!.id,
            ),
          )
      ).body as CurrentUser;
    admin = await resolve("admin");
    client = await resolve("client");
    worker = await resolve("worker");
    otherAdmin = await resolve("admin", true);
  }, 60000);
  beforeEach(async () => {
    const name = `Finance fixture ${randomInt(1000000000)}`;
    const clients = await owner.query<{ id: number }>(
      "INSERT INTO clients (company_id, name) VALUES ($1, $2), ($1, $3) RETURNING id",
      [admin.company_id, `${name} A`, `${name} B`],
    );
    activeClient = clients.rows[0].id;
    expect(clients.rows[1].id).toBe(activeClient + 1);
    entries = [makeEntry()];
  });
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

  it("emite uma vez e reenvios devolvem o mesmo snapshot e número", async () => {
    const prepared = await draft();
    const invoice = await issue(prepared);
    expect(invoice).toMatchObject({
      status: "issued",
      totalCents: 100,
      issuedBy: admin.id,
    });
    expect(invoice.number).toMatch(/^FT \d{4}\/\d+$/);
    expect(await issue(prepared)).toEqual(invoice);
    expect(await service.get(admin, prepared.id)).toEqual(invoice);
  });
  it("duas emissões simultâneas do mesmo rascunho não duplicam cobrança", async () => {
    const prepared = await draft();
    const results = await Promise.all([
      issue(prepared),
      issue(prepared),
      issue(prepared),
    ]);
    expect(new Set(results.map((item) => item.number)).size).toBe(1);
    const rows = await tenant.inCompany(
      admin.company_id,
      (tx) =>
        tx.$queryRaw<
          { count: bigint }[]
        >`SELECT count(*) FROM financial_invoices WHERE client_id = ${activeClient}`,
    );
    expect(Number(rows[0].count)).toBe(1);
  });
  it("rascunhos de meses diferentes disputando o mesmo trabalho exigem nova revisão", async () => {
    const january = await draft(),
      february = await draft("2026-02");
    const results = await Promise.allSettled([issue(january), issue(february)]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  });
  it("alteração de nomes, preços, versões ou justificação torna o rascunho obsoleto", async () => {
    for (const change of [
      { workerName: "Outro nome" },
      { siteName: "Outra obra" },
      { rateCents: 200 },
      { version: 2, reason: "Acerto" },
    ]) {
      entries = [makeEntry()];
      const prepared = await draft();
      entries[0] = { ...entries[0], ...change };
      await expect(issue(prepared)).rejects.toThrow("Os dados mudaram");
    }
  });
  it("confirmar a versão anterior de um rascunho regenerado devolve conflito", async () => {
    const old = await draft();
    entries[0].minutes = 90;
    const current = await draft();
    expect(current.id).toBe(old.id);
    await expect(issue(old)).rejects.toThrow("rascunho foi atualizado");
    expect((await issue(current)).totalCents).toBe(150);
  });
  it("snapshot emitido não muda ao alterar os dados de origem", async () => {
    const invoice = await issue(await draft());
    entries[0] = makeEntry({
      workerName: "Novo nome",
      minutes: 90,
      rateCents: 200,
      version: 2,
    });
    expect(await service.get(admin, invoice.id)).toEqual(invoice);
    await expect(
      tenant.inCompany(
        admin.company_id,
        (tx) =>
          tx.$executeRaw`UPDATE financial_invoices SET snapshot = '{}'::jsonb WHERE id = ${invoice.id}::uuid`,
      ),
    ).rejects.toThrow();
    await expect(
      owner.query("UPDATE financial_invoices SET number = $1 WHERE id = $2", [
        "alterada",
        invoice.id,
      ]),
    ).rejects.toThrow("imutável");
  });
  it("falha ao inserir o documento reverte contador e emissão na mesma transação", async () => {
    const prepared = await draft();
    const before = await owner.query(
      "SELECT last_number FROM financial_counters WHERE company_id = $1",
      [admin.company_id],
    );
    await owner.query(
      `CREATE FUNCTION public.test_reject_financial_invoice() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha intencional de emissão'; END $$`,
    );
    await owner.query(
      `CREATE TRIGGER test_reject_invoice AFTER INSERT ON financial_invoices FOR EACH ROW EXECUTE FUNCTION public.test_reject_financial_invoice()`,
    );
    try {
      await expect(issue(prepared)).rejects.toThrow("falha intencional");
    } finally {
      await owner.query(
        "DROP TRIGGER test_reject_invoice ON financial_invoices",
      );
      await owner.query("DROP FUNCTION public.test_reject_financial_invoice()");
    }
    const after = await owner.query(
      "SELECT last_number FROM financial_counters WHERE company_id = $1",
      [admin.company_id],
    );
    expect(after.rows).toEqual(before.rows);
    expect((await service.get(admin, prepared.id)).status).toBe("draft");
    expect((await issue(prepared)).status).toBe("issued");
  });
  it("bloqueios e documentos vazios não podem ser emitidos", async () => {
    entries[0].rateId = null;
    entries[0].rateCents = null;
    await expect(issue(await draft())).rejects.toThrow("bloqueios");
    entries = [];
    await expect(issue(await draft())).rejects.toThrow("Não existem");
  });
  it("correções sucessivas e reversões produzem apenas o saldo pendente", async () => {
    await issue(await draft());
    entries[0] = makeEntry({
      version: 2,
      minutes: 90,
      reason: "Primeira correção",
    });
    expect((await issue(await draft("2026-02"))).totalCents).toBe(50);
    entries[0] = makeEntry({
      version: 3,
      minutes: 120,
      reason: "Segunda correção",
    });
    expect((await issue(await draft("2026-03"))).totalCents).toBe(50);
    expect((await draft("2026-04")).lines).toEqual([]);
    entries[0] = makeEntry({ version: 4, reason: "Repor original" });
    const credit = await issue(await draft("2026-04"));
    expect(credit.totalCents).toBe(-100);
    expect((await draft("2026-05")).lines).toEqual([]);
  });
  it.each([false, true])(
    "transferência entre clientes preserva os dois lados (novo primeiro: %s)",
    async (newFirst) => {
      const original = await issue(await draft());
      entries[0] = makeEntry({
        clientId: activeClient + 1,
        clientName: "Cliente B",
        version: 2,
        siteId: 21,
        rateId: 41,
        rateCents: 200,
        reason: "Transferência",
      });
      const firstClient = newFirst ? activeClient + 1 : activeClient;
      const secondClient = newFirst ? activeClient : activeClient + 1;
      const first = await issue(await draft("2026-02", firstClient));
      const second = await issue(await draft("2026-02", secondClient));
      expect(first.totalCents).toBe(newFirst ? 200 : -100);
      expect(second.totalCents).toBe(newFirst ? -100 : 200);
      const credit = newFirst ? second : first;
      expect(credit.lines[0].references.map((ref) => ref.invoiceId)).toEqual([
        original.id,
      ]);
      expect(credit.lines[0].after).toEqual([]);
      for (const clientId of [activeClient, activeClient + 1])
        expect((await draft("2026-03", clientId)).lines).toEqual([]);
      const visible = await service.list(client);
      expect(
        visible
          .map((item) => item.client.id)
          .every((id) => id === activeClient),
      ).toBe(true);
      await expect(
        service.get(client, (newFirst ? first : second).id),
      ).rejects.toThrow("não encontrada");
    },
  );
  it("cliente consulta apenas documentos emitidos que lhe pertencem", async () => {
    const prepared = await draft();
    await expect(service.get(client, prepared.id)).rejects.toThrow(
      "não encontrada",
    );
    const invoice = await issue(prepared);
    expect(await service.get(client, invoice.id)).toEqual(invoice);
    expect(
      (await service.list(client)).every(
        (item) => item.status === "issued" && item.client.id === activeClient,
      ),
    ).toBe(true);
  });
  it("RLS não expõe documentos nem contadores sem contexto ou a outra empresa", async () => {
    const invoice = await issue(await draft());
    expect(await db.$queryRaw`SELECT * FROM financial_invoices`).toEqual([]);
    expect(await db.$queryRaw`SELECT * FROM financial_drafts`).toEqual([]);
    expect(await db.$queryRaw`SELECT * FROM financial_counters`).toEqual([]);
    await expect(service.get(otherAdmin, invoice.id)).rejects.toThrow(
      "não encontrada",
    );
    await expect(
      service.issue(otherAdmin, invoice.id, invoice.reviewHash),
    ).rejects.toThrow("não encontrado");
  });
  it("HTTP recusa identidade ausente, perfil indevido e payloads inválidos", async () => {
    expect((await http().get("/api/invoices")).status).toBe(401);
    expect(
      (await http().get("/api/invoices").set("X-User-Id", String(worker.id)))
        .status,
    ).toBe(403);
    expect(
      (
        await http()
          .post("/api/invoices/drafts")
          .set("X-User-Id", String(client.id))
          .send({ clientId: activeClient, period: "2026-01" })
      ).status,
    ).toBe(403);
    for (const body of [
      {},
      { clientId: "1", period: "2026-01" },
      { clientId: -1, period: "2026-13" },
      { clientId: activeClient, period: "2099-01" },
    ]) {
      expect(
        (
          await http()
            .post("/api/invoices/drafts")
            .set("X-User-Id", String(admin.id))
            .send(body)
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await http()
          .get("/api/invoices/invalid")
          .set("X-User-Id", String(admin.id))
      ).status,
    ).toBe(400);
  });
  it("HTTP permite rever e emitir com a confirmação do conteúdo observado", async () => {
    const response = await http()
      .post("/api/invoices/drafts")
      .set("X-User-Id", String(admin.id))
      .send({ clientId: activeClient, period: "2026-01" });
    expect(response.status).toBe(201);
    const invoice = await http()
      .post(`/api/invoices/${response.body.id}/issue`)
      .set("X-User-Id", String(admin.id))
      .send({ expectedHash: response.body.reviewHash });
    expect(invoice.status).toBe(201);
    expect(
      (
        await http()
          .get(`/api/invoices/${invoice.body.id}`)
          .set("X-User-Id", String(client.id))
      ).headers["cache-control"],
    ).toBe("no-store");
  });
  it("o bloqueio financeiro espera por uma correção e o contexto não pode ser forjado", async () => {
    await expect(
      tenant.inCompany(admin.company_id, (tx) =>
        lockCompanyFinance(tx, otherAdmin.company_id),
      ),
    ).rejects.toThrow("Contexto empresarial inválido");
    const prepared = await draft();
    let unlock!: () => void;
    let ready!: () => void;
    const acquired = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const correction = tenant.inCompany(admin.company_id, async (tx) => {
      await lockCompanyFinance(tx, admin.company_id);
      ready();
      await hold;
      entries[0].version = 2;
      entries[0].minutes = 90;
    });
    await acquired;
    const pending = issue(prepared);
    unlock();
    await correction;
    await expect(pending).rejects.toThrow("Os dados mudaram");
  });
});
