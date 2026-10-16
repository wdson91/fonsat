"use client";
import { useEffect, useRef, useState } from "react";
import type { CurrentUser } from "../lib/api";
import { addDays, companyDay, monday } from "../lib/operations";
import {
  durationLabel,
  companyDayAt,
  periodEvents,
  timeInZone,
  wallTime,
  type PeriodRow,
} from "../lib/time-periods";
import type { QueueEvent } from "../lib/queue-sync";
import "./time-grid.css";

function confirmExtraTime(minutes: number) {
  return (
    minutes <= 480 ||
    window.confirm(
      `O dia terá ${durationLabel(minutes)} de trabalho, acima das 8 horas (${durationLabel(minutes - 480)} extra). Confirmou as pausas? Para descontar uma pausa, cancele e registe o trabalho antes e depois dela. Guardar mesmo assim?`,
    )
  );
}

export function TimeGrid({
  me,
  rows,
  sites,
  onAdd,
  initialWeek,
  onComplete,
  allocations = [],
  suggestedSiteId,
}: {
  me: CurrentUser;
  rows: PeriodRow[];
  sites: { id: number; name: string; active: boolean }[];
  onAdd: (events: [QueueEvent, QueueEvent]) => Promise<void>;
  allocations?: { day: string; siteId: number }[];
  suggestedSiteId?: number | null;
  initialWeek?: string;
  onComplete?: (event: QueueEvent) => Promise<void>;
}) {
  const [week, setWeek] = useState(
    initialWeek ?? monday(companyDay(me.time_zone)),
  );
  const [day, setDay] = useState<string | null>(null),
    [activity, setActivity] = useState<"work" | "break">("work");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [siteId, setSiteId] = useState("");
  const [nextDay, setNextDay] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<PeriodRow | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const today = companyDay(me.time_zone);
  function defaultSite(date: string) {
    const assigned =
      allocations.find((a) => a.day.slice(0, 10) === date)?.siteId ??
      (date === today ? suggestedSiteId : null);
    if (assigned && sites.some((site) => site.active && site.id === assigned))
      return String(assigned);
    return sites.filter((site) => site.active).length === 1
      ? String(sites.find((site) => site.active)!.id)
      : "";
  }
  const dayLabel = (instant: Date) =>
    `${instant.getUTCDate()} ${new Intl.DateTimeFormat("pt-PT", { month: "long" }).format(instant).slice(0, 3)}`;
  useEffect(() => {
    if (!day || !dialog.current) return;
    if (typeof dialog.current.showModal === "function")
      dialog.current.showModal();
    else dialog.current.setAttribute("open", "");
  }, [day]);
  function close() {
    if (typeof dialog.current?.close === "function") dialog.current.close();
    setDay(null);
    opener.current?.focus();
  }
  async function apply() {
    if (!day || busy) return;
    setError("");
    setBusy(true);
    try {
      const events = periodEvents(
        { day, start, end, nextDay, siteId: Number(siteId), activity },
        { userId: me.id, companyId: me.company_id },
        me.time_zone,
      );
      const beginning = Date.parse(events[0].occurredAt),
        ending = Date.parse(events[1].occurredAt);
      if (
        rows.some(
          (row) =>
            row.startAt &&
            beginning < (row.endAt ? Date.parse(row.endAt) : Infinity) &&
            ending > Date.parse(row.startAt),
        )
      )
        throw new Error(
          "Já existe um período neste horário. Registe o trabalho antes e depois das pausas em períodos separados.",
        );
      if (activity === "work") {
        const minutes =
          Math.floor(ending / 60000) - Math.floor(beginning / 60000);
        const dayWork = rows
          .filter(
            (row) =>
              row.day === (nextDay ? addDays(day, 1) : day) &&
              row.activity === "work",
          )
          .reduce((sum, row) => sum + row.minutes, 0);
        if (!confirmExtraTime(dayWork + minutes)) return;
      }
      await onAdd(events);
      close();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="time-grid" id="time-grid" aria-label="Grelha de horas">
      <header className="time-grid-toolbar">
        <div>
          <h3>As minhas horas</h3>
          <p>Trabalho e pausas, período a período.</p>
        </div>
        <div className="week-picker">
          <button
            type="button"
            aria-label="Semana de horas anterior"
            onClick={() => setWeek(addDays(week, -7))}
          >
            ‹
          </button>
          <span>
            {new Intl.DateTimeFormat("pt-PT", {
              day: "numeric",
              month: "short",
            }).format(new Date(`${week}T12:00:00Z`))}{" "}
            –{" "}
            {new Intl.DateTimeFormat("pt-PT", {
              day: "numeric",
              month: "short",
              year: "numeric",
            }).format(new Date(`${addDays(week, 6)}T12:00:00Z`))}
          </span>
          <button
            type="button"
            aria-label="Semana de horas seguinte"
            onClick={() => setWeek(addDays(week, 7))}
          >
            ›
          </button>
        </div>
      </header>
      {Array.from({ length: 7 }, (_, index) => addDays(week, index)).map(
        (date) => {
          const periods = rows.filter((row) => row.day === date);
          const working = periods
            .filter((row) => row.activity === "work")
            .reduce((sum, row) => sum + row.minutes, 0);
          const resting = periods
            .filter((row) => row.activity === "break")
            .reduce((sum, row) => sum + row.minutes, 0);
          const instant = new Date(`${date}T12:00:00Z`);
          return (
            <section
              className={`time-day${date === today ? " time-day-today" : ""}`}
              key={date}
              aria-label={`Horas de ${date}`}
            >
              <header className="time-day-heading">
                <div className="time-day-date">
                  <strong>{dayLabel(instant)}</strong>
                  <span>
                    {new Intl.DateTimeFormat("pt-PT", {
                      weekday: "long",
                    }).format(instant)}
                  </span>
                </div>
                <span className="day-work-total">
                  <span aria-hidden="true">◴</span> {durationLabel(working)} de
                  trabalho
                  {working > 480 && (
                    <strong className="pending-alert">
                      {" "}
                      · {durationLabel(working - 480)} extra (acima de 8h)
                    </strong>
                  )}
                </span>
                <span className="day-break-total">
                  <span aria-hidden="true">☕</span> {durationLabel(resting)} de
                  pausa
                </span>
                {periods.some((row) => row.pending) && (
                  <span className="period-pending">Por sincronizar</span>
                )}
              </header>
              {(periods.length > 0 || date === today || day === date) && (
                <table
                  className="time-grid-table"
                  aria-label={`Períodos de ${date}`}
                >
                  <thead>
                    <tr>
                      <th>Horário</th>
                      <th>Categoria</th>
                      <th>Localização</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((row) => {
                      const spansDays =
                        row.startAt &&
                        row.endAt &&
                        companyDayAt(row.startAt, me.time_zone) !==
                          companyDayAt(row.endAt, me.time_zone);
                      const dateLabel = (value: string) =>
                        new Intl.DateTimeFormat("pt-PT", {
                          timeZone: me.time_zone,
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        }).format(new Date(value));
                      return (
                        <tr key={row.id}>
                          <td>
                            <div className="time-range">
                              <time
                                className="time-box"
                                dateTime={row.startAt ?? undefined}
                              >
                                {row.startAt
                                  ? timeInZone(row.startAt, me.time_zone)
                                  : "—:—"}
                                {spansDays && (
                                  <>
                                    <br />
                                    <span className="time-box-date">
                                      {dateLabel(row.startAt!)}
                                    </span>
                                  </>
                                )}
                              </time>
                              <span>–</span>
                              <time
                                className={`time-box${!row.endAt && row.day < today ? " time-box-incomplete" : ""}`}
                                dateTime={row.endAt ?? undefined}
                              >
                                {row.endAt
                                  ? timeInZone(row.endAt, me.time_zone)
                                  : row.day < today
                                    ? "Sem saída"
                                    : "Em curso"}
                                {spansDays && (
                                  <>
                                    <br />
                                    <span className="time-box-date">
                                      {dateLabel(row.endAt!)}
                                    </span>
                                  </>
                                )}
                              </time>
                              {row.startAt && !row.endAt && onComplete && (
                                <button
                                  type="button"
                                  className="add-period"
                                  onClick={() => setClosing(row)}
                                >
                                  Concluir período
                                </button>
                              )}
                              <button
                                className="period-history"
                                type="button"
                                aria-label={`Histórico do período ${row.id}`}
                                title="Ver versão do registo"
                                onClick={() =>
                                  setHistory(history === row.id ? null : row.id)
                                }
                              >
                                ↺
                              </button>
                            </div>
                            {history === row.id && (
                              <div className="period-version">
                                <p>
                                  {row.version
                                    ? `Versão ${row.version}`
                                    : "Guardado neste dispositivo"}
                                  {row.reason ? ` · ${row.reason}` : ""}
                                </p>
                                <p>
                                  Para corrigir um registo, contacte o
                                  encarregado. O original fica preservado.
                                </p>
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`period-category period-category-${row.activity}`}
                            >
                              {row.activity === "work"
                                ? "▣ Trabalho"
                                : "☕ Pausa"}
                            </span>
                          </td>
                          <td>
                            <span className="period-location">
                              ▥ {row.siteName}
                            </span>
                            {row.pending && <small>Por sincronizar</small>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="add-period-row">
                <button
                  type="button"
                  className="add-period"
                  aria-label={`Adicionar período em ${date}`}
                  disabled={!sites.length}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setStart("");
                    setEnd("");
                    setNextDay(false);
                    setActivity("work");
                    setSiteId(defaultSite(date));
                    setError("");
                    setDay(date);
                  }}
                >
                  <span aria-hidden="true">＋</span> Adicionar
                </button>
              </div>
            </section>
          );
        },
      )}
      <p className="time-grid-note">
        As pausas ficam separadas do trabalho e não entram nas horas faturáveis.
        Os valores seguem a hora de {me.time_zone}.
      </p>
      {closing && onComplete && (
        <CompletePeriod
          me={me}
          row={closing}
          rows={rows}
          onComplete={onComplete}
          onClose={() => setClosing(null)}
        />
      )}
      {day && (
        <dialog
          ref={dialog}
          className="period-dialog"
          aria-label="Adicionar período"
          onCancel={(event) => {
            event.preventDefault();
            close();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) close();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void apply();
            }}
          >
            <h4>
              Adicionar período <span>{day}</span>
            </h4>
            <div className="activity-picker" aria-label="Categoria do período">
              <button
                type="button"
                aria-pressed={activity === "work"}
                onClick={() => setActivity("work")}
              >
                Trabalho
              </button>
              <button
                type="button"
                aria-pressed={activity === "break"}
                onClick={() => setActivity("break")}
              >
                Pausa
              </button>
            </div>
            <div className="period-inputs">
              <label>
                <span className="sr-only">Hora de início</span>
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(event) => setStart(event.target.value)}
                />
              </label>
              <span>–</span>
              <label>
                <span className="sr-only">Hora de fim</span>
                <input
                  type="time"
                  required
                  value={end}
                  onChange={(event) => setEnd(event.target.value)}
                />
              </label>
            </div>
            <label className="next-day">
              <input
                type="checkbox"
                checked={nextDay}
                onChange={(event) => {
                  setNextDay(event.target.checked);
                  if (day)
                    setSiteId(
                      defaultSite(event.target.checked ? addDays(day, 1) : day),
                    );
                }}
              />
              Começa no dia seguinte (+1d)
            </label>
            {start && end && end < start && (
              <p className="period-hint">
                O fim será registado no dia seguinte ao início.
              </p>
            )}
            <label className="period-site">
              Local de trabalho
              <select
                required
                value={siteId}
                onChange={(event) => setSiteId(event.target.value)}
              >
                <option value="">Selecionar obra…</option>
                {sites
                  .filter((site) => site.active)
                  .map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
              </select>
            </label>
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <footer>
              <button type="button" disabled={busy} onClick={close}>
                Cancelar
              </button>
              <button className="apply-period" disabled={busy}>
                Aplicar
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </section>
  );
}

function CompletePeriod({
  me,
  row,
  rows,
  onComplete,
  onClose,
}: {
  me: CurrentUser;
  row: PeriodRow;
  rows: PeriodRow[];
  onComplete: (event: QueueEvent) => Promise<void>;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [day, setDay] = useState(row.day);
  const [end, setEnd] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (typeof dialog.current?.showModal === "function")
      dialog.current.showModal();
    else dialog.current?.setAttribute("open", "");
  }, []);
  async function apply() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const occurredAt = wallTime(day, end, me.time_zone);
      const beginning = Date.parse(row.startAt!),
        ending = Date.parse(occurredAt);
      if (ending <= beginning)
        throw new Error("A saída tem de ser posterior à entrada.");
      if (
        rows.some(
          (other) =>
            other.id !== row.id &&
            other.startAt &&
            beginning < (other.endAt ? Date.parse(other.endAt) : Infinity) &&
            ending > Date.parse(other.startAt),
        )
      )
        throw new Error("Já existe outro período neste horário.");
      if (row.activity === "work") {
        const others = rows
          .filter(
            (other) =>
              other.id !== row.id &&
              other.day === row.day &&
              other.activity === "work",
          )
          .reduce((sum, other) => sum + other.minutes, 0);
        if (
          !confirmExtraTime(
            others + Math.floor(ending / 60000) - Math.floor(beginning / 60000),
          )
        )
          return;
      }
      await onComplete({
        id: crypto.randomUUID(),
        shiftId: row.id,
        siteId: row.siteId,
        kind: row.activity === "break" ? "break_out" : "out",
        occurredAt,
        userId: me.id,
        companyId: me.company_id,
      });
      onClose();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="period-dialog"
      aria-label="Concluir período"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void apply();
        }}
      >
        <h4>Concluir período</h4>
        <p>
          {row.siteName} · {row.activity === "break" ? "Pausa" : "Trabalho"}
        </p>
        <p>
          Entrada: {row.day} às {timeInZone(row.startAt!, me.time_zone)}
        </p>
        <label>
          Dia de saída
          <input
            type="date"
            required
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </label>
        <label>
          Hora de saída
          <input
            type="time"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button className="apply-period" disabled={busy}>
            Aplicar
          </button>
        </footer>
      </form>
    </dialog>
  );
}
