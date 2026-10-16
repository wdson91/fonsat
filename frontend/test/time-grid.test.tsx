import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { TimeGrid } from "../src/components/time-grid";
import type { QueueEvent } from "../src/lib/queue-sync";
const me = {
  id: 1,
  name: "João",
  role: "worker" as const,
  company_id: 1,
  company_name: "FONSAT",
  time_zone: "Europe/Lisbon",
  brand_color: "#ec405c",
};
it("apresenta os dias e o formulário Trabalho/Pausa da referência e guarda as duas marcações juntas", async () => {
  const add = vi.fn(async (_events: [QueueEvent, QueueEvent]) => {});
  render(
    <TimeGrid
      me={me}
      rows={[]}
      sites={[{ id: 10, name: "Edifício Aurora", active: true }]}
      onAdd={add}
      initialWeek="2026-10-12"
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar período em 2026-10-16" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Adicionar período" });
  expect(dialog).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Pausa" }));
  fireEvent.change(screen.getByLabelText("Hora de início"), {
    target: { value: "13:30" },
  });
  fireEvent.change(screen.getByLabelText("Hora de fim"), {
    target: { value: "13:45" },
  });
  await userEvent.selectOptions(
    screen.getByLabelText("Local de trabalho"),
    "10",
  );
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(add).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "break_in",
        occurredAt: "2026-10-16T12:30:00.000Z",
      }),
      expect.objectContaining({
        kind: "break_out",
        occurredAt: "2026-10-16T12:45:00.000Z",
      }),
    ]),
  );
  expect(add.mock.calls[0][0][0].shiftId).toBe(add.mock.calls[0][0][1].shiftId);
});
it("mostra o resumo do trabalho e das pausas e o histórico sem permitir apagar factos", async () => {
  render(
    <TimeGrid
      me={me}
      sites={[]}
      onAdd={async () => {}}
      initialWeek="2026-10-12"
      rows={[
        {
          id: "w",
          day: "2026-10-16",
          startAt: "2026-10-16T08:00:00Z",
          endAt: "2026-10-16T12:00:00Z",
          activity: "work",
          minutes: 240,
          siteId: 10,
          siteName: "Obra",
          pending: false,
          version: 2,
          reason: "Saída corrigida",
        },
        {
          id: "p",
          day: "2026-10-16",
          startAt: "2026-10-16T12:00:00Z",
          endAt: "2026-10-16T12:30:00Z",
          activity: "break",
          minutes: 30,
          siteId: 10,
          siteName: "Obra",
          pending: true,
        },
      ]}
    />,
  );
  expect(screen.getByText("4h 00m de trabalho")).toBeInTheDocument();
  expect(screen.getByText("0h 30m de pausa")).toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "Histórico do período w" }),
  );
  expect(screen.getByText(/Saída corrigida/)).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Apagar/ }),
  ).not.toBeInTheDocument();
});

it("conclui uma entrada antiga na grelha sem alterar a entrada nem criar outro período", async () => {
  const complete = vi.fn(async (_event: QueueEvent) => {});
  const row = {
    id: "old",
    day: "2026-10-16",
    startAt: "2026-10-16T08:00:00Z",
    endAt: null,
    activity: "work" as const,
    minutes: 0,
    siteId: 10,
    siteName: "Obra antiga",
    pending: false,
  };
  render(
    <TimeGrid
      me={me}
      sites={[]}
      rows={[row]}
      onAdd={vi.fn()}
      onComplete={complete}
      initialWeek="2026-10-12"
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Concluir período" }),
  );
  fireEvent.change(screen.getByLabelText("Hora de saída"), {
    target: { value: "08:00" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("posterior à entrada");
  expect(complete).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Hora de saída"), {
    target: { value: "17:00" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(complete).toHaveBeenCalledWith(
    expect.objectContaining({
      shiftId: "old",
      siteId: 10,
      kind: "out",
      occurredAt: "2026-10-16T16:00:00.000Z",
    }),
  );
});

it("pré-seleciona a obra distribuída na data escolhida, incluindo dias fora de hoje", async () => {
  render(
    <TimeGrid
      me={me}
      rows={[]}
      sites={[
        { id: 10, name: "Aurora", active: true },
        { id: 11, name: "Norte", active: true },
      ]}
      allocations={[{ day: "2026-10-17T00:00:00.000Z", siteId: 11 }]}
      suggestedSiteId={10}
      onAdd={vi.fn()}
      initialWeek="2026-10-12"
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar período em 2026-10-17" }),
  );
  expect(screen.getByLabelText("Local de trabalho")).toHaveValue("11");
});

it("pede confirmação ao ultrapassar oito horas no total do dia e permite cancelar para inserir a pausa", async () => {
  const add = vi.fn(async (_events: [QueueEvent, QueueEvent]) => {});
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <TimeGrid
      me={me}
      rows={[
        {
          id: "earlier",
          day: "2026-10-16",
          startAt: "2026-10-16T07:00:00Z",
          endAt: "2026-10-16T11:00:00Z",
          activity: "work",
          minutes: 240,
          siteId: 10,
          siteName: "Aurora",
          pending: false,
        },
      ]}
      sites={[{ id: 10, name: "Aurora", active: true }]}
      onAdd={add}
      initialWeek="2026-10-12"
    />,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Adicionar período em 2026-10-16" }),
  );
  fireEvent.change(screen.getByLabelText("Hora de início"), {
    target: { value: "13:00" },
  });
  fireEvent.change(screen.getByLabelText("Hora de fim"), {
    target: { value: "18:00" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(confirm).toHaveBeenCalledWith(expect.stringContaining("9h 00m"));
  expect(add).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  confirm.mockReturnValue(true);
  await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
  expect(add).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

it("mostra as duas datas de um período que atravessa dias no fuso da empresa", () => {
  render(
    <TimeGrid
      me={me}
      sites={[]}
      onAdd={async () => {}}
      initialWeek="2026-10-12"
      rows={[
        {
          id: "long",
          day: "2026-10-15",
          startAt: "2026-10-15T08:00:00Z",
          endAt: "2026-10-16T14:43:00Z",
          activity: "work",
          minutes: 1843,
          siteId: 10,
          siteName: "Obra",
          pending: false,
        },
        // Crosses UTC midnight, but both endpoints are 17 October in Lisbon.
        {
          id: "same-local-day",
          day: "2026-10-17",
          startAt: "2026-10-16T23:30:00Z",
          endAt: "2026-10-17T01:00:00Z",
          activity: "break",
          minutes: 90,
          siteId: 10,
          siteName: "Obra",
          pending: false,
        },
      ]}
    />,
  );
  expect(screen.getByText("15/10/2026")).toBeInTheDocument();
  expect(screen.getByText("16/10/2026")).toBeInTheDocument();
  expect(screen.getByText("15/10/2026").closest("time")).toHaveTextContent(
    "09:00",
  );
  expect(screen.getByText("16/10/2026").closest("time")).toHaveTextContent(
    "15:43",
  );
  expect(screen.getByText(/30h 43m de trabalho/)).toBeInTheDocument();
  expect(screen.queryByText("17/10/2026")).not.toBeInTheDocument();
});
