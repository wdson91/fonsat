import { addDays, companyDay } from "./operations";
import type { WorkEntry } from "./attendance";
import type { QueueEvent, QueueScope } from "./queue-sync";
export interface PeriodRow {
  id: string;
  day: string;
  startAt: string | null;
  endAt: string | null;
  activity: "work" | "break";
  minutes: number;
  siteId: number;
  siteName: string;
  pending: boolean;
  version?: number;
  reason?: string | null;
}
export function timeInZone(instant: string, zone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}
function wallStamp(instant: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
}
export function wallTime(day: string, time: string, zone: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  )
    throw new Error("Indique um dia e horas válidos.");
  const desired = `${day}T${time}`,
    naive = Date.parse(`${desired}:00Z`);
  if (
    !Number.isFinite(naive) ||
    new Date(naive).toISOString().slice(0, 10) !== day
  )
    throw new Error("Dia inválido.");
  let candidate = naive;
  for (let i = 0; i < 3; i++)
    candidate += naive - Date.parse(`${wallStamp(candidate, zone)}:00Z`);
  if (wallStamp(candidate, zone) !== desired)
    throw new Error("Esta hora não existe devido à mudança de hora.");
  if (
    [-7200000, -3600000, 3600000, 7200000].some(
      (delta) => wallStamp(candidate + delta, zone) === desired,
    )
  )
    throw new Error(
      "Esta hora ocorre duas vezes devido à mudança de hora. Use a marcação da hora atual ou peça uma correção ao encarregado.",
    );
  return new Date(candidate).toISOString();
}
export function periodEvents(
  input: {
    day: string;
    start: string;
    end: string;
    nextDay: boolean;
    siteId: number;
    activity: "work" | "break";
  },
  scope: QueueScope,
  zone: string,
): [QueueEvent, QueueEvent] {
  const day = input.nextDay ? addDays(input.day, 1) : input.day;
  if (input.start === input.end)
    throw new Error("O início e o fim têm de ser diferentes.");
  const startAt = wallTime(day, input.start, zone),
    endAt = wallTime(
      input.end < input.start ? addDays(day, 1) : day,
      input.end,
      zone,
    );
  if (
    !Number.isSafeInteger(input.siteId) ||
    input.siteId < 1 ||
    Date.parse(endAt) <= Date.parse(startAt)
  )
    throw new Error("Verifique as horas e o local de trabalho.");
  const shiftId = crypto.randomUUID();
  return [
    {
      ...scope,
      id: crypto.randomUUID(),
      shiftId,
      siteId: input.siteId,
      kind: input.activity === "work" ? "in" : "break_in",
      occurredAt: startAt,
    },
    {
      ...scope,
      id: crypto.randomUUID(),
      shiftId,
      siteId: input.siteId,
      kind: input.activity === "work" ? "out" : "break_out",
      occurredAt: endAt,
    },
  ];
}
export function periodRows(
  entries: WorkEntry[],
  events: QueueEvent[],
  zone: string,
  sites: { id: number; name: string }[],
): PeriodRow[] {
  const rows = new Map<string, PeriodRow>();
  for (const entry of entries)
    rows.set(entry.id, {
      id: entry.id,
      day: entry.current.workedOn.slice(0, 10),
      startAt: entry.current.startAt,
      endAt: entry.current.endAt,
      activity: entry.activity === "break" ? "break" : "work",
      minutes: entry.current.minutes ?? 0,
      siteId: entry.current.siteId,
      siteName: entry.current.site.name,
      pending: false,
      version: entry.current.number,
      reason: entry.current.reason,
    });
  for (const event of events) {
    const old = rows.get(event.shiftId),
      isStart = event.kind === "in" || event.kind === "break_in";
    const manual =
      entries.find((entry) => entry.id === event.shiftId)?.current.source ===
      "manual";
    const startAt = manual
      ? old!.startAt
      : isStart
        ? event.occurredAt
        : (old?.startAt ?? null);
    const endAt = manual
      ? old!.endAt
      : isStart
        ? (old?.endAt ?? null)
        : event.occurredAt;
    rows.set(event.shiftId, {
      id: event.shiftId,
      day: companyDayAt(startAt ?? endAt!, zone),
      startAt,
      endAt,
      activity: event.kind.startsWith("break_") ? "break" : "work",
      minutes:
        startAt && endAt
          ? Math.max(
              0,
              Math.floor(Date.parse(endAt) / 60000) -
                Math.floor(Date.parse(startAt) / 60000),
            )
          : 0,
      siteId: old?.siteId ?? event.siteId,
      siteName:
        old?.siteName ??
        sites.find((site) => site.id === event.siteId)?.name ??
        "Obra guardada",
      pending: true,
      version: old?.version,
      reason: old?.reason,
    });
  }
  return [...rows.values()].sort((a, b) =>
    (a.startAt ?? a.endAt ?? "").localeCompare(b.startAt ?? b.endAt ?? ""),
  );
}
export function companyDayAt(instant: string, zone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(instant));
}
export function durationLabel(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}
