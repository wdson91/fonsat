"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";
import {
  invoiceRequest,
  type InvoiceView,
  type InvoiceLineView,
} from "../lib/invoices";
import "./invoices.css";

const money = (cents: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );

export function InvoicesPanel({
  userId,
  role,
}: {
  userId: number;
  role: "admin" | "client";
}) {
  const [state, setState] = useState<{
    userId: number;
    documents: InvoiceView[];
    clients: { id: number; name: string }[];
  } | null>(null);
  const [selected, setSelected] = useState<InvoiceView | null>(null);
  const [clientId, setClientId] = useState("");
  const [period, setPeriod] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [retry, setRetry] = useState(0);
  const requests = useRef(new Set<AbortController>());

  useEffect(() => {
    const controller = new AbortController();
    requests.current.add(controller);
    setSelected(null);
    setError(null);
    setBusy(false);
    setStale(false);
    setClientId("");
    setPeriod("");
    setState(null);
    async function load() {
      try {
        const [documents, clients] = await Promise.all([
          invoiceRequest<InvoiceView[]>("/invoices", userId, controller.signal),
          role === "admin"
            ? invoiceRequest<{ id: number; name: string }[]>(
                "/invoices/clients",
                userId,
                controller.signal,
              )
            : Promise.resolve([]),
        ]);
        if (!controller.signal.aborted)
          setState({ userId, documents, clients });
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Não foi possível carregar as faturas.",
          );
      }
    }
    void load();
    const pending = requests.current;
    return () => {
      for (const request of pending) request.abort();
      pending.clear();
    };
  }, [userId, role, retry]);

  async function action(kind: "draft" | "issue") {
    const controller = new AbortController();
    requests.current.add(controller);
    setBusy(true);
    setError(null);
    try {
      const document =
        kind === "draft"
          ? await invoiceRequest<InvoiceView>(
              "/invoices/drafts",
              userId,
              controller.signal,
              { clientId: Number(clientId), period },
            )
          : await invoiceRequest<InvoiceView>(
              `/invoices/${selected!.id}/issue`,
              userId,
              controller.signal,
              { expectedHash: selected!.reviewHash },
            );
      if (controller.signal.aborted) return;
      setSelected(document);
      setStale(false);
      setState((previous) =>
        previous?.userId === userId
          ? {
              ...previous,
              documents: [
                document,
                ...previous.documents.filter((item) => item.id !== document.id),
              ],
            }
          : previous,
      );
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(
          failure instanceof Error
            ? failure.message
            : "Não foi possível concluir o pedido.",
        );
        if (
          kind === "issue" &&
          failure instanceof ApiError &&
          failure.status === 409
        )
          setStale(true);
      }
    } finally {
      requests.current.delete(controller);
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const current = state?.userId === userId ? state : null;
  return (
    <section className="invoices-panel" aria-label="Faturação">
      <h2>{role === "admin" ? "Faturação" : "Documentos emitidos"}</h2>
      {error && (
        <div role="alert" className="notice">
          <p>{error}</p>
          <button
            type="button"
            className="quiet"
            onClick={() => setRetry((value) => value + 1)}
          >
            Atualizar documentos
          </button>
        </div>
      )}
      {!current && !error && <p role="status">A carregar faturas…</p>}
      {current && (
        <>
          {role === "admin" && (
            <form
              className="invoice-form"
              onSubmit={(event) => {
                event.preventDefault();
                void action("draft");
              }}
            >
              <label>
                Cliente da fatura
                <select
                  required
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                >
                  <option value="">Selecionar cliente…</option>
                  {current.clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mês da fatura
                <input
                  type="month"
                  required
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                />
              </label>
              <button className="primary" disabled={busy}>
                Gerar rascunho
              </button>
            </form>
          )}
          <div className="invoice-list" aria-label="Lista de faturas">
            {current.documents.length === 0 && (
              <p>Ainda não existem documentos disponíveis.</p>
            )}
            {current.documents.map((document) => (
              <button
                type="button"
                className="invoice-choice"
                key={document.id}
                disabled={busy}
                onClick={() => {
                  setSelected(document);
                  setStale(false);
                  setError(null);
                  setClientId(String(document.client.id));
                  setPeriod(document.period);
                }}
              >
                <strong>
                  {document.number ?? "Rascunho"} · {document.client.name}
                </strong>
                <span>
                  {document.period} · {money(document.totalCents)}
                </span>
              </button>
            ))}
          </div>
          {selected && (
            <article className="invoice-document" key={selected.id}>
              <header>
                <p>
                  {selected.company.name} → {selected.client.name}
                </p>
                <h3>{selected.number ?? "Rever rascunho"}</h3>
                <p>Período: {selected.period}</p>
                {selected.issuedAt && (
                  <p>
                    Emitida em{" "}
                    {new Date(selected.issuedAt).toLocaleString("pt-PT", {
                      timeZone: selected.company.timeZone,
                    })}
                    {selected.issuedByName
                      ? ` por ${selected.issuedByName}`
                      : ""}
                  </p>
                )}
              </header>
              {selected.problems.length > 0 && (
                <div className="notice">
                  <h4>Bloqueios de emissão</h4>
                  <ul>
                    {selected.problems.map((problem, index) => (
                      <li key={`${problem.entryId}-${index}`}>
                        {problem.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(selected.exclusions?.length ?? 0) > 0 && (
                <section>
                  <h4>Registos excluídos deste mês</h4>
                  <ul>
                    {selected.exclusions!.map((entry) => (
                      <li key={entry.entryId}>
                        {entry.reason} · {entry.authorName}
                      </li>
                    ))}
                  </ul>
                  <p>
                    Estes registos mantêm-se elegíveis para faturação num mês
                    posterior.
                  </p>
                </section>
              )}
              {selected.lines.map((line, index) => (
                <Line
                  key={index}
                  line={line}
                  index={index}
                  timeZone={selected.company.timeZone}
                />
              ))}
              <p className="invoice-total">
                Total: <strong>{money(selected.totalCents)}</strong>
              </p>
              <p>{selected.roundingRule}</p>
              {selected.status === "draft" &&
                role === "admin" &&
                (stale ? (
                  <p role="status">
                    Gere um novo rascunho e reveja os valores antes de emitir.
                  </p>
                ) : (
                  <button
                    className="primary"
                    type="button"
                    disabled={
                      busy ||
                      selected.problems.length > 0 ||
                      selected.lines.length === 0
                    }
                    onClick={() => void action("issue")}
                  >
                    Emitir fatura revista
                  </button>
                ))}
            </article>
          )}
        </>
      )}
    </section>
  );
}

function Line({
  line,
  index,
  timeZone,
}: {
  line: InvoiceLineView;
  index: number;
  timeZone: string;
}) {
  const instant = (value: string) =>
    new Date(value).toLocaleString("pt-PT", { timeZone });
  return (
    <section className="invoice-line">
      <div>
        <h4>
          {line.siteName} · {line.tradeName}
        </h4>
        <p>
          {line.kind === "adjustment" ? "Ajuste" : "Trabalho do mês"} ·{" "}
          {line.minutes} minutos · {money(line.rateCents)}/hora
        </p>
        <strong>{money(line.amountCents)}</strong>
      </div>
      <details>
        <summary>Explicar linha {index + 1}</summary>
        <p>
          {line.targetCents} − {line.billedCents} = {line.amountCents} cêntimos
        </p>
        <p>
          Total corrigido: {money(line.targetCents)}. Acumulado faturado:{" "}
          {money(line.billedCents)}.
        </p>
        {line.rateStartsOn && <p>Preço em vigor desde {line.rateStartsOn}.</p>}
        {line.roundingEffectCents !== 0 && (
          <p>
            Efeito do arredondamento dos totais: {line.roundingEffectCents}{" "}
            cêntimos.
          </p>
        )}
        {line.references.length > 0 && (
          <p>
            Documentos de origem:{" "}
            {line.references.map((ref) => ref.invoiceNumber).join(", ")}
          </p>
        )}
        {(["before", "after"] as const).map((side) => (
          <div key={side}>
            <h5>
              {side === "before"
                ? "Versões retiradas"
                : "Versões acrescentadas"}
            </h5>
            {line[side].length === 0 ? (
              <p>Nenhuma.</p>
            ) : (
              <ul>
                {line[side].map((entry) => (
                  <li key={entry.id}>
                    Versão {entry.version} · {entry.workerName} ·{" "}
                    {entry.workedOn} · {entry.minutes} minutos
                    {entry.startAt && entry.endAt
                      ? ` · ${instant(entry.startAt)} → ${instant(entry.endAt)}`
                      : ""}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        {line.changes
          ?.filter((change) => change.reason)
          .map((change) => (
            <p key={change.entryId}>
              Correção {change.version}: {change.reason}
              {change.correctedBy ? ` · ${change.correctedBy}` : ""}
              {change.correctedAt ? ` · ${instant(change.correctedAt)}` : ""}
            </p>
          ))}
      </details>
    </section>
  );
}
