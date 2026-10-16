import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { TenantService } from "../src/database/tenant.service";
import { PrismaService } from "../src/database/prisma.service";
import type { DemoUser, Role } from "../src/identity/identity";

describe("Identidade, permissões e isolamento com PostgreSQL real", () => {
  let app: INestApplication;
  let db: PrismaService;
  let tenant: TenantService;
  let users: DemoUser[];
  let companyA: number;
  let companyB: number;
  const user = (role: Role, company = companyA) =>
    users.find((u) => u.company_id === company && u.role === role)!;
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    db = app.get(PrismaService);
    tenant = app.get(TenantService);
    const response = await request(app.getHttpServer()).get("/api/demo-users");
    expect(response.status).toBe(200);
    users = response.body;
    [companyA, companyB] = [...new Set(users.map((u) => u.company_id))];
  });
  afterAll(async () => {
    await app?.close();
  });

  it("lista apenas os dados mínimos dos quatro perfis nas duas empresas", () => {
    expect(new Set(users.map((u) => u.company_id)).size).toBe(2);
    for (const company of [companyA, companyB]) {
      expect(
        new Set(
          users.filter((u) => u.company_id === company).map((u) => u.role),
        ),
      ).toEqual(new Set(["worker", "foreman", "admin", "client"]));
    }
    expect(Object.keys(users[0]).sort()).toEqual(
      ["id", "name", "role", "company_id", "company_name"].sort(),
    );
  });

  it.each(["worker", "foreman", "admin", "client"] as const)(
    "resolve o perfil %s no servidor",
    async (role) => {
      const selected = user(role);
      const response = await request(app.getHttpServer())
        .get("/api/me")
        .set("X-User-Id", String(selected.id));
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject(selected);
      expect(response.headers["cache-control"]).toBe("no-store");
    },
  );

  it("recusa um pedido sem identidade", async () => {
    expect((await request(app.getHttpServer()).get("/api/me")).status).toBe(
      401,
    );
  });
  it.each(["", "abc", "0", "-1", "1.1", "2147483648", "1,2"])(
    "recusa o identificador inválido %j",
    async (id) => {
      expect(
        (await request(app.getHttpServer()).get("/api/me").set("X-User-Id", id))
          .status,
      ).toBe(401);
    },
  );
  it("recusa um utilizador inexistente", async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get("/api/me")
          .set("X-User-Id", "2147483647")
      ).status,
    ).toBe(401);
  });
  it("ignora empresa e papel inventados no browser", async () => {
    const selected = user("worker");
    const response = await request(app.getHttpServer())
      .get(`/api/me?company_id=${companyB}&role=admin`)
      .set("X-User-Id", String(selected.id))
      .set("X-Company-Id", String(companyB))
      .set("X-Role", "admin");
    expect(response.body).toMatchObject({
      id: selected.id,
      role: "worker",
      company_id: companyA,
    });
    const forbidden = await request(app.getHttpServer())
      .get("/api/sites")
      .set("X-User-Id", String(selected.id))
      .set("X-Role", "admin");
    expect(forbidden.status).toBe(403);
  });

  it.each(["worker", "client"] as const)(
    "o perfil %s não consulta a operação das obras",
    async (role) => {
      expect(
        (
          await request(app.getHttpServer())
            .get("/api/sites")
            .set("X-User-Id", String(user(role).id))
        ).status,
      ).toBe(403);
    },
  );
  it("o administrativo vê só as obras da sua empresa, mesmo com nomes iguais", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/sites")
      .set("X-User-Id", String(user("admin").id));
    const expected = await tenant.inCompany(companyA, (tx) =>
      tx.site.findMany(),
    );
    expect(response.status).toBe(200);
    expect(response.body.map((s: { id: number }) => s.id).sort()).toEqual(
      expected.map((s) => s.id).sort(),
    );
    expect(response.body.length).toBe(2);
  });
  it("o encarregado vê apenas a obra sob a sua responsabilidade ativa", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/sites")
      .set("X-User-Id", String(user("foreman").id));
    expect(response.status).toBe(200);
    expect(response.body.map((s: { name: string }) => s.name)).toEqual([
      "Edifício Aurora",
    ]);
  });
  it("o encarregado recebe 404 para a obra de outro responsável", async () => {
    const other = await tenant.inCompany(companyA, (tx) =>
      tx.site.findFirstOrThrow({ where: { name: "Armazém Norte" } }),
    );
    expect(
      (
        await request(app.getHttpServer())
          .get(`/api/sites/${other.id}`)
          .set("X-User-Id", String(user("foreman").id))
      ).status,
    ).toBe(404);
  });
  it.each(["admin", "foreman"] as const)(
    "o perfil %s recebe 404 para identificadores de outra empresa",
    async (role) => {
      const other = await tenant.inCompany(companyB, (tx) =>
        tx.site.findFirstOrThrow(),
      );
      expect(
        (
          await request(app.getHttpServer())
            .get(`/api/sites/${other.id}`)
            .set("X-User-Id", String(user(role).id))
        ).status,
      ).toBe(404);
    },
  );

  it("o papel da aplicação não é proprietário, superutilizador ou BYPASSRLS", async () => {
    const [role] = await db.$queryRaw<
      { rolname: string; rolsuper: boolean; rolbypassrls: boolean }[]
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = CURRENT_USER`;
    expect(role).toEqual({
      rolname: "fonsat_app",
      rolsuper: false,
      rolbypassrls: false,
    });
    const owners = await db.$queryRaw<
      { owned: boolean }[]
    >`SELECT (pg_get_userbyid(relowner) = CURRENT_USER) AS owned FROM pg_class WHERE oid IN ('public.companies'::regclass, 'public.demo_users'::regclass, 'public.sites'::regclass, 'public.site_responsibilities'::regclass)`;
    expect(owners).toHaveLength(4);
    expect(owners.every((row) => !row.owned)).toBe(true);
  });
  it("sem contexto, consultas sem filtros não veem dados operacionais", async () => {
    expect(await db.company.findMany()).toEqual([]);
    expect(await db.demoUser.findMany()).toEqual([]);
    expect(await db.site.findMany()).toEqual([]);
    expect(await db.siteResponsibility.findMany()).toEqual([]);
  });
  it("isola uma consulta sem filtro e não deixa contexto na conexão", async () => {
    for (const company of [companyA, companyB, companyA]) {
      const rows = await tenant.inCompany(company, (tx) => tx.site.findMany());
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.companyId === company)).toBe(true);
    }
    expect(await db.site.findMany()).toEqual([]);
  });
  it("mantém contextos separados em operações concorrentes", async () => {
    const companies = Array.from({ length: 12 }, (_, i) =>
      i % 2 ? companyA : companyB,
    );
    const results = await Promise.all(
      companies.map((company) =>
        tenant.inCompany(company, (tx) => tx.site.findMany()),
      ),
    );
    results.forEach((rows, i) => {
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((row) => row.companyId === companies[i])).toBe(true);
    });
    expect(await db.site.findMany()).toEqual([]);
  });
  it("uma falha de transação não conserva o tenant", async () => {
    await expect(
      tenant.inCompany(companyA, async () => {
        throw new Error("rollback intencional");
      }),
    ).rejects.toThrow("rollback intencional");
    expect(await db.site.findMany()).toEqual([]);
  });
  it("o banco impede alterar ou criar obras de outra empresa", async () => {
    const other = await tenant.inCompany(companyB, (tx) =>
      tx.site.findFirstOrThrow(),
    );
    const changed = await tenant.inCompany(companyA, (tx) =>
      tx.site.updateMany({
        where: { id: other.id },
        data: { name: "Não pode mudar" },
      }),
    );
    expect(changed.count).toBe(0);
    await expect(
      tenant.inCompany(companyA, (tx) =>
        tx.site.create({
          data: { companyId: companyB, name: "Não pode criar" },
        }),
      ),
    ).rejects.toThrow();
    expect(
      (
        await tenant.inCompany(companyB, (tx) =>
          tx.site.findUniqueOrThrow({ where: { id: other.id } }),
        )
      ).name,
    ).toBe(other.name);
  });
  it("chaves compostas recusam responsabilidade com utilizador de outra empresa", async () => {
    const site = await tenant.inCompany(companyA, (tx) =>
      tx.site.findFirstOrThrow(),
    );
    await expect(
      tenant.inCompany(companyA, (tx) =>
        tx.siteResponsibility.create({
          data: {
            companyId: companyA,
            siteId: site.id,
            userId: user("foreman", companyB).id,
            startsOn: new Date("2030-01-01T00:00:00Z"),
          },
        }),
      ),
    ).rejects.toThrow();
  });
  it("repetir o seed não duplica dados nem altera os identificadores", async () => {
    const before = await db.$queryRaw`SELECT * FROM public.app_demo_users()`;
    execFileSync("npm", ["run", "db:seed"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });
    expect(await db.$queryRaw`SELECT * FROM public.app_demo_users()`).toEqual(
      before,
    );
    expect(await tenant.inCompany(companyA, (tx) => tx.site.count())).toBe(2);
  });
});
