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
} from "../lib/clock-queue";
import {
  invalidateWorkerContext,
  saveWorkerContext,
  workerContext,
  type WorkerBootstrap,
} from "../lib/offline-context";
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
    [pending, setPending] = useState(0),
    [message, setMessage] = useState(""),
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
      const minimal = list.slice(0, 200);
      await saveWorkerContext(me, bootstrap, minimal);
      if (signal.aborted) return;
      setPrepared(true);
      onConnected?.();
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
        const [cached, queue] = await Promise.all([
          workerContext(me.id),
          queuedEvents(scope),
        ]);
        if (controller.signal.aborted) return;
        if (cached?.companyId === scope.companyId) {
          setData(cached.bootstrap);
          setEntries(cached.entries);
          setPrepared(true);
        }
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
  async function completePeriod(event: QueueEvent) {
    const controller = mounted.current;
    if (!controller || controller.signal.aborted || !ready)
      throw new Error("Aguarde a preparação dos dados.");
    if (event.userId !== scope.userId || event.companyId !== scope.companyId)
      throw new Error("A seleção mudou. Volte a abrir o formulário.");
    const session = await readShift(scope);
    await enqueue(
      event,
      session?.active?.shiftId === event.shiftId
        ? null
        : (session?.active ?? null),
    );
    if (controller.signal.aborted) return;
    setLocalEvents((previous) => [...previous, event]);
    setPending((count) => count + 1);
    setMessage("Saída guardada no dispositivo.");
    void synchronize();
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
        allocations={data?.allocations}
        suggestedSiteId={data?.suggestedSiteId}
        onAdd={addPeriod}
        onComplete={completePeriod}
      />
      <p role="status">
        {pending
          ? `${pending} marcações pendentes de sincronização`
          : "Sem marcações pendentes"}
      </p>
      <button className="sync-now" onClick={() => void synchronize()}>
        Sincronizar agora
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
