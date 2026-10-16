import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { Operations } from "../src/components/operations";
import { Team } from "../src/components/team";
import { api } from "../src/lib/api";
import type { CurrentUser } from "../src/lib/api";
import { companyDay } from "../src/lib/operations";
vi.mock("../src/lib/api", () => ({
  api: vi.fn(),
  ApiError: class extends Error {},
}));
const me: CurrentUser = {
  id: 1,
  name: "Admin",
  company_id: 1,
  company_name: "Empresa",
  role: "admin",
  time_zone: "Europe/Lisbon",
  brand_color: "#123456",
};
const catalog = {
  workers: [{ id: 10, name: "João", tradeId: 20, active: true }],
  trades: [{ id: 20, name: "Pedreiro", active: true }],
  sites: [{ id: 30, name: "Aurora", active: true }],
  clients: [],
  users: [
    { id: 2, name: "Carlos", role: "foreman" },
    { id: 3, name: "Rita", role: "foreman" },
  ],
  responsibilities: [
    { id: 40, siteId: 30, userId: 2, startsOn: "2026-01-01", endsOn: null },
  ],
};
beforeEach(() => {
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/catalog" ? catalog : ([] as any),
  );
});
it("identifica o ofício habitual e cancela a cópia da semana sem enviar comando", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<Operations me={me} selectedTab="planning" />);
  await screen.findByText("Ofício habitual: Pedreiro");
  await userEvent.click(
    screen.getByRole("button", { name: "Copiar semana anterior" }),
  );
  expect(confirm).toHaveBeenCalledWith(
    expect.stringContaining("células livres"),
  );
  expect(
    vi.mocked(api).mock.calls.some(([path]) => path === "/planning/copy"),
  ).toBe(false);
  confirm.mockReturnValue(true);
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/catalog"
      ? catalog
      : path === "/planning/copy"
        ? { copied: 1, skipped: [] }
        : ([] as any),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Copiar semana anterior" }),
  );
  await screen.findByText(/1 células copiadas/);
  confirm.mockRestore();
});
it("substitui o encarregado escolhido com referência explícita à responsabilidade anterior", async () => {
  render(<Operations me={me} selectedTab="catalog" />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Substituir encarregado" }),
  );
  const form = screen.getByRole("form", { name: "Responsabilidade por obra" });
  expect(within(form).getByLabelText("Obra")).toHaveValue("30");
  await userEvent.selectOptions(
    within(form).getByLabelText("Encarregado"),
    "3",
  );
  fireEvent.change(within(form).getByLabelText("Desde"), {
    target: { value: "2026-10-16" },
  });
  await userEvent.click(
    within(form).getByRole("button", { name: "Confirmar substituição" }),
  );
  const call = vi
    .mocked(api)
    .mock.calls.find(([path]) => path === "/catalog/responsibilities");
  expect(JSON.parse(call![3]!.body!)).toMatchObject({
    replaceId: 40,
    userId: 3,
    siteId: 30,
    startsOn: "2026-10-16",
  });
});
it("depois da correção o registo resolvido sai das pendências e continua disponível no histórico", async () => {
  let corrected = false;
  const entry = {
    id: "entry",
    worker: { name: "João" },
    currentVersion: 2,
    alerts: ["Obra diferente da distribuição deste dia."],
    observations: [],
    overtime: false,
    current: {
      siteId: 30,
      tradeId: 20,
      site: { name: "Aurora" },
      workedOn: companyDay(me.time_zone),
      minutes: 540,
      startAt: "2026-10-16T07:00:00Z",
      endAt: "2026-10-16T16:00:00Z",
    },
    versions: [],
    events: [],
  };
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === "/catalog") return catalog as any;
    if (path === "/attendance/team")
      return {
        entries: [
          {
            ...entry,
            alerts: corrected ? [] : entry.alerts,
            observations: corrected ? ["Exceção confirmada na correção."] : [],
          },
        ],
        missing: [],
      } as any;
    corrected = true;
    return {} as any;
  });
  render(<Team me={me} />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Corrigir João" }),
  );
  await userEvent.type(
    screen.getByLabelText("Motivo"),
    "Confirmo a obra e corrijo as horas.",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar correção" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Corrigir João" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByText("Sem registos pendentes de revisão."),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText("Só pendências"));
  expect(
    await screen.findByText("Exceção confirmada na correção."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Histórico e marcações originais"),
  ).toBeInTheDocument();
});

it("não duplica o ofício habitual e normaliza distribuições antigas com o mesmo ofício explícito", async () => {
  const day = companyDay(me.time_zone);
  const withTrades = {
    ...catalog,
    trades: [...catalog.trades, { id: 21, name: "Pintor", active: true }],
  };
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/catalog"
      ? withTrades
      : path.startsWith("/planning?")
        ? [{ id: 50, workerId: 10, siteId: 30, tradeId: 20, day }]
        : ([] as any),
  );
  render(<Operations me={me} selectedTab="planning" />);
  await userEvent.click(
    await screen.findByRole("button", { name: "Aurora" }),
  );
  const select = screen.getByLabelText("Ofício");
  expect(
    within(select)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Ofício habitual: Pedreiro", "Pintor"]);
  expect(select).toHaveValue("");
  expect(screen.queryByText(/Fora da função/)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Guardar distribuição" }),
  );
  const saved = vi
    .mocked(api)
    .mock.calls.find(
      ([path, , , init]) => path === "/planning" && init?.method === "PUT",
    );
  expect(JSON.parse(saved![3]!.body!)).toMatchObject({ tradeId: null });
});

it("sinaliza a alocação fora da função na célula e ao escolher o ofício alternativo", async () => {
  const day = companyDay(me.time_zone);
  const withTrades = {
    ...catalog,
    trades: [...catalog.trades, { id: 21, name: "Pintor", active: true }],
  };
  vi.mocked(api).mockImplementation(async (path) =>
    path === "/catalog"
      ? withTrades
      : path.startsWith("/planning?")
        ? [{ id: 50, workerId: 10, siteId: 30, tradeId: 21, day }]
        : ([] as any),
  );
  render(<Operations me={me} selectedTab="planning" />);
  await userEvent.click(
    await screen.findByRole("button", {
      name: /Aurora.*Fora da função: Pintor/,
    }),
  );
  expect(
    screen.getByText("Fora da função: Pintor", { exact: false }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(
    "João é Pedreiro e será alocado como Pintor",
  );
  await userEvent.selectOptions(screen.getByLabelText("Ofício"), "");
  expect(
    screen.queryByText(/será alocado como Pintor/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText("Fora da função: Pintor", { exact: false }),
  ).toBeInTheDocument();
});
