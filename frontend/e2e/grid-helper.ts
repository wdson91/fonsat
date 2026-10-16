import { expect, type Page } from "@playwright/test";

export async function addGridPeriod(page: Page, siteId?: number) {
  await expect(
    page.getByRole("region", { name: "Grelha de horas" }),
  ).toBeVisible();
  const days = page.locator(".time-day");
  // Use an empty Sunday so repeated runs preserve existing facts.
  for (let attempt = 0; attempt < 104; attempt++) {
    if ((await days.last().locator("tbody tr").count()) === 0) break;
    await page
      .getByRole("button", { name: "Semana de horas anterior" })
      .click();
  }
  await days
    .last()
    .getByRole("button", { name: /Adicionar período em/ })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Adicionar período",
    exact: true,
  });
  await dialog.getByLabel("Hora de início").fill("09:00");
  await dialog.getByLabel("Hora de fim").fill("10:00");
  await dialog
    .getByLabel("Local de trabalho")
    .selectOption(siteId ? String(siteId) : { index: 1 });
  await dialog.getByRole("button", { name: "Aplicar" }).click();
  await expect(dialog).not.toBeVisible();
}
