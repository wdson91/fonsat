import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { InvoicesPanel } from "../src/components/invoices";
import { invoiceRequest, type InvoiceView } from "../src/lib/invoices";
import { ApiError } from "../src/lib/api";

vi.mock("../src/lib/invoices", async (original) => ({
  ...(await original<typeof import("../src/lib/invoices")>()),
  invoiceRequest: vi.fn(),
}));
const draft: InvoiceView = {
  id: "draft-1",
  status: "draft",
  number: null,
  reviewHash: "reviewed-hash",
  period: "2026-01",
  company: { id: 1, name: "FONSAT", timeZone: "Europe/Lisbon" },
  client: { id: 10, name: "Cliente A" },
  totalCents: 50,
  totalMinutes: 30,
  problems: [],
  roundingRule: "Diferença dos totais arredondados",
  lines: [
    {
      kind: "adjustment",
      siteName: "Obra original",
      tradeName: "Pedreiro",
      minutes: 30,
      rateCents: 100,
      amountCents: 50,
      billedCents: 100,
      targetCents: 150,
      roundingEffectCents: 0,
      references: [
        { invoiceId: "invoice-1", invoiceNumber: "FT 2026/1", clientId: 10 },
      ],
      before: [
        {
          id: "entry-1",
          version: 1,
          workerName: "João",
          workedOn: "2026-01-10",
          minutes: 60,
          reason: null,
        },
      ],
      after: [
        {
          id: "entry-1",
          version: 2,
          workerName: "João",
          workedOn: "2026-01-10",
          minutes: 90,
          reason: "Corrigir saída",
        },
      ],
      changes: [
        {
          entryId: "entry-1",
          version: 2,
          reason: "Corrigir saída",
          correctedBy: "Sofia",
          correctedAt: "2026-02-01T10:00:00Z",
        },
      ],
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(invoiceRequest).mockImplementation(async (path) =>
    path === "/invoices/clients" ? [{ id: 10, name: "Cliente A" }] : [],
  );
});
it("administrativo revê o rascunho e envia a confirmação exata ao emitir", async () => {
  render(<InvoicesPanel userId={3} role="admin" />);
  await userEvent.selectOptions(
    await screen.findByLabelText("Cliente da fatura"),
    "10",
  );
  fireEvent.change(screen.getByLabelText("Mês da fatura"), {
    target: { value: "2026-01" },
  });
  vi.mocked(invoiceRequest).mockResolvedValueOnce(draft);
  await userEvent.click(screen.getByRole("button", { name: "Gerar rascunho" }));
  expect(
    await screen.findByText("Obra original · Pedreiro"),
  ).toBeInTheDocument();
  expect(screen.getByText(/150.*100.*50/)).toBeInTheDocument();
  vi.mocked(invoiceRequest).mockResolvedValueOnce({
    ...draft,
    status: "issued",
    number: "FT 2026/2",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Emitir fatura revista" }),
  );
  expect(invoiceRequest).toHaveBeenLastCalledWith(
    "/invoices/draft-1/issue",
    3,
    expect.any(AbortSignal),
    { expectedHash: "reviewed-hash" },
  );
  expect(
    await screen.findByRole("heading", { name: "FT 2026/2" }),
  ).toBeInTheDocument();
});
it("cliente vê os documentos emitidos e a explicação das versões, sem botão de emissão", async () => {
  vi.mocked(invoiceRequest).mockResolvedValue([
    { ...draft, status: "issued", number: "FT 2026/2" },
  ]);
  render(<InvoicesPanel userId={4} role="client" />);
  await userEvent.click(
    await screen.findByRole("button", { name: /FT 2026\/2/ }),
  );
  await userEvent.click(screen.getByText("Explicar linha 1"));
  expect(screen.getByText(/Versão 1/)).toBeInTheDocument();
  expect(screen.getByText(/Versão 2/)).toBeInTheDocument();
  expect(screen.getByText(/Sofia/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Emitir/ }),
  ).not.toBeInTheDocument();
  expect(invoiceRequest).toHaveBeenCalledTimes(1);
});
it("conflito de emissão exige nova revisão sem emitir automaticamente", async () => {
  vi.mocked(invoiceRequest).mockImplementation(async (path) =>
    path === "/invoices/clients" ? [{ id: 10, name: "Cliente A" }] : [draft],
  );
  render(<InvoicesPanel userId={3} role="admin" />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Rascunho/ }),
  );
  vi.mocked(invoiceRequest).mockRejectedValueOnce(
    new ApiError(409, "Os dados mudaram. Gere novo rascunho."),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Emitir fatura revista" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Os dados mudaram",
  );
  expect(
    screen.queryByRole("button", { name: "Emitir fatura revista" }),
  ).not.toBeInTheDocument();
});
it("não mostra respostas antigas após trocar de utilizador", async () => {
  let resolve!: (value: InvoiceView[]) => void;
  vi.mocked(invoiceRequest).mockImplementation((path, userId) =>
    userId === 4
      ? new Promise((done) => {
          resolve = done;
        })
      : Promise.resolve([]),
  );
  const view = render(<InvoicesPanel userId={4} role="client" />);
  await waitFor(() => expect(invoiceRequest).toHaveBeenCalled());
  view.rerender(<InvoicesPanel userId={8} role="client" />);
  await act(async () =>
    resolve([{ ...draft, status: "issued", number: "FT ANTIGA" }]),
  );
  expect(screen.queryByText("FT ANTIGA")).not.toBeInTheDocument();
});
it("rascunho bloqueado apresenta os problemas e impede emissão", async () => {
  vi.mocked(invoiceRequest).mockImplementation(async (path) =>
    path === "/invoices/clients"
      ? []
      : [
          {
            ...draft,
            problems: [{ entryId: "entry-1", message: "Preço ausente." }],
          },
        ],
  );
  render(<InvoicesPanel userId={3} role="admin" />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Rascunho/ }),
  );
  expect(screen.getByText("Preço ausente.")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Emitir fatura revista" }),
  ).toBeDisabled();
});
it("uma resposta perdida permite repetir a mesma confirmação de emissão", async () => {
  vi.mocked(invoiceRequest).mockImplementation(async (path) =>
    path === "/invoices/clients" ? [] : [draft],
  );
  render(<InvoicesPanel userId={3} role="admin" />);
  await userEvent.click(
    await screen.findByRole("button", { name: /Rascunho/ }),
  );
  vi.mocked(invoiceRequest).mockRejectedValueOnce(
    new ApiError(0, "Resposta perdida. Pode repetir o pedido."),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Emitir fatura revista" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Resposta perdida",
  );
  vi.mocked(invoiceRequest).mockResolvedValueOnce({
    ...draft,
    status: "issued",
    number: "FT 2026/2",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Emitir fatura revista" }),
  );
  expect(
    await screen.findByRole("heading", { name: "FT 2026/2" }),
  ).toBeInTheDocument();
  const confirmations = vi
    .mocked(invoiceRequest)
    .mock.calls.filter(([path]) => path.endsWith("/issue"))
    .map((call) => call[3]);
  expect(confirmations).toEqual([
    { expectedHash: draft.reviewHash },
    { expectedHash: draft.reviewHash },
  ]);
});
it("trocar de documento repõe o detalhe fechado para a nova fatura", async () => {
  vi.mocked(invoiceRequest).mockResolvedValue([
    { ...draft, id: "invoice-2", status: "issued", number: "FT 2026/2" },
    { ...draft, id: "invoice-3", status: "issued", number: "FT 2026/3" },
  ]);
  render(<InvoicesPanel userId={4} role="client" />);
  await userEvent.click(
    await screen.findByRole("button", { name: /FT 2026\/2/ }),
  );
  await userEvent.click(screen.getByText("Explicar linha 1"));
  expect(
    screen.getByText("Explicar linha 1").closest("details"),
  ).toHaveAttribute("open");
  await userEvent.click(screen.getByRole("button", { name: /FT 2026\/3/ }));
  expect(
    screen.getByText("Explicar linha 1").closest("details"),
  ).not.toHaveAttribute("open");
});
