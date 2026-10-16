import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

/** A separate database keeps immutable operational fixtures out of identity tests. */
export async function invoiceTestDatabase() {
  const adminUrl = process.env.ADMIN_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  if (!adminUrl || !appUrl)
    throw new Error("As duas ligações PostgreSQL de teste são obrigatórias.");
  const name = `invoice_test_${randomUUID().replaceAll("-", "")}`;
  const administrator = new Pool({ connectionString: adminUrl });
  const appConnection = new URL(appUrl),
    adminConnection = new URL(adminUrl);
  appConnection.pathname = `/${name}`;
  adminConnection.pathname = `/${name}`;
  await administrator.query(`CREATE DATABASE "${name}"`);
  const close = async () => {
    try {
      await administrator.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await administrator.end();
    }
  };
  try {
    const env = {
      ...process.env,
      DATABASE_URL: appConnection.href,
      ADMIN_DATABASE_URL: adminConnection.href,
    };
    execFileSync("npm", ["run", "db:migrate"], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
    });
    execFileSync("npm", ["run", "db:seed"], {
      cwd: process.cwd(),
      env,
      stdio: "pipe",
    });
    return {
      appUrl: appConnection.href,
      adminUrl: adminConnection.href,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
