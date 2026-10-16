import { expect, test } from "@playwright/test";
import { companyDay } from "../src/lib/operations";

test("a obra do dia vem selecionada e nove horas exigem confirmação com aviso visível", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const today = companyDay("Europe/Lisbon");
  const me = {
    id: 9100,
    name: "Teste Horas",
    role: "worker",
    company_id: 9100,
    company_name: "Teste",
    time_zone: "Europe/Lisbon",
    brand_color: "#128c99",
  };
  const sites = [
    { id: 10, name: "Aurora", active: true },
    { id: 20, name: "Norte", active: true },
  ];
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/attendance/sync") return route.abort();
    const replies: Record<string, unknown> = {
      "/api/demo-users": [me],
      "/api/me": me,
      "/api/attendance/bootstrap": {
        worker: { id: 10, name: me.name },
        sites,
        suggestedSiteId: 20,
        allocations: [{ day: today, siteId: 20 }],
      },
      "/api/attendance/entries": [],
    };
    return route.fulfill({ json: replies[path] ?? [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Teste Horas/ }).click();
  await page
    .getByRole("button", { name: `Adicionar período em ${today}` })
    .click();
  const form = page.getByRole("dialog", { name: "Adicionar período" });
  await expect(form.getByLabel("Local de trabalho")).toHaveValue("20");
  await form.getByLabel("Hora de início").fill("08:00");
  await form.getByLabel("Hora de fim").fill("17:00");
  let warning = "";
  page.once("dialog", async (dialog) => {
    warning = dialog.message();
    await dialog.dismiss();
  });
  await form.getByRole("button", { name: "Aplicar" }).click();
  await expect(form).toBeVisible();
  expect(warning).toContain("9h 00m");
  expect(warning).toContain("pausas");
  await expect(
    page.getByText("Sem marcações pendentes", { exact: true }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await form.getByRole("button", { name: "Aplicar" }).click();
  await expect(form).not.toBeVisible();
  await expect(
    page.getByRole("region", { name: `Horas de ${today}`, exact: true }),
  ).toContainText("1h 00m extra (acima de 8h)");
  await expect(
    page.getByText("2 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("horas-extra-mobile.png"),
    fullPage: true,
  });
});
