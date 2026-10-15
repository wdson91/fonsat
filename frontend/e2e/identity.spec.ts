import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("fonsat.userId"));
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeVisible();
});
test("apresenta as duas empresas e permite usar o seletor com teclado", async ({
  page,
}, info) => {
  await expect(
    page.getByRole("heading", { name: "FONSAT", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Construções Horizonte" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /João Silva/ }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "O meu dia", exact: true }),
  ).toBeVisible();
});
for (const [name, title] of [
  ["João Silva", "O meu dia"],
  ["Carlos Mendes", "As minhas obras"],
  ["Sofia Ramos", "Visão geral"],
  ["Mota Obras", "As minhas faturas"],
]) {
  test(`seleciona o perfil de ${name}`, async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
    if (name === "Carlos Mendes") {
      await expect(
        page.getByRole("heading", { name: "Edifício Aurora" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Armazém Norte" }),
      ).toHaveCount(0);
    }
  });
}
