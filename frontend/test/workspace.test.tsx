import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { Workspace } from "../src/components/workspace";
import {
  cachedDemoUsers,
  workerContext,
  invalidateUserContexts,
} from "../src/lib/offline-context";
vi.mock("../src/lib/offline-context", () => ({
  cachedDemoUsers: vi.fn(async () => []),
  workerContext: vi.fn(async () => null),
  saveDemoUsers: vi.fn(async () => {}),
  saveWorkerContext: vi.fn(async () => {}),
  invalidateUserContexts: vi.fn(async () => {}),
  invalidateWorkerContext: vi.fn(async () => {}),
}));
import {
  ApiError,
  getMe,
  getSites,
  listDemoUsers,
  type CurrentUser,
  type DemoUser,
} from "../src/lib/api";

vi.mock("../src/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api")>()),
  getMe: vi.fn(),
  getSites: vi.fn(),
  listDemoUsers: vi.fn(),
}));
const users: DemoUser[] = [
  {
    id: 1,
    name: "João Silva",
    role: "worker",
    company_id: 1,
    company_name: "FONSAT",
  },
  {
    id: 2,
    name: "Carlos Mendes",
    role: "foreman",
    company_id: 1,
    company_name: "FONSAT",
  },
  {
    id: 3,
    name: "Sofia Ramos",
    role: "admin",
    company_id: 1,
    company_name: "FONSAT",
  },
  {
    id: 4,
    name: "Mota Obras",
    role: "client",
    company_id: 1,
    company_name: "FONSAT",
  },
  {
    id: 5,
    name: "André Costa",
    role: "worker",
    company_id: 2,
    company_name: "Horizonte",
  },
];
const current = (id: number): CurrentUser => ({
  ...users.find((user) => user.id === id)!,
  brand_color: "#ec405c",
  time_zone: "Europe/Lisbon",
});
it("reabre offline apenas o último trabalhador com contexto previamente validado", async () => {
  localStorage.setItem("fonsat.userId", "1");
  vi.mocked(getMe).mockRejectedValue(new ApiError(0, "Sem rede"));
  vi.mocked(workerContext).mockResolvedValue({
    key: "1:1",
    userId: 1,
    companyId: 1,
    valid: true,
    me: current(1),
    bootstrap: {
      worker: { id: 1, name: "João" },
      sites: [],
      suggestedSiteId: null,
    },
    entries: [],
    savedAt: new Date().toISOString(),
  });
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "O meu dia", level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getByText(/A usar os dados guardados/)).toBeInTheDocument();
});
it("recusa offline uma seleção não preparada e conserva o seletor", async () => {
  localStorage.setItem("fonsat.userId", "1");
  vi.mocked(getMe).mockRejectedValue(new ApiError(0, "Sem rede"));
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "Quem está a usar?" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("marcações");
});
it("401 invalida o contexto guardado e não o usa como alternativa offline", async () => {
  localStorage.setItem("fonsat.userId", "1");
  vi.mocked(getMe).mockRejectedValue(new ApiError(401, "Identidade recusada"));
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "Quem está a usar?" }),
  ).toBeInTheDocument();
  expect(invalidateUserContexts).toHaveBeenCalledWith(1);
  expect(workerContext).not.toHaveBeenCalled();
});
beforeEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.mocked(listDemoUsers).mockResolvedValue(users);
  vi.mocked(getMe).mockImplementation(async (id) => current(id));
  vi.mocked(getSites).mockResolvedValue([{ id: 1, name: "Edifício Aurora" }]);
  vi.mocked(cachedDemoUsers).mockResolvedValue([]);
  vi.mocked(workerContext).mockResolvedValue(null);
});
it("agrupa os utilizadores por empresa e apresenta nome e perfil", async () => {
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "Quem está a usar?" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole("heading", { name: "FONSAT" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Horizonte" }),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /João Silva/ })).toHaveLength(1);
});
it.each([
  ["João Silva", "O meu dia", 1],
  ["Carlos Mendes", "As minhas obras", 2],
  ["Sofia Ramos", "Visão geral", 3],
  ["Mota Obras", "As minhas faturas", 4],
] as const)("seleciona %s e abre o ambiente %s", async (name, heading, id) => {
  render(<Workspace />);
  await userEvent.click(
    await screen.findByRole("button", { name: new RegExp(name) }),
  );
  expect(
    await screen.findByRole("heading", { name: heading, level: 1 }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("fonsat.userId")).toBe(String(id));
  expect(getMe).toHaveBeenCalledWith(id, expect.any(AbortSignal));
  if (id === 1 || id === 4) expect(getSites).not.toHaveBeenCalled();
});
it("recupera a seleção após recarregar", async () => {
  localStorage.setItem("fonsat.userId", "3");
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "Visão geral", level: 1 }),
  ).toBeInTheDocument();
});
it("limpa a seleção e os dados visíveis ao escolher outro utilizador", async () => {
  localStorage.setItem("fonsat.userId", "3");
  render(<Workspace />);
  await screen.findByRole("heading", { name: "Visão geral", level: 1 });
  await userEvent.click(
    screen.getByRole("button", { name: "Escolher outro utilizador" }),
  );
  expect(
    screen.getByRole("heading", { name: "Quem está a usar?" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Edifício Aurora" }),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem("fonsat.userId")).toBeNull();
});
it("descarta um identificador guardado inválido", async () => {
  localStorage.setItem("fonsat.userId", "admin");
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "Quem está a usar?" }),
  ).toBeInTheDocument();
  expect(getMe).not.toHaveBeenCalled();
  expect(localStorage.getItem("fonsat.userId")).toBeNull();
});
it("pede nova seleção quando o servidor recusa o identificador", async () => {
  localStorage.setItem("fonsat.userId", "99");
  vi.mocked(getMe).mockRejectedValue(
    new ApiError(401, "Utilizador desconhecido."),
  );
  render(<Workspace />);
  expect(
    await screen.findByRole("heading", { name: "Quem está a usar?" }),
  ).toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "A seleção já não é válida",
  );
  expect(localStorage.getItem("fonsat.userId")).toBeNull();
});
it("permite tentar novamente se a listagem falhar", async () => {
  vi.mocked(listDemoUsers).mockRejectedValueOnce(
    new ApiError(0, "Sem ligação."),
  );
  render(<Workspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Sem ligação.");
  await userEvent.click(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(
    await screen.findByRole("button", { name: /João Silva/ }),
  ).toBeInTheDocument();
});
it("recupera de uma falha ao abrir o ambiente sem apagar a seleção", async () => {
  localStorage.setItem("fonsat.userId", "3");
  vi.mocked(getMe).mockRejectedValueOnce(new ApiError(0, "Sem ligação."));
  render(<Workspace />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Sem ligação.");
  expect(localStorage.getItem("fonsat.userId")).toBe("3");
  await userEvent.click(
    screen.getByRole("button", { name: "Tentar novamente" }),
  );
  expect(
    await screen.findByRole("heading", { name: "Visão geral", level: 1 }),
  ).toBeInTheDocument();
});
it("não mostra a resposta antiga depois de trocar de utilizador", async () => {
  localStorage.setItem("fonsat.userId", "3");
  let finishOldRequest!: (me: CurrentUser) => void;
  vi.mocked(getMe).mockImplementation((id) =>
    id === 5
      ? new Promise((resolve) => {
          finishOldRequest = resolve;
        })
      : Promise.resolve(current(id)),
  );
  render(<Workspace />);
  await screen.findByRole("heading", { name: "Visão geral", level: 1 });
  const picker = screen.getByRole("combobox", { name: "Trocar de utilizador" });
  await userEvent.selectOptions(picker, "5");
  await waitFor(() => expect(finishOldRequest).toBeTypeOf("function"));
  await userEvent.click(
    screen.getByRole("button", { name: "Escolher outro utilizador" }),
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /João Silva/ }),
  );
  await screen.findByRole("heading", { name: "O meu dia", level: 1 });
  // Mesmo um transporte que ignora o cancelamento não pode publicar a resposta antiga.
  await act(async () => {
    finishOldRequest(current(5));
  });
  expect(screen.getByText("Olá, João.")).toBeInTheDocument();
  expect(screen.queryByText("Olá, André.")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Edifício Aurora" }),
  ).not.toBeInTheDocument();
});
it("a escolha funciona em memória quando não é possível persistir no browser", async () => {
  const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("bloqueado");
  });
  render(<Workspace />);
  await userEvent.click(
    await screen.findByRole("button", { name: /João Silva/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "O meu dia", level: 1 }),
  ).toBeInTheDocument();
  save.mockRestore();
});
