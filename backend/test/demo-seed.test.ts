import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import { invoiceTestDatabase } from "./invoice-test-database";
let database: Awaited<ReturnType<typeof invoiceTestDatabase>>, owner: Pool;
beforeAll(async () => {
  database = await invoiceTestDatabase();
  owner = new Pool({ connectionString: database.adminUrl });
}, 60000);
afterAll(async () => {
  await owner?.end();
  await database?.close();
});
it("as duas empresas têm trabalhadores, distribuição, preços e factos demonstráveis", async () => {
  const companies = (await owner.query("SELECT id FROM companies")).rows;
  expect(companies).toHaveLength(2);
  for (const company of companies) {
    expect(
      Number(
        (
          await owner.query(
            "SELECT count(*) FROM workers WHERE company_id=$1",
            [company.id],
          )
        ).rows[0].count,
      ),
    ).toBeGreaterThanOrEqual(3);
    expect(
      Number(
        (
          await owner.query(
            "SELECT count(*) FROM allocations WHERE company_id=$1",
            [company.id],
          )
        ).rows[0].count,
      ),
    ).toBeGreaterThan(0);
    expect(
      Number(
        (
          await owner.query("SELECT count(*) FROM rates WHERE company_id=$1", [
            company.id,
          ])
        ).rows[0].count,
      ),
    ).toBeGreaterThan(0);
    const entries = (
      await owner.query(
        "SELECT v.minutes FROM work_entries e JOIN entry_versions v ON v.company_id=e.company_id AND v.entry_id=e.id AND v.number=e.current_version WHERE e.company_id=$1",
        [company.id],
      )
    ).rows;
    expect(entries).toContainEqual({ minutes: 480 });
    expect(entries).toContainEqual({ minutes: null });
  }
});
it("repetir o seed preserva os exemplos, correções e nomes editados", async () => {
  const site = (await owner.query("SELECT id FROM sites ORDER BY id LIMIT 1"))
    .rows[0];
  await owner.query("UPDATE sites SET name=$1 WHERE id=$2", [
    "Obra com nome revisto",
    site.id,
  ]);
  const tradesBefore = Number(
    (await owner.query("SELECT count(*) FROM trades")).rows[0].count,
  );
  await owner.query("UPDATE trades SET name=name || ' revisto'");
  const before = (
    await owner.query(
      "SELECT e.id, e.current_version, v.id AS version_id FROM work_entries e JOIN entry_versions v ON v.entry_id=e.id ORDER BY e.id,v.id",
    )
  ).rows;
  execFileSync("npm", ["run", "db:seed"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: database.appUrl,
      ADMIN_DATABASE_URL: database.adminUrl,
    },
    stdio: "pipe",
  });
  expect(
    (
      await owner.query(
        "SELECT e.id, e.current_version, v.id AS version_id FROM work_entries e JOIN entry_versions v ON v.entry_id=e.id ORDER BY e.id,v.id",
      )
    ).rows,
  ).toEqual(before);
  expect(
    (await owner.query("SELECT name FROM sites WHERE id=$1", [site.id])).rows[0]
      .name,
  ).toBe("Obra com nome revisto");
  expect(
    Number((await owner.query("SELECT count(*) FROM sites")).rows[0].count),
  ).toBe(4);
  expect(
    Number((await owner.query("SELECT count(*) FROM trades")).rows[0].count),
  ).toBe(tradesBefore);
});
