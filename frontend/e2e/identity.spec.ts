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
test("mantém a seleção após reload e volta ao seletor sem dados antigos", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Sofia Ramos/ }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Escolher outro utilizador" }).click();
  await expect(
    page.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Edifício Aurora" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("fonsat.userId")),
  ).toBeNull();
});
test("troca de empresa e mantém as obras isoladas mesmo com nomes iguais", async ({
  page,
  request,
}) => {
  const users = await (await request.get("/api/demo-users")).json();
  const first = users.find((u: { name: string }) => u.name === "Sofia Ramos");
  const second = users.find((u: { name: string }) => u.name === "Ana Martins");
  const firstSites = await (
    await request.get("/api/sites", {
      headers: { "X-User-Id": String(first.id) },
    })
  ).json();
  await page.getByRole("button", { name: /Sofia Ramos/ }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Trocar de utilizador" })
    .selectOption(String(second.id));
  await expect(page.locator(".sidebar-company")).toContainText(
    "Construções Horizonte",
  );
  await expect(page.getByText("Olá, Ana.")).toBeVisible();
  const response = await request.get(`/api/sites/${firstSites[0].id}`, {
    headers: { "X-User-Id": String(second.id) },
  });
  expect(response.status()).toBe(404);
});
test("o seletor e o ambiente funcionam num ecrã móvel sem scroll horizontal", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: /João Silva/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("seletor-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /Sofia Ramos/ }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("ambiente-mobile.png"),
    fullPage: true,
  });
});
