"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError, type CurrentUser } from "../lib/api";
import {
  adoptLegacyQueue,
  enqueue,
  enqueuePeriod,
  flushQueue,
  queuedEvents,
  readShift,
  saveShift,
  type ActiveShift,
} from "../lib/clock-queue";
import {
  invalidateWorkerContext,
  saveWorkerContext,
  workerContext,
  type WorkerBootstrap,
} from "../lib/offline-context";
import { addDays, companyDay, monday } from "../lib/operations";
import type { WorkEntry } from "../lib/attendance";
import type { QueueEvent } from "../lib/queue-sync";
import { periodRows } from "../lib/time-periods";
import { TimeGrid } from "./time-grid";
export function WorkerClock({
  me,
  shellReady = false,
  onIdentityRejected,
  onConnected,
}: {
  me: CurrentUser;
  shellReady?: boolean;
  onIdentityRejected?: () => void;
  onConnected?: () => void;
}) {
  const scope = useMemo(
    () => Object.freeze({ companyId: me.company_id, userId: me.id }),
    [me.company_id, me.id],
  );
  const [data, setData] = useState<WorkerBootstrap | null>(null),
    [entries, setEntries] = useState<WorkEntry[]>([]),
    [localEvents, setLocalEvents] = useState<QueueEvent[]>([]),
    [active, setActive] = useState<ActiveShift | null>(null),
    [siteId, setSiteId] = useState(""),
    [pending, setPending] = useState(0),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [prepared, setPrepared] = useState(false),
    [ready, setReady] = useState(false);
  const mounted = useRef<AbortController | null>(null);
  const rejectIdentity = useCallback(
    async (error: unknown, signal: AbortSignal) => {
      if (error instanceof ApiError && error.status === 401) {
        await invalidateWorkerContext(scope).catch(() => {});
        if (!signal.aborted) onIdentityRejected?.();
        return true;
      }
      return false;
    },
    [scope, onIdentityRejected],
  );
  const refresh = useCallback(
    async (signal: AbortSignal) => {
      const [bootstrap, list] = await Promise.all([
        api<WorkerBootstrap>("/attendance/bootstrap", me.id, signal),
        api<WorkEntry[]>("/attendance/entries", me.id, signal),
      ]);
      if (signal.aborted) return;
      await adoptLegacyQueue(
        scope,
        bootstrap.sites.map((site) => site.id),
      );
      if (signal.aborted) return;
      setData(bootstrap);
      setEntries(list);
      setSiteId(
        (previous) => previous || String(bootstrap.suggestedSiteId ?? ""),
      );
      const minimal = list.slice(0, 200);
      await saveWorkerContext(me, bootstrap, minimal);
      if (signal.aborted) return;
      setPrepared(true);
      onConnected?.();
      const session = await readShift(scope),
        queue = await queuedEvents(scope);
      if (signal.aborted) return;
      if (
        session?.active &&
        list.some(
          (entry) =>
            entry.id === session.active?.shiftId && entry.current.endAt,
        ) &&
        !queue.some((event) => event.shiftId === session.active?.shiftId)
      ) {
        await saveShift(scope, null);
        if (!signal.aborted) setActive(null);
      } else if (session) {
        setActive(session.active);
        if (session.active) setSiteId(String(session.active.siteId));
      } else {
        const open = list.find(
          (entry) =>
            entry.activity !== "break" &&
            entry.current.startAt &&
            !entry.current.endAt,
        );
        if (open) {
          const restored = {
            shiftId: open.id,
            siteId: open.current.siteId,
            startAt: open.current.startAt!,
          };
          await saveShift(scope, restored);
          if (!signal.aborted) {
            setActive(restored);
            setSiteId(String(restored.siteId));
          }
        }
      }
      const latest = await queuedEvents(scope);
      if (!signal.aborted) {
        setPending(latest.length);
        setLocalEvents(latest);
      }
    },
    [me, scope, onConnected],
  );
  const synchronize = useCallback(async () => {
    const controller = mounted.current;
    if (!controller || controller.signal.aborted) return;
    try {
      const result = await flushQueue(scope, controller.signal);
      if (controller.signal.aborted) return;
      const latest = await queuedEvents(scope);
      if (controller.signal.aborted) return;
      setPending(latest.length);
      setMessage(result.message || "Marcações sincronizadas.");
      await refresh(controller.signal);
    } catch (error) {
      if (
        (await rejectIdentity(error, controller.signal)) ||
        controller.signal.aborted
      )
        return;
      setMessage(
        "Sem sincronização. As marcações guardadas serão reenviadas. " +
          (error as Error).message,
      );
    }
  }, [scope, refresh, rejectIdentity]);
  useEffect(() => {
    const controller = new AbortController();
    mounted.current = controller;
    async function load() {
      try {
        const [cached, session, queue] = await Promise.all([
          workerContext(me.id),
          readShift(scope),
          queuedEvents(scope),
        ]);
        if (controller.signal.aborted) return;
        if (cached?.companyId === scope.companyId) {
          setData(cached.bootstrap);
          setEntries(cached.entries);
          setPrepared(true);
          setSiteId(
            String(
              session?.active?.siteId ?? cached.bootstrap.suggestedSiteId ?? "",
            ),
          );
        }
        setActive(session?.active ?? null);
        setPending(queue.length);
        setLocalEvents(queue);
        setReady(true);
        try {
          await refresh(controller.signal);
        } catch (error) {
          if (
            (await rejectIdentity(error, controller.signal)) ||
            controller.signal.aborted
          )
            return;
          if (!(error instanceof ApiError) || error.status !== 0 || !cached)
            throw error;
          setMessage(
            "Sem ligação. Pode continuar a registar marcações neste dispositivo.",
          );
          return;
        }
        if (!controller.signal.aborted) await synchronize();
      } catch (error) {
        if (!controller.signal.aborted) setMessage((error as Error).message);
      }
    }
    void load();
    const online = () => void synchronize();
    window.addEventListener("online", online);
    const retry = window.setInterval(() => {
      if (navigator.onLine && !controller.signal.aborted)
        void queuedEvents(scope)
          .then((queue) => {
            if (queue.length && !controller.signal.aborted) void synchronize();
          })
          .catch(() => {});
    }, 4000);
    return () => {
      controller.abort();
      window.clearInterval(retry);
      window.removeEventListener("online", online);
    };
  }, [me.id, scope, refresh, synchronize, rejectIdentity]);
  async function clock() {
    const controller = mounted.current;
    if (busy || !ready || !controller || controller.signal.aborted) return;
    setBusy(true);
    try {
      const time = new Date().toISOString(),
        shiftId = active?.shiftId ?? crypto.randomUUID(),
        selectedSite = active?.siteId ?? Number(siteId);
      if (!selectedSite) throw new Error("Selecione uma obra.");
      const next = active
        ? null
        : { shiftId, siteId: selectedSite, startAt: time };
      const event: QueueEvent = {
        id: crypto.randomUUID(),
        shiftId,
        siteId: selectedSite,
        kind: active ? "out" : "in",
        occurredAt: time,
        ...scope,
      };
      await enqueue(event, next);
      if (controller.signal.aborted) return;
      setActive(next);
      setLocalEvents((previous) => [...previous, event]);
      setPending((count) => count + 1);
      setMessage("Marcação guardada no dispositivo.");
      await synchronize();
    } catch (error) {
      if (!controller.signal.aborted) setMessage((error as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function addPeriod(events: [QueueEvent, QueueEvent]) {
    const controller = mounted.current;
    if (!controller || controller.signal.aborted || !ready)
      throw new Error("Aguarde a preparação dos dados.");
    if (
      events.some(
        (event) =>
          event.userId !== scope.userId || event.companyId !== scope.companyId,
      )
    )
      throw new Error("A seleção mudou. Volte a abrir o formulário.");
    await enqueuePeriod(events);
    if (controller.signal.aborted) return;
    setLocalEvents((previous) => [...previous, ...events]);
    setPending((count) => count + 2);
    setMessage("Período guardado no dispositivo.");
    void synchronize();
  }
  const today = companyDay(me.time_zone);
  const rows = periodRows(
    entries,
    localEvents,
    me.time_zone,
    data?.sites ?? [],
  );
  return (
    <section className="operations worker-clock">
      <h2>Relógio de ponto</h2>
      {shellReady && prepared && (
        <p className="offline-ready" role="status">
          Ponto disponível offline neste dispositivo.
        </p>
      )}
      <TimeGrid
        me={me}
        rows={rows}
        sites={data?.sites ?? []}
        onAdd={addPeriod}
      />
      <div className="quick-clock">
        <h3>Marcar a hora atual</h3>
        <label>
          Obra
          <select
            value={active ? String(active.siteId) : siteId}
            disabled={!!active}
            onChange={(e) => setSiteId(e.target.value)}
          >
            <option value="">Selecionar obra…</option>
            {data?.sites
              .filter((s) => s.active || s.id === active?.siteId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </label>
        {active && (
          <p>
            Entrada em{" "}
            {new Date(active.startAt).toLocaleString("pt-PT", {
              timeZone: me.time_zone,
            })}
            . Para uma pausa, registe a saída e uma nova entrada ao regressar.
          </p>
        )}
        {active &&
          new Intl.DateTimeFormat("en-CA", {
            timeZone: me.time_zone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(active.startAt)) < today && (
            <p>
              Turno anterior em aberto. Contacte o seu encarregado se se
              esqueceu da saída.
            </p>
          )}
        <button
          className="primary clock-button"
          disabled={busy || !ready || (!active && !siteId)}
          onClick={() => void clock()}
        >
          {active ? "Registar saída" : "Registar entrada"}
        </button>
      </div>
      <p role="status">
        {pending
          ? `${pending} marcações pendentes de sincronização`
          : "Sem marcações pendentes"}
      </p>
      <button className="sync-now" disabled={busy} onClick={() => void synchronize()}>
        Sincronizar agora
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
