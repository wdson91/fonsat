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
