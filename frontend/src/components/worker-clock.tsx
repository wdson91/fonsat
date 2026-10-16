'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type CurrentUser } from '../lib/api';
import {
  enqueue,
  flushQueue,
  queuedEvents,
  readShift,
  saveShift,
  type ActiveShift,
} from '../lib/clock-queue';
import { addDays, companyDay, monday } from '../lib/operations';
import type { WorkEntry } from '../lib/attendance';
interface Bootstrap {
  worker: { id: number; name: string };
  sites: { id: number; name: string; active: boolean }[];
  suggestedSiteId: number | null;
}
export function WorkerClock({ me }: { me: CurrentUser }) {
  const [data, setData] = useState<Bootstrap | null>(null),
    [entries, setEntries] = useState<WorkEntry[]>([]),
    [active, setActive] = useState<ActiveShift | null>(null),
    [siteId, setSiteId] = useState(''),
    [pending, setPending] = useState(0),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const alive = useRef(true),
    mounted = useRef<AbortController | null>(null);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const list = await api<WorkEntry[]>('/attendance/entries', me.id, signal);
      if (!signal?.aborted && alive.current) {
        setEntries(list);
        const session = await readShift(me.id);
        if (
          session?.active &&
          list.some((e) => e.id === session.active?.shiftId && e.current.endAt)
        ) {
          const queue = await queuedEvents(me.id);
          if (!queue.some((e) => e.shiftId === session.active?.shiftId)) {
            await saveShift(me.id, null);
            if (alive.current && !signal?.aborted) setActive(null);
          }
        }
      }
      return list;
    },
    [me.id],
  );
  const synchronize = useCallback(async () => {
    try {
      const r = await flushQueue(me.id, mounted.current?.signal);
      if (alive.current) {
        setPending(r.pending);
        setMessage(r.message || 'Marcações sincronizadas.');
        await refresh(mounted.current?.signal);
      }
    } catch (e) {
      if (alive.current && (e as Error).name !== 'AbortError')
        setMessage(
          'Sem sincronização. As marcações guardadas serão reenviadas. ' +
            (e as Error).message,
        );
    }
  }, [me.id, refresh]);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    mounted.current = controller;
    async function load() {
      try {
        const [session, queue] = await Promise.all([
          readShift(me.id),
          queuedEvents(me.id),
        ]);
        if (!alive.current) return;
        setActive(session?.active ?? null);
        setPending(queue.length);
        setReady(true);
        const bootstrap = await api<Bootstrap>(
          '/attendance/bootstrap',
          me.id,
          controller.signal,
        );
        if (!alive.current) return;
        setData(bootstrap);
        setSiteId(
          String(session?.active?.siteId ?? bootstrap.suggestedSiteId ?? ''),
        );
        const list = await refresh(controller.signal);
        if (!session && alive.current) {
          const open = list.find((e) => e.current.startAt && !e.current.endAt);
          if (open) {
            const restored = {
              shiftId: open.id,
              siteId: open.current.siteId,
              startAt: open.current.startAt!,
            };
            await saveShift(me.id, restored);
            if (alive.current) {
              setActive(restored);
              setSiteId(String(restored.siteId));
            }
          }
        }
        await synchronize();
      } catch (e) {
        if (alive.current && (e as Error).name !== 'AbortError')
          setMessage((e as Error).message);
      }
    }
    void load();
    const online = () => void synchronize();
    window.addEventListener('online', online);
    return () => {
      alive.current = false;
      controller.abort();
      window.removeEventListener('online', online);
    };
  }, [me.id, refresh, synchronize]);
  async function clock() {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const time = new Date().toISOString(),
        shiftId = active?.shiftId ?? crypto.randomUUID(),
        selectedSite = active?.siteId ?? Number(siteId);
      if (!selectedSite) throw new Error('Selecione uma obra.');
      const next = active
        ? null
        : { shiftId, siteId: selectedSite, startAt: time };
      await enqueue(
        {
          id: crypto.randomUUID(),
          shiftId,
          siteId: selectedSite,
          kind: active ? 'out' : 'in',
          occurredAt: time,
          userId: me.id,
        },
        next,
      );
      if (!alive.current) return;
      setActive(next);
      setPending((await queuedEvents(me.id)).length);
      setMessage('Marcação guardada no dispositivo.');
      await synchronize();
    } catch (e) {
      if (alive.current) setMessage((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const today = companyDay(me.time_zone);
  const week = monday(today);
  return (
    <section className="operations worker-clock">
      <h2>Relógio de ponto</h2>
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
          Entrada em{' '}
          {new Date(active.startAt).toLocaleString('pt-PT', {
            timeZone: me.time_zone,
          })}
          . Para uma pausa, registe a saída e uma nova entrada ao regressar.
        </p>
      )}
      {active &&
        new Intl.DateTimeFormat('en-CA', {
          timeZone: me.time_zone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date(active.startAt)) < today && (
          <p>
            Turno anterior em aberto. Contacte o seu encarregado se se esqueceu
            da saída.
          </p>
        )}
      <button
        className="primary clock-button"
        disabled={busy || !ready || (!active && !siteId)}
        onClick={() => void clock()}
      >
        {active ? 'Registar saída' : 'Registar entrada'}
      </button>
      <p role="status">
        {pending
          ? `${pending} marcações pendentes de sincronização`
          : 'Sem marcações pendentes'}
      </p>
      <button disabled={busy} onClick={() => void synchronize()}>
        Sincronizar agora
      </button>
      {message && <p role="status">{message}</p>}
      <h3>As minhas horas</h3>
      <ul className="record-list">
        {entries
          .filter(
            (e) =>
              e.current.workedOn.slice(0, 10) >= week &&
              e.current.workedOn.slice(0, 10) < addDays(week, 7),
          )
          .map((e) => (
            <li key={e.id}>
              <div>
                <strong>
                  {e.current.site.name} · {e.current.workedOn.slice(0, 10)}
                </strong>
                <p>
                  {e.current.minutes === null
                    ? 'Por completar'
                    : `${e.current.minutes} minutos`}
                  {e.overtime ? ' · Horas extra' : ''}
                </p>
                {e.current.minutes === null &&
                  e.current.workedOn.slice(0, 10) < today && (
                    <p>
                      Esqueceu-se de registar a saída? Contacte o seu
                      encarregado.
                    </p>
                  )}
                {e.alerts.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </div>
            </li>
          ))}
      </ul>
    </section>
  );
}
