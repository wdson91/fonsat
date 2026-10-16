import { expect, test } from "@playwright/test";
import { companyDay, monday } from "../src/lib/operations";
import { wallTime } from "../src/lib/time-periods";
import { addGridPeriod } from "./grid-helper";

test("apenas grelha: conclui entrada antiga e conserva períodos na fila ao recarregar", async ({
  page,
}) => {
  const day = monday(companyDay("Europe/Lisbon"));
  const me = {
    id: 9001,
    name: "Teste Grelha",
    role: "worker",
    company_id: 9001,
    company_name: "Teste",
    time_zone: "Europe/Lisbon",
    brand_color: "#128c99",
  };
  const site = { id: 9001, name: "Obra de teste", active: true };
  const entry = {
    id: "00000000-0000-4000-8000-000000000001",
    activity: "work",
    versions: [],
    events: [],
    current: {
      number: 1,
      siteId: site.id,
      site,
      source: "clock",
      workedOn: day,
      startAt: wallTime(day, "09:00", me.time_zone),
      endAt: null as string | null,
      minutes: null as number | null,
    },
  };
  let connected = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/attendance/sync") {
      if (!connected) return route.abort();
      return route.fulfill({
        json: {
          results: route
            .request()
            .postDataJSON()
            .events.map((event: { id: string }) => ({
              id: event.id,
              accepted: true,
            })),
        },
      });
    }
    const data: Record<string, unknown> = {
      "/api/demo-users": [me],
      "/api/me": me,
      "/api/sites": [site],
      "/api/attendance/bootstrap": {
        worker: { id: 9001, name: me.name },
        sites: [site],
        suggestedSiteId: site.id,
      },
      "/api/attendance/entries": [entry],
    };
    return route.fulfill({ json: data[path] ?? [] });
  });
  await page.goto("/");
  await page.getByRole("button", { name: /Teste Grelha/ }).click();
  await expect(
    page.getByRole("button", { name: "Concluir período" }),
  ).toBeVisible();
  await expect(
    page.getByText("Marcar a hora atual", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Registar entrada" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Concluir período" }).click();
  await page.getByLabel("Hora de saída").fill("10:00");
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(
    page.getByRole("region", { name: `Horas de ${day}`, exact: true }),
  ).toContainText("1h 00m de trabalho");
  await addGridPeriod(page);
  await expect(
    page.getByText("3 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("3 marcações pendentes de sincronização", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Concluir período" }),
  ).toHaveCount(0);
  connected = true;
  entry.current.endAt = wallTime(day, "10:00", me.time_zone);
  entry.current.minutes = 60;
  await page.getByRole("button", { name: "Sincronizar agora" }).click();
  await expect(
    page.getByText("Sem marcações pendentes", { exact: true }),
  ).toBeVisible();
});
