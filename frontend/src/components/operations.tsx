"use client";
import { useEffect, useState } from "react";
import { Billing } from "./billing";
import { Team } from "./team";
import { api, type CurrentUser } from "../lib/api";
import {
  addDays,
  command,
  companyDay,
  monday,
  type Allocation,
  type Catalog,
  type Named,
} from "../lib/operations";

export function Operations({
  me,
  selectedTab,
  onTabChange,
}: {
  me: CurrentUser;
  selectedTab?: string;
  onTabChange?: (tab: string) => void;
}) {
  const [localTab, setLocalTab] = useState("");
  const tab = selectedTab ?? localTab;
  const setTab = (value: string) => {
    setLocalTab(value);
    onTabChange?.(value);
  };
  return (
    <section className="operations" id="operations" aria-label="Operação">
      <nav className="operation-tabs" aria-label="Áreas de trabalho">
        <button
          onClick={() => setTab("planning")}
          aria-pressed={tab === "planning"}
        >
          Distribuição
        </button>
        <button onClick={() => setTab("team")} aria-pressed={tab === "team"}>
          Equipa e pendências
        </button>
        {me.role === "admin" && (
          <button
            onClick={() => setTab("billing")}
            aria-pressed={tab === "billing"}
          >
            Preços e rascunhos
          </button>
        )}
        {me.role === "admin" && (
          <button
            onClick={() => setTab("catalog")}
            aria-pressed={tab === "catalog"}
          >
            Cadastros
          </button>
        )}
      </nav>
      {tab === "billing" ? (
        <Billing key={me.id + tab} me={me} />
      ) : tab === "team" ? (
        <Team key={me.id + tab} me={me} />
      ) : (
        tab && (
          <CatalogArea
            key={me.id + tab}
            me={me}
            planning={tab === "planning"}
          />
        )
      )}
    </section>
  );
}
export function Choices({
  items,
  empty = "Selecionar…",
}: {
  items: Named[] | { id: number; name: string }[];
  empty?: string;
}) {
  return (
    <>
      <option value="">{empty}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </>
  );
}
function CatalogArea({ me, planning }: { me: CurrentUser; planning: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<Catalog>("/catalog", me.id, controller.signal)
      .then(setCatalog)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [me.id, revision]);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      {!catalog ? (
        error ? (
          <button
            onClick={() => {
              setError("");
              refresh((n) => n + 1);
            }}
          >
            Tentar carregar cadastros
          </button>
        ) : (
          <p>A carregar cadastros…</p>
        )
      ) : planning ? (
        <Planning me={me} catalog={catalog} />
      ) : (
        <CatalogEditor
          me={me}
          catalog={catalog}
          refresh={() => refresh((n) => n + 1)}
        />
      )}
    </>
  );
}
function CatalogEditor({
  me,
  catalog,
  refresh,
}: {
  me: CurrentUser;
  catalog: Catalog;
  refresh: () => void;
}) {
  const [kind, setKind] = useState<"workers" | "trades" | "clients" | "sites">(
    "workers",
  );
  const [editing, setEditing] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [responsibilityEdit, setResponsibilityEdit] = useState<{
    id: number;
    replace: boolean;
  } | null>(null);
  const responsibility = catalog.responsibilities.find(
    (r) => r.id === responsibilityEdit?.id,
  );
  const item = catalog[kind].find((i) => i.id === editing);
  async function save(form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    const data = Object.fromEntries(new FormData(form));
    const payload = {
      ...data,
      active: data.active === "on",
      ...Object.fromEntries(
        ["tradeId", "clientId", "userId"]
          .filter((k) => data[k])
          .map((k) => [k, Number(data[k])]),
      ),
    };
    try {
      await command(
        me.id,
        "/catalog/" + kind + (editing ? "/" + editing : ""),
        editing ? "PATCH" : "POST",
        payload,
      );
      setEditing(null);
      form.reset();
      refresh();
      setMessage("Cadastro guardado.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2>Cadastros da empresa</h2>
      <label>
        Cadastro
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind);
            setEditing(null);
          }}
        >
          <option value="workers">Trabalhadores</option>
          <option value="trades">Ofícios</option>
          <option value="clients">Clientes</option>
          <option value="sites">Obras</option>
        </select>
      </label>
      <form
        className="operation-form"
        key={kind + String(editing)}
        onSubmit={(e) => {
          e.preventDefault();
          void save(e.currentTarget);
        }}
      >
        <label>
          Nome
          <input
            name="name"
            required
            maxLength={500}
            defaultValue={item?.name}
          />
        </label>
        <label>
          <input
            type="checkbox"
            name="active"
            defaultChecked={item?.active ?? true}
          />{" "}
          Ativo
        </label>
        {kind === "workers" && (
          <>
            <label>
              Ofício habitual
              <select
                name="tradeId"
                required
                defaultValue={
                  item && "tradeId" in item ? String(item.tradeId) : ""
                }
              >
                <Choices items={catalog.trades.filter((t) => t.active)} />
              </select>
            </label>
            <label>
              Utilizador
              <select
                name="userId"
                defaultValue={
                  item && "userId" in item ? String(item.userId ?? "") : ""
                }
              >
                <Choices
                  items={catalog.users.filter((u) => u.role === "worker")}
                  empty="Sem utilizador"
                />
              </select>
            </label>
          </>
        )}
        {kind === "clients" && (
          <>
            <label>
              NIF
              <input
                name="taxId"
                defaultValue={item && "taxId" in item ? String(item.taxId) : ""}
              />
            </label>
            <label>
              Utilizador cliente
              <select
                name="userId"
                defaultValue={
                  item && "userId" in item ? String(item.userId ?? "") : ""
                }
              >
                <Choices
                  items={catalog.users.filter((u) => u.role === "client")}
                  empty="Sem utilizador"
                />
              </select>
            </label>
          </>
        )}
        {kind === "sites" && (
          <>
            <label>
              Cliente
              <select
                name="clientId"
                required
                defaultValue={
                  item && "clientId" in item ? String(item.clientId ?? "") : ""
                }
              >
                <Choices items={catalog.clients.filter((c) => c.active)} />
              </select>
            </label>
            <label>
              Local
              <input
                name="location"
                defaultValue={
                  item && "location" in item ? String(item.location) : ""
                }
              />
            </label>
          </>
        )}
        <button className="primary" disabled={busy}>
          {editing ? "Guardar alterações" : "Criar"}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)}>
            Cancelar
          </button>
        )}
      </form>
      {message && <p role="status">{message}</p>}
      <ul className="record-list">
        {catalog[kind].map((i) => (
          <li key={i.id}>
            <span>
              {i.name} · {i.active ? "Ativo" : "Inativo"}
            </span>
            <button onClick={() => setEditing(i.id)}>Editar {i.name}</button>
          </li>
        ))}
      </ul>
      <h3>Responsabilidade por obra</h3>
      <p>
        Adicionar permite vários encarregados na obra. Substituir termina a
        responsabilidade escolhida na véspera. O mesmo encarregado não pode ter
        períodos sobrepostos na mesma obra.
      </p>
      <form
        key={
          responsibilityEdit
            ? `${responsibilityEdit.id}-${responsibilityEdit.replace}`
            : "new-responsibility"
        }
        className="operation-form"
        aria-label="Responsabilidade por obra"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = e.currentTarget;
          const data = Object.fromEntries(new FormData(f));
          setBusy(true);
          try {
            await command(me.id, "/catalog/responsibilities", "POST", {
              ...data,
              ...(responsibilityEdit
                ? responsibilityEdit.replace
                  ? { replaceId: responsibilityEdit.id }
                  : { id: responsibilityEdit.id }
                : {}),
              siteId: Number(data.siteId),
              userId: Number(data.userId),
            });
            setResponsibilityEdit(null);
            f.reset();
            refresh();
            setMessage("Responsabilidade guardada.");
          } catch (error) {
            setMessage((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Obra
          <select
            name="siteId"
            required
            defaultValue={responsibility?.siteId ?? ""}
          >
            <Choices
              items={
                responsibilityEdit
                  ? catalog.sites.filter((s) => s.id === responsibility?.siteId)
                  : catalog.sites
              }
            />
          </select>
        </label>
        <label>
          Encarregado
          <select
            name="userId"
            required
            defaultValue={
              responsibilityEdit?.replace ? "" : (responsibility?.userId ?? "")
            }
          >
            <Choices
              items={catalog.users.filter(
                (u) =>
                  u.role === "foreman" &&
                  (!responsibilityEdit?.replace ||
                    u.id !== responsibility?.userId),
              )}
            />
          </select>
        </label>
        <label>
          Desde
          <input
            name="startsOn"
            type="date"
            required
            defaultValue={
              responsibilityEdit?.replace
                ? companyDay(me.time_zone)
                : responsibility?.startsOn.slice(0, 10)
            }
          />
        </label>
        <label>
          Até
          <input
            name="endsOn"
            type="date"
            defaultValue={responsibility?.endsOn?.slice(0, 10) ?? ""}
          />
        </label>
        <button disabled={busy}>
          {responsibilityEdit
            ? responsibilityEdit.replace
              ? "Confirmar substituição"
              : "Guardar responsabilidade"
            : "Adicionar encarregado"}
        </button>
        {responsibilityEdit && (
          <button type="button" onClick={() => setResponsibilityEdit(null)}>
            Cancelar responsabilidade
          </button>
        )}
      </form>
      <ul>
        {catalog.responsibilities.map((r) => (
          <li key={r.id}>
            {catalog.sites.find((s) => s.id === r.siteId)?.name} ·{" "}
            {catalog.users.find((u) => u.id === r.userId)?.name} ·{" "}
            {r.startsOn.slice(0, 10)} até {r.endsOn?.slice(0, 10) ?? "sem fim"}
            {catalog.responsibilities.some(
              (other) =>
                other.id !== r.id &&
                other.siteId === r.siteId &&
                other.userId === r.userId &&
                (!r.endsOn ||
                  other.startsOn.slice(0, 10) <= r.endsOn.slice(0, 10)) &&
                (!other.endsOn ||
                  r.startsOn.slice(0, 10) <= other.endsOn.slice(0, 10)),
            ) && (
              <p className="pending-alert">
                Este período sobrepõe outro do mesmo encarregado nesta obra. Use
                Editar responsabilidade para ajustar as datas.
              </p>
            )}
            <button
              type="button"
              onClick={() =>
                setResponsibilityEdit({ id: r.id, replace: false })
              }
            >
              Editar responsabilidade
            </button>
            <button
              type="button"
              onClick={() => setResponsibilityEdit({ id: r.id, replace: true })}
            >
              Substituir encarregado
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
function Planning({ me, catalog }: { me: CurrentUser; catalog: Catalog }) {
  const today = companyDay(me.time_zone);
  const [week, setWeek] = useState(monday(today)),
    [cells, setCells] = useState<Allocation[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, refresh] = useState(0);
  const [edit, setEdit] = useState<{
    id?: number;
    workerId: number;
    day: string;
    siteId?: number;
    tradeId?: number | null;
  } | null>(null);
  useEffect(() => {
    const c = new AbortController();
    api<Allocation[]>("/planning?week=" + week, me.id, c.signal)
      .then(setCells)
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [me.id, week, revision]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const editingWorker = catalog.workers.find(
    (worker) => worker.id === edit?.workerId,
  );
  const habitualTrade = catalog.trades.find(
    (trade) => trade.id === editingWorker?.tradeId,
  );
  const outsideTrade =
    edit?.tradeId && edit.tradeId !== editingWorker?.tradeId
      ? catalog.trades.find((trade) => trade.id === edit.tradeId)
      : null;
  return (
    <div>
      <h2>Distribuição semanal</h2>
      <div className="operation-tabs">
        <button onClick={() => setWeek(addDays(week, -7))}>
          Semana anterior
        </button>
        <strong>{week}</strong>
        <button onClick={() => setWeek(addDays(week, 7))}>
          Semana seguinte
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            if (
              !window.confirm(
                `Copiar a distribuição de ${addDays(week, -7)} para a semana de ${week}? Só serão preenchidas células livres; dias passados e células preenchidas serão mantidos.`,
              )
            )
              return;
            setBusy(true);
            try {
              const r = await command<{
                copied: number;
                skipped: { reason: string }[];
              }>(me.id, "/planning/copy", "POST", { week });
              setMessage(
                `${r.copied} células copiadas. ${r.skipped.map((s) => s.reason).join(" ")}`,
              );
              refresh((n) => n + 1);
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Copiar semana anterior
        </button>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Trabalhador</th>
              {days.map((d) => (
                <th key={d}>{d.slice(5)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {catalog.workers
              .filter((w) => w.active)
              .map((w) => (
                <tr key={w.id}>
                  <th scope="row" className="planning-worker">
                    <span>{w.name}</span>
                    <small>
                      Ofício habitual:{" "}
                      {catalog.trades.find((t) => t.id === w.tradeId)?.name ??
                        "Não definido"}
                    </small>
                  </th>
                  {days.map((day) => {
                    const cell = cells.find(
                      (c) => c.workerId === w.id && c.day.startsWith(day),
                    );
                    return (
                      <td key={day}>
                        <button
                          disabled={day < today}
                          onClick={() =>
                            setEdit({
                              id: cell?.id,
                              workerId: w.id,
                              day,
                              siteId: cell?.siteId,
                              tradeId: cell?.tradeId,
                            })
                          }
                        >
                          {cell
                            ? catalog.sites.find((s) => s.id === cell.siteId)
                                ?.name
                            : "Livre"}
                          {cell?.tradeId && cell.tradeId !== w.tradeId && (
                            <small className="planning-outside-trade">
                              <span aria-hidden="true">⚠ </span>
                              Fora da função:{" "}
                              {catalog.trades.find((t) => t.id === cell.tradeId)
                                ?.name ?? "Ofício não disponível"}
                            </small>
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form
          className="operation-form"
          key={edit.workerId + edit.day}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const data = Object.fromEntries(new FormData(e.currentTarget));
            try {
              await command(me.id, "/planning", "PUT", {
                workerId: edit.workerId,
                day: edit.day,
                siteId: Number(data.siteId),
                tradeId: data.tradeId ? Number(data.tradeId) : null,
              });
              setEdit(null);
              refresh((n) => n + 1);
              setMessage("Distribuição guardada.");
            } catch (error) {
              setMessage((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {catalog.workers.find((w) => w.id === edit.workerId)?.name} ·{" "}
            {edit.day}
          </p>
          <label>
            Obra
            <select name="siteId" required defaultValue={edit.siteId ?? ""}>
              <Choices items={catalog.sites.filter((s) => s.active)} />
            </select>
          </label>
          <label>
            Ofício
            <select
              name="tradeId"
              value={
                edit.tradeId === editingWorker?.tradeId
                  ? ""
                  : (edit.tradeId ?? "")
              }
              onChange={(event) =>
                setEdit({
                  ...edit,
                  tradeId: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            >
              <Choices
                items={catalog.trades.filter(
                  (t) =>
                    t.id !== editingWorker?.tradeId &&
                    (t.active || t.id === edit.tradeId),
                )}
                empty={`Ofício habitual: ${habitualTrade?.name ?? "Não definido"}`}
              />
            </select>
          </label>
          {outsideTrade && (
            <p className="planning-outside-trade" role="status">
              <span aria-hidden="true">⚠ </span>
              Fora da função habitual: {editingWorker?.name} é{" "}
              {habitualTrade?.name ?? "de ofício não definido"} e será alocado
              como {outsideTrade.name}.
            </p>
          )}
          <button disabled={busy}>Guardar distribuição</button>
          {edit.id && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await command(me.id, "/planning/" + edit.id, "DELETE", {});
                  setEdit(null);
                  refresh((n) => n + 1);
                  setMessage("Trabalhador libertado neste dia.");
                } catch (e) {
                  setMessage((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Libertar trabalhador
            </button>
          )}
          <button type="button" onClick={() => setEdit(null)}>
            Cancelar
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
