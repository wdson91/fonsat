"use client";
import { useEffect, useState } from "react";
import { api, ApiError, type CurrentUser } from "../lib/api";
import { command, type Catalog } from "../lib/operations";
import type { WorkEntry } from "../lib/attendance";
import { Choices } from "./operations";
interface TeamData {
  entries: WorkEntry[];
  missing: { id: number; worker: { name: string }; site: { name: string } }[];
}
function localInput(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return new Date(+d - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function Team({ me }: { me: CurrentUser }) {
  const [data, setData] = useState<TeamData | null>(null),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [editing, setEditing] = useState<WorkEntry | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [revision, refresh] = useState(0),
    [onlyPending, setOnlyPending] = useState(true);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      api<TeamData>("/attendance/team", me.id, c.signal),
      api<Catalog>("/catalog", me.id, c.signal),
    ])
      .then(([team, cat]) => {
        if (!c.signal.aborted) {
          setData(team);
          setCatalog(cat);
          setStale(false);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [me.id, revision]);
  const reload = (clearMessage = true) => {
    setEditing(null);
    if (clearMessage) setMessage("");
    refresh((n) => n + 1);
  };
  async function correct(form: HTMLFormElement) {
    if (!editing || stale) return;
    setBusy(true);
    setMessage("");
    const body = Object.fromEntries(new FormData(form));
    try {
      await command(me.id, `/attendance/${editing.id}/corrections`, "POST", {
        expectedVersion: editing.currentVersion,
        siteId: Number(body.siteId),
        tradeId: Number(body.tradeId),
        startAt: new Date(String(body.startAt)).toISOString(),
        endAt: body.endAt ? new Date(String(body.endAt)).toISOString() : null,
        reason: body.reason,
      });
      setMessage("Correção guardada; o original foi preservado.");
      reload(false);
    } catch (e) {
      setMessage((e as Error).message);
      if (e instanceof ApiError && e.status === 409) setStale(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2>Estado da equipa e pendências</h2>
      <div className="operation-tabs">
        <label>
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
          />{" "}
          Só pendências
        </label>
        <button disabled={busy} onClick={() => reload()}>
          Atualizar equipa
        </button>
      </div>
      {message && <p role="alert">{message}</p>}
      {!data ? (
        <p>
          {message
            ? "Não foi possível carregar a equipa. Use Atualizar equipa para tentar novamente."
            : "A carregar a equipa…"}
        </p>
      ) : (
        <>
          <h3>Sem entrada hoje</h3>
          {data.missing.length === 0 ? (
            <p>Sem faltas de entrada na distribuição de hoje.</p>
          ) : (
            <ul>
              {data.missing.map((m) => (
                <li key={m.id}>
                  {m.worker.name} · {m.site.name}
                </li>
              ))}
            </ul>
          )}
          <ul className="record-list">
            {data.entries
              .filter((e) => !onlyPending || e.alerts.length)
              .map((e) => (
                <li key={e.id} data-entry-id={e.id}>
                  <div>
                    <strong>
                      {e.worker.name} · {e.current.site.name}
                    </strong>
                    <p>
                      {e.current.workedOn.slice(0, 10)} ·{" "}
                      {e.current.minutes === null
                        ? "Incompleto"
                        : `${e.current.minutes} minutos`}{" "}
                      · Versão {e.currentVersion}
                      {e.overtime ? " · Horas extra" : ""}
                    </p>
                    {e.alerts.map((a) => (
                      <p className="pending-alert" key={a}>
                        {a}
                      </p>
                    ))}
                    <button
                      onClick={() => {
                        setEditing(e);
                        setStale(false);
                      }}
                    >
                      Corrigir {e.worker.name}
                    </button>
                    <details>
                      <summary>Histórico e marcações originais</summary>
                      {e.versions.map((v) => (
                        <article key={v.id}>
                          <p>
                            <strong>
                              Versão {v.number} ·{" "}
                              {v.source === "manual" ? "Correção" : "Marcações"}
                            </strong>
                          </p>
                          <p>
                            {v.startAt
                              ? new Date(v.startAt).toLocaleString("pt-PT", {
                                  timeZone: me.time_zone,
                                })
                              : "Sem entrada"}{" "}
                            →{" "}
                            {v.endAt
                              ? new Date(v.endAt).toLocaleString("pt-PT", {
                                  timeZone: me.time_zone,
                                })
                              : "Sem saída"}{" "}
                            · {v.minutes ?? "—"} min
                          </p>
                          <p>
                            {v.author.name} ·{" "}
                            {new Date(v.createdAt).toLocaleString("pt-PT", {
                              timeZone: me.time_zone,
                            })}
                            {v.reason ? ` · ${v.reason}` : ""}
                          </p>
                        </article>
                      ))}
                      <ul>
                        {e.events.map((ev) => (
                          <li key={ev.id}>
                            {ev.kind === "in" ? "Entrada" : "Saída"} ·
                            dispositivo:{" "}
                            {new Date(ev.occurredAt).toLocaleString("pt-PT", {
                              timeZone: me.time_zone,
                            })}{" "}
                            · recebida:{" "}
                            {new Date(ev.receivedAt).toLocaleString("pt-PT", {
                              timeZone: me.time_zone,
                            })}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </div>
                </li>
              ))}
          </ul>
        </>
      )}
      {editing && catalog && (
        <form
          className="operation-form"
          key={editing.id + editing.currentVersion}
          onSubmit={(e) => {
            e.preventDefault();
            void correct(e.currentTarget);
          }}
        >
          <h3>
            Corrigir {editing.worker.name} · versão {editing.currentVersion}
          </h3>
          <label>
            Obra
            <select
              name="siteId"
              required
              defaultValue={editing.current.siteId}
            >
              <Choices items={catalog.sites} />
            </select>
          </label>
          <label>
            Ofício exercido
            <select
              name="tradeId"
              required
              defaultValue={editing.current.tradeId}
            >
              <Choices items={catalog.trades} />
            </select>
          </label>
          <label>
            Entrada ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            <input
              type="datetime-local"
              name="startAt"
              required
              defaultValue={localInput(editing.current.startAt)}
            />
          </label>
          <label>
            Saída ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            <input
              type="datetime-local"
              name="endAt"
              defaultValue={localInput(editing.current.endAt)}
            />
          </label>
          <label>
            Motivo
            <textarea name="reason" required maxLength={500} />
          </label>
          <button disabled={busy || stale}>Guardar correção</button>
          <button type="button" onClick={() => setEditing(null)}>
            Cancelar
          </button>
          {stale && (
            <p>
              O registo mudou. Atualize a equipa e abra novamente a correção.
            </p>
          )}
        </form>
      )}
    </div>
  );
}
