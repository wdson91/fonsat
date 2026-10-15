import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app";
import { PrismaService } from "../src/database/prisma.service";
import type { DemoUser, Role } from "../src/identity/identity";

describe("Identidade, permissões e isolamento com PostgreSQL real", () => {
  let app: INestApplication;
  let db: PrismaService;
  let users: DemoUser[];
  let companyA: number;
  let companyB: number;
  const user = (role: Role, company = companyA) =>
    users.find((u) => u.company_id === company && u.role === role)!;
  beforeAll(async () => {
    app = await createApp();
    await app.init();
    db = app.get(PrismaService);
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
      const rows = await db.inCompany(company, (tx) => tx.site.findMany());
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
        db.inCompany(company, (tx) => tx.site.findMany()),
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
      db.inCompany(companyA, async () => {
        throw new Error("rollback intencional");
      }),
    ).rejects.toThrow("rollback intencional");
    expect(await db.site.findMany()).toEqual([]);
  });
});
