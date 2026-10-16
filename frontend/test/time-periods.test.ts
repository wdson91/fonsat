import { expect, it } from "vitest";
import { periodEvents, wallTime } from "../src/lib/time-periods";
const scope = { userId: 1, companyId: 2 };
it("resolve o fuso da empresa e relaciona os extremos com o mesmo turno", () => {
  const events = periodEvents(
    {
      day: "2026-10-16",
      start: "09:00",
      end: "13:30",
      nextDay: false,
      siteId: 1,
      activity: "work",
    },
    scope,
    "Europe/Lisbon",
  );
  expect(events.map((event) => event.occurredAt)).toEqual([
    "2026-10-16T08:00:00.000Z",
    "2026-10-16T12:30:00.000Z",
  ]);
  expect(events[0].shiftId).toBe(events[1].shiftId);
  expect(events[0].id).not.toBe(events[1].id);
});
it("suporta turno noturno e início no dia seguinte", () => {
  const events = periodEvents(
    {
      day: "2026-10-16",
      start: "22:00",
      end: "06:00",
      nextDay: true,
      siteId: 1,
      activity: "work",
    },
    scope,
    "Europe/Lisbon",
  );
  expect(events[0].occurredAt).toBe("2026-10-17T21:00:00.000Z");
  expect(events[1].occurredAt).toBe("2026-10-18T05:00:00.000Z");
});
it("não adivinha horas inexistentes ou ambíguas na mudança de hora", () => {
  expect(() => wallTime("2026-03-29", "01:30", "Europe/Lisbon")).toThrow(
    "não existe",
  );
  expect(() => wallTime("2026-10-25", "01:30", "Europe/Lisbon")).toThrow(
    "duas vezes",
  );
});
