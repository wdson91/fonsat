"use client";
import { useEffect, useState } from "react";
import { api, type CurrentUser } from "../lib/api";
import { command, companyDay, type Catalog } from "../lib/operations";
import { Choices } from "./operations";
interface Rate {
  id: number;
  clientId: number;
  tradeId: number;
  cents: number;
  startsOn: string;
  endsOn: string | null;
}
interface Detail {
  id: string;
  version: number;
  workerName: string;
  workedOn: string;
  minutes: number;
  startAt: string | null;
  endAt: string | null;
  reason: string | null;
}
interface Line {
  origin: string;
  bucket: string;
  kind: string;
  siteName: string;
  tradeName: string;
  rateCents: number;
  rateStartsOn: string;
  minutes: number;
  amountCents: number;
  after: Detail[];
}
interface Draft {
  id: string;
  period: string;
  generatedAt: string;
  snapshot: {
    client: { name: string };
    lines: Line[];
    problems: { entryId: string; message: string }[];
    totalMinutes: number;
    totalCents: number;
    roundingRule: string;
  };
  exclusions: {
    id: number;
    entryId: string;
    reason: string;
    author: { name: string };
  }[];
}
const money = (cents: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export function Billing({ me }: { me: CurrentUser }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [rates, setRates] = useState<Rate[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, refresh] = useState(0),
    [draft, setDraft] = useState<Draft | null>(null),
    [clientId, setClientId] = useState(""),
    [period, setPeriod] = useState(companyDay(me.time_zone).slice(0, 7)),
    [closing, setClosing] = useState<Rate | null>(null);
  useEffect(() => {
    const c = new AbortController();
    Promise.all([
      api<Catalog>("/catalog", me.id, c.signal),
      api<Rate[]>("/billing/rates", me.id, c.signal),
    ])
      .then(([cat, price]) => {
        if (!c.signal.aborted) {
          setCatalog(cat);
          setRates(price);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [me.id, revision]);
  async function price(form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    const d = Object.fromEntries(new FormData(form));
    try {
      const decimal = String(d.price);
      if (!/^\d+(?:[.,]\d{1,2})?$/.test(decimal))
        throw new Error("Indique o preço com até duas casas decimais.");
      const [whole, fraction = ""] = decimal.replace(",", ".").split(".");
      const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
      await command(me.id, "/billing/rates", "POST", {
        clientId: Number(d.clientId),
        tradeId: Number(d.tradeId),
        cents,
        startsOn: d.startsOn,
        endsOn: d.endsOn || null,
      });
      refresh((n) => n + 1);
      setDraft(null);
      setMessage("Preço guardado. Gere novamente o rascunho para o atualizar.");
      form.reset();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function generate() {
    setBusy(true);
    setMessage("");
    setDraft(null);
    try {
      setDraft(
        await command<Draft>(me.id, "/billing/drafts", "POST", {
          clientId: Number(clientId),
          period,
        }),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h2>Preços e faturação mensal</h2>
      {message && <p role="alert">{message}</p>}
      {!catalog ? (
        message ? (
          <button
            onClick={() => {
              setMessage("");
              refresh((n) => n + 1);
            }}
          >
            Tentar carregar preços
          </button>
        ) : (
          <p>A carregar preços…</p>
        )
      ) : (
        <>
          <details>
            <summary>Gerir preços por cliente e ofício</summary>
            <form
              className="operation-form"
              onSubmit={(e) => {
                e.preventDefault();
                void price(e.currentTarget);
              }}
            >
              <label>
                Cliente do preço
                <select name="clientId" required>
                  <Choices items={catalog.clients} />
                </select>
              </label>
              <label>
                Ofício do preço
                <select name="tradeId" required>
                  <Choices items={catalog.trades} />
                </select>
              </label>
              <label>
                Preço por hora (€)
                <input
                  name="price"
                  inputMode="decimal"
                  required
                  placeholder="12,50"
                />
              </label>
              <label>
                Válido desde
                <input name="startsOn" type="date" required />
              </label>
              <label>
                Válido até
                <input name="endsOn" type="date" />
              </label>
              <button disabled={busy}>Criar preço</button>
            </form>
            <ul className="record-list">
              {rates.map((r) => (
                <li key={r.id}>
                  <span>
                    {catalog.clients.find((c) => c.id === r.clientId)?.name} ·{" "}
                    {catalog.trades.find((t) => t.id === r.tradeId)?.name} ·{" "}
                    {money(r.cents)}/h · {r.startsOn.slice(0, 10)} até{" "}
                    {r.endsOn?.slice(0, 10) ?? "sem fim"}
                  </span>
                  <button onClick={() => setClosing(r)}>Fechar vigência</button>
                </li>
              ))}
            </ul>
            {closing && (
              <form
                className="operation-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  setBusy(true);
                  try {
                    await command(
                      me.id,
                      `/billing/rates/${closing.id}`,
                      "PATCH",
                      { endsOn: data.get("endsOn") },
                    );
                    setClosing(null);
                    setDraft(null);
                    refresh((n) => n + 1);
                    setMessage(
                      "Vigência fechada. Pode criar o preço seguinte.",
                    );
                  } catch (error) {
                    setMessage((error as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Último dia do preço
                  <input
                    type="date"
                    name="endsOn"
                    required
                    min={closing.startsOn.slice(0, 10)}
                    defaultValue={closing.endsOn?.slice(0, 10)}
                  />
                </label>
                <button disabled={busy}>Guardar fim da vigência</button>
                <button type="button" onClick={() => setClosing(null)}>
                  Cancelar
                </button>
              </form>
            )}
          </details>
          <form
            className="operation-form"
            onSubmit={(e) => {
              e.preventDefault();
              void generate();
            }}
          >
            <label>
              Cliente do rascunho
              <select
                required
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setDraft(null);
                }}
              >
                <Choices items={catalog.clients} />
              </select>
            </label>
            <label>
              Mês do rascunho
              <input
                type="month"
                required
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value);
                  setDraft(null);
                }}
              />
            </label>
            <button className="primary" disabled={busy}>
              Gerar rascunho mensal
            </button>
          </form>
          {draft && (
            <article>
              <h3>
                Rascunho · {draft.snapshot.client.name} · {draft.period}
              </h3>
              <p>
                {draft.snapshot.totalMinutes} minutos ·{" "}
                <strong>{money(draft.snapshot.totalCents)}</strong>
              </p>
              <p>
                {draft.snapshot.problems.length
                  ? `${draft.snapshot.problems.length} bloqueios por resolver`
                  : "Sem bloqueios. Revise as linhas e os registos."}
              </p>
              {draft.snapshot.problems.map((problem, index) => (
                <div className="billing-problem" key={problem.entryId + index}>
                  <p>
                    {problem.message} · Registo {problem.entryId.slice(0, 8)}
                  </p>
                  <form
                    className="operation-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const reason = new FormData(e.currentTarget).get(
                        "reason",
                      );
                      setBusy(true);
                      try {
                        await command(
                          me.id,
                          `/billing/drafts/${draft.id}/exclusions`,
                          "POST",
                          { entryId: problem.entryId, reason },
                        );
                        setDraft(
                          await command<Draft>(
                            me.id,
                            "/billing/drafts",
                            "POST",
                            { clientId: Number(clientId), period },
                          ),
                        );
                      } catch (error) {
                        setMessage((error as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      Motivo da exclusão
                      <textarea name="reason" required maxLength={500} />
                    </label>
                    <button disabled={busy}>Excluir deste rascunho</button>
                  </form>
                </div>
              ))}
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Obra / ofício</th>
                      <th>Minutos</th>
                      <th>Preço/hora</th>
                      <th>Valor</th>
                      <th>Explicação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.snapshot.lines.map((l, i) => (
                      <tr key={l.origin + l.bucket + i}>
                        <td>
                          {l.siteName} · {l.tradeName}
                          <small>Preço desde {l.rateStartsOn}</small>
                        </td>
                        <td>{l.minutes}</td>
                        <td>{money(l.rateCents)}</td>
                        <td>{money(l.amountCents)}</td>
                        <td>
                          <details>
                            <summary>Ver registos</summary>
                            {l.after.map((e) => (
                              <p key={e.id}>
                                {e.workerName} · {e.workedOn} · {e.minutes} min
                                · v{e.version}
                                {e.reason ? ` · ${e.reason}` : ""}
                              </p>
                            ))}
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>{draft.snapshot.roundingRule}</p>
              <h4>Exclusões deste rascunho</h4>
              {draft.exclusions.length === 0 ? (
                <p>Sem exclusões.</p>
              ) : (
                <ul>
                  {draft.exclusions.map((e) => (
                    <li key={e.id}>
                      {e.entryId.slice(0, 8)} · {e.reason} · {e.author.name}.
                      Elegível num período posterior.
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )}
        </>
      )}
    </div>
  );
}
